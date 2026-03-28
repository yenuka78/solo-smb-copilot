import { Receivable, ReceivableActionEvent, RecommendationConfidence } from "./types";

export type ReceivablePriority = "low" | "medium" | "high";
export type ReminderChannel = "email" | "sms" | "whatsapp" | "phone" | "other";

export type ReceivableQueueItem = Receivable & {
  amountRemaining: number;
  daysOverdue: number;
  daysSinceLastTouch: number;
  daysUntilNextFollowUp: number | null;
  followUpStale: boolean;
  followUpSnoozed: boolean;
  riskScore: number;
  priority: ReceivablePriority;
  suggestedAction: string;
  recommendedReminderChannel: ReminderChannel;
  recommendedReminderReason: string;
  recommendedReminderConfidence: RecommendationConfidence;
  recommendedReminderTags: string[];
};

export type ReceivableQueueTotals = {
  openCount: number;
  openAmount: number;
  overdueCount: number;
  overdueAmount: number;
  highRiskCount: number;
  highRiskAmount: number;
  staleCount: number;
  snoozedCount: number;
};

export type ReceivableQueueResult = {
  items: ReceivableQueueItem[];
  totals: ReceivableQueueTotals;
};

function startOfUtcDay(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function getDaysOverdue(dueDate: string, now: Date): number {
  const due = startOfUtcDay(new Date(dueDate));
  const current = startOfUtcDay(now);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((current.getTime() - due.getTime()) / msPerDay);
}

function getDaysSinceLastTouch(receivable: Receivable, now: Date): number {
  const fallback = receivable.lastReminderAt ?? receivable.updatedAt;
  const latestTouch = [receivable.updatedAt, receivable.lastReminderAt]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? fallback;

  const updated = startOfUtcDay(new Date(latestTouch));
  const current = startOfUtcDay(now);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.round((current.getTime() - updated.getTime()) / msPerDay));
}

function getDaysUntilDate(targetIsoDate: string, now: Date): number {
  const target = startOfUtcDay(new Date(targetIsoDate));
  const current = startOfUtcDay(now);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - current.getTime()) / msPerDay);
}

/**
 * Calculates a risk score (0-100) for a receivable.
 * Factors:
 * - Days overdue
 * - Remaining unpaid amount
 * - Collection status
 */
export function calculateReceivableRiskScore(receivable: Receivable, now = new Date()): number {
  if (receivable.status === "paid") return 0;

  const daysOverdue = getDaysOverdue(receivable.dueDate, now);
  const amountRemaining = Math.max(0, receivable.amount - receivable.amountPaid);

  let score = 0;

  if (daysOverdue <= -7) {
    score += 0;
  } else if (daysOverdue < 0) {
    score += 10;
  } else if (daysOverdue <= 7) {
    score += 30;
  } else if (daysOverdue <= 30) {
    score += 60;
  } else {
    score += 80;
  }

  if (amountRemaining >= 10000) score += 20;
  else if (amountRemaining >= 5000) score += 15;
  else if (amountRemaining >= 1000) score += 10;
  else if (amountRemaining >= 250) score += 5;

  if (receivable.status === "partial") {
    score -= 5;
  } else if (receivable.status === "overdue") {
    score += 5;
  }

  if (receivable.nextFollowUpDate) {
    const daysUntilFollowUp = getDaysUntilDate(receivable.nextFollowUpDate, now);
    if (daysUntilFollowUp > 0) {
      score -= 15;
    }
  }

  if (receivable.promiseDate) {
    const daysUntilPromise = getDaysUntilDate(receivable.promiseDate, now);
    if (daysUntilPromise >= 0 && daysUntilPromise <= 7) {
      score -= 5;
    }
  }

  return Math.max(0, Math.min(100, score));
}

function toPriority(score: number): ReceivablePriority {
  if (score >= 70) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function suggestedActionFor(
  item: Pick<
    ReceivableQueueItem,
    | "daysOverdue"
    | "status"
    | "amountRemaining"
    | "daysSinceLastTouch"
    | "followUpStale"
    | "followUpSnoozed"
    | "daysUntilNextFollowUp"
    | "reminderCount"
    | "promiseDate"
  >,
): string {
  if (item.status === "paid" || item.amountRemaining <= 0) {
    return "No action needed";
  }

  if (item.followUpSnoozed && (item.daysUntilNextFollowUp ?? 0) > 0) {
    return `Snoozed until follow-up date (${item.daysUntilNextFollowUp}d)`;
  }

  if (item.daysOverdue > 14) {
    if (item.reminderCount >= 2) {
      return "Escalate to phone follow-up today";
    }
    return "Send firm follow-up today";
  }

  if (item.daysOverdue >= 0 && item.followUpStale) {
    return `Follow up again today (${item.daysSinceLastTouch} days since last touch)`;
  }

  if (item.promiseDate) {
    const promisedDate = new Date(item.promiseDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `Customer promised payment by ${promisedDate}`;
  }

  if (item.daysOverdue >= 0) {
    return "Send reminder now";
  }

  return "Prepare reminder before due date";
}

type ChannelStats = Record<ReminderChannel, { remindersSent: number; convertedCount: number }>;

type AmountBucket = "micro" | "small" | "mid" | "large";
type OverdueBucket = "upcoming" | "due_now" | "overdue_1_14" | "overdue_15_plus";

type ReceivableSegment = {
  amountBucket: AmountBucket;
  overdueBucket: OverdueBucket;
};

function buildDefaultChannelStats(): ChannelStats {
  return {
    email: { remindersSent: 0, convertedCount: 0 },
    sms: { remindersSent: 0, convertedCount: 0 },
    whatsapp: { remindersSent: 0, convertedCount: 0 },
    phone: { remindersSent: 0, convertedCount: 0 },
    other: { remindersSent: 0, convertedCount: 0 },
  };
}

function isReminderAction(event: ReceivableActionEvent): boolean {
  return event.actionType === "log_reminder" || event.actionType === "bulk_log_reminder";
}

function isPaymentAction(event: ReceivableActionEvent): boolean {
  return event.actionType === "mark_paid" || event.actionType === "bulk_mark_paid" || event.actionType === "mark_partial";
}

function normalizeCustomerKey(customerName: string): string {
  return customerName.trim().toLowerCase();
}

function toAmountBucket(invoiceAmount: number): AmountBucket {
  if (invoiceAmount >= 10000) return "large";
  if (invoiceAmount >= 3000) return "mid";
  if (invoiceAmount >= 800) return "small";
  return "micro";
}

function toOverdueBucket(daysOverdue: number): OverdueBucket {
  if (daysOverdue < 0) return "upcoming";
  if (daysOverdue === 0) return "due_now";
  if (daysOverdue <= 14) return "overdue_1_14";
  return "overdue_15_plus";
}

function buildSegment(amountRemaining: number, daysOverdue: number): ReceivableSegment {
  return {
    amountBucket: toAmountBucket(amountRemaining),
    overdueBucket: toOverdueBucket(daysOverdue),
  };
}

function segmentKey(segment: ReceivableSegment): string {
  return `${segment.amountBucket}|${segment.overdueBucket}`;
}

function segmentTagLabels(segment: ReceivableSegment): string[] {
  return [`amount:${segment.amountBucket}`, `timing:${segment.overdueBucket}`];
}

function confidenceFromSample(sampleSize: number): RecommendationConfidence {
  if (sampleSize >= 5) return "high";
  if (sampleSize >= 3) return "medium";
  return "low";
}

function pickBestChannel(stats: ChannelStats): {
  channel: ReminderChannel;
  remindersSent: number;
  convertedCount: number;
  conversionRate: number;
  hasHistory: boolean;
} {
  const channels = Object.keys(stats) as ReminderChannel[];
  let best: {
    channel: ReminderChannel;
    remindersSent: number;
    convertedCount: number;
    conversionRate: number;
    hasHistory: boolean;
  } = {
    channel: "email",
    remindersSent: 0,
    convertedCount: 0,
    conversionRate: 0,
    hasHistory: false,
  };

  for (const channel of channels) {
    const entry = stats[channel];
    const conversionRate = entry.remindersSent > 0 ? entry.convertedCount / entry.remindersSent : 0;

    if (!best.hasHistory && entry.remindersSent > 0) {
      best = {
        channel,
        remindersSent: entry.remindersSent,
        convertedCount: entry.convertedCount,
        conversionRate,
        hasHistory: true,
      };
      continue;
    }

    if (!best.hasHistory) continue;

    if (conversionRate > best.conversionRate) {
      best = {
        channel,
        remindersSent: entry.remindersSent,
        convertedCount: entry.convertedCount,
        conversionRate,
        hasHistory: true,
      };
      continue;
    }

    if (conversionRate === best.conversionRate && entry.remindersSent > best.remindersSent) {
      best = {
        channel,
        remindersSent: entry.remindersSent,
        convertedCount: entry.convertedCount,
        conversionRate,
        hasHistory: true,
      };
    }
  }

  return best;
}

function buildChannelRecommendationMap(receivables: Receivable[], events: ReceivableActionEvent[]) {
  const receivableById = new Map(receivables.map((receivable) => [receivable.id, receivable]));
  const customerStats = new Map<string, ChannelStats>();
  const segmentStats = new Map<string, ChannelStats>();
  const customerSegmentStats = new Map<string, Map<string, ChannelStats>>();
  const globalStats = buildDefaultChannelStats();
  const latestReminderByReceivable = new Map<
    string,
    {
      channel: ReminderChannel;
      at: number;
      customerKey: string;
      segmentKey: string;
    }
  >();

  const sortedEvents = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const event of sortedEvents) {
    const receivable = receivableById.get(event.receivableId);
    if (!receivable) continue;

    const customerKey = normalizeCustomerKey(receivable.customerName);
    if (!customerStats.has(customerKey)) {
      customerStats.set(customerKey, buildDefaultChannelStats());
    }

    if (!customerSegmentStats.has(customerKey)) {
      customerSegmentStats.set(customerKey, new Map<string, ChannelStats>());
    }

    const eventMoment = new Date(event.createdAt);
    const eventInvoiceAmount = Math.max(0, receivable.amount);
    const eventDaysOverdue = getDaysOverdue(receivable.dueDate, eventMoment);
    const eventSegment = buildSegment(eventInvoiceAmount, eventDaysOverdue);
    const eventSegmentKey = segmentKey(eventSegment);

    if (!segmentStats.has(eventSegmentKey)) {
      segmentStats.set(eventSegmentKey, buildDefaultChannelStats());
    }

    const customerSegmentMap = customerSegmentStats.get(customerKey)!;
    if (!customerSegmentMap.has(eventSegmentKey)) {
      customerSegmentMap.set(eventSegmentKey, buildDefaultChannelStats());
    }

    const customerChannelStats = customerStats.get(customerKey)!;
    const segmentChannelStats = segmentStats.get(eventSegmentKey)!;
    const customerSegmentChannelStats = customerSegmentMap.get(eventSegmentKey)!;

    if (isReminderAction(event) && event.channel) {
      const channel = event.channel as ReminderChannel;
      if (!Object.prototype.hasOwnProperty.call(globalStats, channel)) continue;

      globalStats[channel].remindersSent += 1;
      customerChannelStats[channel].remindersSent += 1;
      segmentChannelStats[channel].remindersSent += 1;
      customerSegmentChannelStats[channel].remindersSent += 1;

      const reminderAt = eventMoment.getTime();
      if (!Number.isNaN(reminderAt)) {
        latestReminderByReceivable.set(event.receivableId, {
          channel,
          at: reminderAt,
          customerKey,
          segmentKey: eventSegmentKey,
        });
      }

      continue;
    }

    if (isPaymentAction(event)) {
      const reminder = latestReminderByReceivable.get(event.receivableId);
      if (!reminder) continue;

      const paymentAt = new Date(event.createdAt).getTime();
      if (Number.isNaN(paymentAt) || paymentAt < reminder.at) continue;

      globalStats[reminder.channel].convertedCount += 1;
      customerChannelStats[reminder.channel].convertedCount += 1;

      const segmentForReminder = segmentStats.get(reminder.segmentKey);
      if (segmentForReminder) {
        segmentForReminder[reminder.channel].convertedCount += 1;
      }

      const customerSegmentForReminder = customerSegmentStats.get(reminder.customerKey)?.get(reminder.segmentKey);
      if (customerSegmentForReminder) {
        customerSegmentForReminder[reminder.channel].convertedCount += 1;
      }

      latestReminderByReceivable.delete(event.receivableId);
    }
  }

  const globalBest = pickBestChannel(globalStats);

  return {
    recommendFor(receivable: Receivable, now: Date): {
      channel: ReminderChannel;
      reason: string;
      confidence: RecommendationConfidence;
      tags: string[];
    } {
      const customerKey = normalizeCustomerKey(receivable.customerName);
      const invoiceAmount = Math.max(0, receivable.amount);
      const daysOverdue = getDaysOverdue(receivable.dueDate, now);
      const currentSegment = buildSegment(invoiceAmount, daysOverdue);
      const currentSegmentKey = segmentKey(currentSegment);

      const customerSegmentBest = customerSegmentStats.get(customerKey)?.get(currentSegmentKey);
      const bestForCustomerSegment = customerSegmentBest ? pickBestChannel(customerSegmentBest) : null;

      if (bestForCustomerSegment && bestForCustomerSegment.hasHistory && bestForCustomerSegment.remindersSent >= 2) {
        return {
          channel: bestForCustomerSegment.channel,
          confidence: confidenceFromSample(bestForCustomerSegment.remindersSent),
          reason: `Best for this customer in similar invoices: ${bestForCustomerSegment.convertedCount}/${bestForCustomerSegment.remindersSent} paid (${Math.round(bestForCustomerSegment.conversionRate * 100)}%)`,
          tags: ["source:customer_segment", ...segmentTagLabels(currentSegment)],
        };
      }

      const segmentBest = segmentStats.get(currentSegmentKey);
      const bestForSegment = segmentBest ? pickBestChannel(segmentBest) : null;

      if (bestForSegment && bestForSegment.hasHistory && bestForSegment.remindersSent >= 3) {
        return {
          channel: bestForSegment.channel,
          confidence: confidenceFromSample(bestForSegment.remindersSent),
          reason: `Best for similar invoice profile: ${bestForSegment.convertedCount}/${bestForSegment.remindersSent} paid (${Math.round(bestForSegment.conversionRate * 100)}%)`,
          tags: ["source:segment", ...segmentTagLabels(currentSegment)],
        };
      }

      const customerBest = customerStats.get(customerKey);
      const bestForCustomer = customerBest ? pickBestChannel(customerBest) : null;

      if (bestForCustomer && bestForCustomer.hasHistory && bestForCustomer.remindersSent >= 2) {
        return {
          channel: bestForCustomer.channel,
          confidence: confidenceFromSample(bestForCustomer.remindersSent),
          reason: `Best for this customer: ${bestForCustomer.convertedCount}/${bestForCustomer.remindersSent} paid (${Math.round(bestForCustomer.conversionRate * 100)}%)`,
          tags: ["source:customer", ...segmentTagLabels(currentSegment)],
        };
      }

      if (globalBest.hasHistory && globalBest.remindersSent >= 3) {
        return {
          channel: globalBest.channel,
          confidence: confidenceFromSample(globalBest.remindersSent),
          reason: `Best overall channel: ${globalBest.convertedCount}/${globalBest.remindersSent} paid (${Math.round(globalBest.conversionRate * 100)}%)`,
          tags: ["source:global", ...segmentTagLabels(currentSegment)],
        };
      }

      const fallbackChannel = receivable.lastReminderChannel ?? "email";
      return {
        channel: fallbackChannel,
        confidence: "low",
        reason:
          receivable.lastReminderChannel !== undefined
            ? `Reusing last channel (${receivable.lastReminderChannel}) until more history is available`
            : "Defaulting to email until reminder performance data builds up",
        tags: ["source:fallback", ...segmentTagLabels(currentSegment)],
      };
    },
  };
}

function capRecommendationConfidence(
  confidence: RecommendationConfidence,
  maxRecommendedConfidence?: RecommendationConfidence,
): RecommendationConfidence {
  if (!maxRecommendedConfidence) return confidence;

  const rank: Record<RecommendationConfidence, number> = { low: 0, medium: 1, high: 2 };
  return rank[confidence] <= rank[maxRecommendedConfidence] ? confidence : maxRecommendedConfidence;
}

export function buildReceivablesQueue(
  receivables: Receivable[],
  now = new Date(),
  actionEvents: ReceivableActionEvent[] = [],
  options?: { maxRecommendedConfidence?: RecommendationConfidence },
): ReceivableQueueResult {
  const openItems = receivables.filter((r) => r.status !== "paid");
  const recommender = buildChannelRecommendationMap(receivables, actionEvents);

  const items = openItems
    .map((r) => {
      const amountRemaining = Math.max(0, r.amount - r.amountPaid);
      const daysOverdue = getDaysOverdue(r.dueDate, now);
      const daysSinceLastTouch = getDaysSinceLastTouch(r, now);
      const daysUntilNextFollowUp = r.nextFollowUpDate ? getDaysUntilDate(r.nextFollowUpDate, now) : null;
      const followUpSnoozed = daysUntilNextFollowUp !== null && daysUntilNextFollowUp > 0;
      const followUpStale = !followUpSnoozed && daysOverdue >= 0 && daysSinceLastTouch >= 7;
      const riskScore = calculateReceivableRiskScore(r, now);
      const priority = toPriority(riskScore);

      const recommendation = recommender.recommendFor(r, now);

      const queueItem: ReceivableQueueItem = {
        ...r,
        amountRemaining,
        daysOverdue,
        daysSinceLastTouch,
        daysUntilNextFollowUp,
        followUpStale,
        followUpSnoozed,
        riskScore,
        priority,
        suggestedAction: suggestedActionFor({
          daysOverdue,
          status: r.status,
          amountRemaining,
          daysSinceLastTouch,
          followUpStale,
          followUpSnoozed,
          daysUntilNextFollowUp,
          reminderCount: r.reminderCount ?? 0,
          promiseDate: r.promiseDate,
        }),
        recommendedReminderChannel: recommendation.channel,
        recommendedReminderReason: recommendation.reason,
        recommendedReminderConfidence: capRecommendationConfidence(
          recommendation.confidence,
          options?.maxRecommendedConfidence,
        ),
        recommendedReminderTags: recommendation.tags,
      };

      return queueItem;
    })
    .sort((a, b) => {
      if (a.followUpSnoozed !== b.followUpSnoozed) return Number(a.followUpSnoozed) - Number(b.followUpSnoozed);
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      if (a.followUpStale !== b.followUpStale) return Number(b.followUpStale) - Number(a.followUpStale);
      if (b.daysSinceLastTouch !== a.daysSinceLastTouch) return b.daysSinceLastTouch - a.daysSinceLastTouch;
      if (b.amountRemaining !== a.amountRemaining) return b.amountRemaining - a.amountRemaining;
      return a.dueDate.localeCompare(b.dueDate);
    });

  const totals: ReceivableQueueTotals = {
    openCount: items.length,
    openAmount: items.reduce((sum, item) => sum + item.amountRemaining, 0),
    overdueCount: items.filter((item) => item.daysOverdue > 0).length,
    overdueAmount: items
      .filter((item) => item.daysOverdue > 0)
      .reduce((sum, item) => sum + item.amountRemaining, 0),
    highRiskCount: items.filter((item) => item.priority === "high").length,
    highRiskAmount: items
      .filter((item) => item.priority === "high")
      .reduce((sum, item) => sum + item.amountRemaining, 0),
    staleCount: items.filter((item) => item.followUpStale).length,
    snoozedCount: items.filter((item) => item.followUpSnoozed).length,
  };

  return { items, totals };
}

/**
 * Generates a reminder draft for a receivable.
 */
export function generateReminderDraft(receivable: Receivable, now = new Date()): string {
  const amountRemaining = Math.max(0, receivable.amount - receivable.amountPaid);
  const dueDate = new Date(receivable.dueDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const daysOverdue = getDaysOverdue(receivable.dueDate, now);

  const timingLine =
    daysOverdue > 0
      ? `The invoice is now ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue.`
      : daysOverdue === 0
        ? "The invoice is due today."
        : `The invoice is due in ${Math.abs(daysOverdue)} day${Math.abs(daysOverdue) === 1 ? "" : "s"}.`;

  return `Hi ${receivable.customerName},\n\nThis is a friendly reminder that your payment of ${amountRemaining.toFixed(
    2
  )} for "${
    receivable.description || "our services"
  }" was due on ${dueDate}. ${timingLine}\n\nPlease let us know when we can expect the payment.\n\nBest regards,\n[Your Name]`;
}
