import {
  Receivable,
  ReceivableActionEvent,
  ReceivableActionType,
  ReceivableRecommendationCalibration,
  RecommendationConfidence,
} from "./types";

type ActionCounts = {
  update: number;
  mark_paid: number;
  mark_partial: number;
  snooze: number;
  set_promise_date: number;
  bulk_mark_paid: number;
  bulk_snooze: number;
  log_reminder: number;
  bulk_log_reminder: number;
};

type ReminderChannelCounts = {
  email: number;
  sms: number;
  whatsapp: number;
  phone: number;
  other: number;
};

type ReminderChannelPerformanceEntry = {
  remindersSent: number;
  convertedCount: number;
  convertedAmount: number;
  conversionRate: number;
};

type ReminderChannelPerformance = {
  email: ReminderChannelPerformanceEntry;
  sms: ReminderChannelPerformanceEntry;
  whatsapp: ReminderChannelPerformanceEntry;
  phone: ReminderChannelPerformanceEntry;
  other: ReminderChannelPerformanceEntry;
};

type SegmentBacktestEntry = {
  segmentKey: string;
  amountBucket: "micro" | "small" | "mid" | "large";
  overdueBucket: "upcoming" | "due_now" | "overdue_1_14" | "overdue_15_plus";
  remindersEvaluated: number;
  predictedConversions: number;
  realizedConversions: number;
  predictedCollectedAmount: number;
  realizedCollectedAmount: number;
};

type ChannelBacktestEntry = {
  remindersEvaluated: number;
  matchedRecommendationCount: number;
  predictedConversions: number;
  realizedConversions: number;
  predictedCollectedAmount: number;
  realizedCollectedAmount: number;
};

type RecommendationBacktest = {
  remindersEvaluated: number;
  remindersWithRecommendation: number;
  matchedRecommendationCount: number;
  recommendationMatchRate: number;
  predictedConversions: number;
  realizedConversions: number;
  predictedCollectedAmount: number;
  realizedCollectedAmount: number;
  byChannel: {
    email: ChannelBacktestEntry;
    sms: ChannelBacktestEntry;
    whatsapp: ChannelBacktestEntry;
    phone: ChannelBacktestEntry;
    other: ChannelBacktestEntry;
  };
  bySegment: SegmentBacktestEntry[];
};

export type ReceivableAnalyticsSlice = {
  actionCounts: ActionCounts;
  reminderChannelCounts: ReminderChannelCounts;
  reminderChannelPerformance: ReminderChannelPerformance;
  recommendationBacktest: RecommendationBacktest;
  totalLoggedActions: number;
  remindersSent: number;
  paymentsCollectedCount: number;
  paymentsCollectedAmount: number;
  reminderToPaidCount: number;
  reminderToPaidAmount: number;
  reminderToPaidRate: number;
};

export type ReceivableAnalytics = {
  lifetime: ReceivableAnalyticsSlice;
  windows: {
    "7d": ReceivableAnalyticsSlice;
    "30d": ReceivableAnalyticsSlice;
  };
};

function buildDefaultActionCounts(): ActionCounts {
  return {
    update: 0,
    mark_paid: 0,
    mark_partial: 0,
    snooze: 0,
    set_promise_date: 0,
    bulk_mark_paid: 0,
    bulk_snooze: 0,
    log_reminder: 0,
    bulk_log_reminder: 0,
  };
}

function buildDefaultReminderChannelCounts(): ReminderChannelCounts {
  return {
    email: 0,
    sms: 0,
    whatsapp: 0,
    phone: 0,
    other: 0,
  };
}

function buildDefaultReminderChannelPerformanceEntry(): ReminderChannelPerformanceEntry {
  return {
    remindersSent: 0,
    convertedCount: 0,
    convertedAmount: 0,
    conversionRate: 0,
  };
}

function buildDefaultReminderChannelPerformance(): ReminderChannelPerformance {
  return {
    email: buildDefaultReminderChannelPerformanceEntry(),
    sms: buildDefaultReminderChannelPerformanceEntry(),
    whatsapp: buildDefaultReminderChannelPerformanceEntry(),
    phone: buildDefaultReminderChannelPerformanceEntry(),
    other: buildDefaultReminderChannelPerformanceEntry(),
  };
}

function buildDefaultChannelBacktestEntry(): ChannelBacktestEntry {
  return {
    remindersEvaluated: 0,
    matchedRecommendationCount: 0,
    predictedConversions: 0,
    realizedConversions: 0,
    predictedCollectedAmount: 0,
    realizedCollectedAmount: 0,
  };
}

function buildDefaultRecommendationBacktest(): RecommendationBacktest {
  return {
    remindersEvaluated: 0,
    remindersWithRecommendation: 0,
    matchedRecommendationCount: 0,
    recommendationMatchRate: 0,
    predictedConversions: 0,
    realizedConversions: 0,
    predictedCollectedAmount: 0,
    realizedCollectedAmount: 0,
    byChannel: {
      email: buildDefaultChannelBacktestEntry(),
      sms: buildDefaultChannelBacktestEntry(),
      whatsapp: buildDefaultChannelBacktestEntry(),
      phone: buildDefaultChannelBacktestEntry(),
      other: buildDefaultChannelBacktestEntry(),
    },
    bySegment: [],
  };
}

function actionCountsFromCounters(counters: Record<string, number>): ActionCounts {
  return {
    update: counters.update ?? 0,
    mark_paid: counters.mark_paid ?? 0,
    mark_partial: counters.mark_partial ?? 0,
    snooze: counters.snooze ?? 0,
    set_promise_date: counters.set_promise_date ?? 0,
    bulk_mark_paid: counters.bulk_mark_paid ?? 0,
    bulk_snooze: counters.bulk_snooze ?? 0,
    log_reminder: counters.log_reminder ?? 0,
    bulk_log_reminder: counters.bulk_log_reminder ?? 0,
  };
}

function reminderChannelCountsFromCounters(counters: Record<string, number>): ReminderChannelCounts {
  return {
    email: counters.reminder_email ?? 0,
    sms: counters.reminder_sms ?? 0,
    whatsapp: counters.reminder_whatsapp ?? 0,
    phone: counters.reminder_phone ?? 0,
    other: counters.reminder_other ?? 0,
  };
}

function isPaymentAction(actionType: ReceivableActionType): boolean {
  return actionType === "mark_paid" || actionType === "bulk_mark_paid" || actionType === "mark_partial";
}

function isReminderAction(actionType: ReceivableActionType): boolean {
  return actionType === "log_reminder" || actionType === "bulk_log_reminder";
}

function startOfUtcDay(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function getDaysOverdue(dueDate: string, now: Date): number {
  const due = startOfUtcDay(new Date(dueDate));
  const current = startOfUtcDay(now);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((current.getTime() - due.getTime()) / msPerDay);
}

function toAmountBucket(invoiceAmount: number): "micro" | "small" | "mid" | "large" {
  if (invoiceAmount >= 10000) return "large";
  if (invoiceAmount >= 3000) return "mid";
  if (invoiceAmount >= 800) return "small";
  return "micro";
}

function toOverdueBucket(daysOverdue: number): "upcoming" | "due_now" | "overdue_1_14" | "overdue_15_plus" {
  if (daysOverdue < 0) return "upcoming";
  if (daysOverdue === 0) return "due_now";
  if (daysOverdue <= 14) return "overdue_1_14";
  return "overdue_15_plus";
}

function buildSegment(receivable: Receivable, moment: Date) {
  const daysOverdue = getDaysOverdue(receivable.dueDate, moment);
  const amountBucket = toAmountBucket(Math.max(0, receivable.amount));
  const overdueBucket = toOverdueBucket(daysOverdue);
  return {
    segmentKey: `${amountBucket}|${overdueBucket}`,
    amountBucket,
    overdueBucket,
  };
}

function pickBestChannelFromCounts(stats: Record<keyof ReminderChannelCounts, { reminders: number; converted: number }>):
  | keyof ReminderChannelCounts
  | undefined {
  let best: { channel: keyof ReminderChannelCounts; conversionRate: number; reminders: number } | null = null;

  for (const channel of Object.keys(stats) as Array<keyof ReminderChannelCounts>) {
    const entry = stats[channel];
    if (entry.reminders === 0) continue;

    const rate = entry.converted / entry.reminders;
    if (!best || rate > best.conversionRate || (rate === best.conversionRate && entry.reminders > best.reminders)) {
      best = { channel, conversionRate: rate, reminders: entry.reminders };
    }
  }

  return best?.channel;
}

function buildSliceFromEvents(events: ReceivableActionEvent[], receivables: Receivable[]): ReceivableAnalyticsSlice {
  const actionCounts = buildDefaultActionCounts();
  const reminderChannelCounts = buildDefaultReminderChannelCounts();
  const reminderChannelPerformance = buildDefaultReminderChannelPerformance();

  const receivableById = new Map(receivables.map((receivable) => [receivable.id, receivable]));
  const reminderByReceivable = new Map<string, { at: number; channel?: keyof ReminderChannelCounts }>();
  const remindedReceivables = new Set<string>();
  const convertedReceivables = new Set<string>();
  const convertedReceivablesByChannel = new Map<keyof ReminderChannelCounts, Set<string>>();

  const globalChannelHistory: Record<keyof ReminderChannelCounts, { reminders: number; converted: number }> = {
    email: { reminders: 0, converted: 0 },
    sms: { reminders: 0, converted: 0 },
    whatsapp: { reminders: 0, converted: 0 },
    phone: { reminders: 0, converted: 0 },
    other: { reminders: 0, converted: 0 },
  };
  const segmentChannelHistory = new Map<
    string,
    Record<keyof ReminderChannelCounts, { reminders: number; converted: number }>
  >();
  const segmentBacktest = new Map<string, SegmentBacktestEntry>();
  const recommendationBacktest = buildDefaultRecommendationBacktest();
  const pendingReminderPrediction = new Map<
    string,
    {
      at: number;
      channel: keyof ReminderChannelCounts;
      segmentKey: string;
      predictedConversions: number;
      predictedCollectedAmount: number;
    }
  >();

  let paymentsCollectedCount = 0;
  let paymentsCollectedAmount = 0;
  let reminderToPaidAmount = 0;

  const sortedEvents = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const event of sortedEvents) {
    if (Object.prototype.hasOwnProperty.call(actionCounts, event.actionType)) {
      const action = event.actionType as keyof ActionCounts;
      actionCounts[action] += 1;
    }

    if (isReminderAction(event.actionType)) {
      remindedReceivables.add(event.receivableId);

      const reminderAt = new Date(event.createdAt).getTime();
      if (Number.isNaN(reminderAt)) continue;

      const channel =
        event.channel && Object.prototype.hasOwnProperty.call(reminderChannelCounts, event.channel)
          ? (event.channel as keyof ReminderChannelCounts)
          : undefined;

      reminderByReceivable.set(event.receivableId, {
        at: reminderAt,
        channel,
      });

      if (!channel) continue;

      reminderChannelCounts[channel] += 1;
      reminderChannelPerformance[channel].remindersSent += 1;

      const receivable = receivableById.get(event.receivableId);
      if (!receivable) {
        globalChannelHistory[channel].reminders += 1;
        continue;
      }

      const segment = buildSegment(receivable, new Date(event.createdAt));
      if (!segmentChannelHistory.has(segment.segmentKey)) {
        segmentChannelHistory.set(segment.segmentKey, {
          email: { reminders: 0, converted: 0 },
          sms: { reminders: 0, converted: 0 },
          whatsapp: { reminders: 0, converted: 0 },
          phone: { reminders: 0, converted: 0 },
          other: { reminders: 0, converted: 0 },
        });
      }
      const segmentHistory = segmentChannelHistory.get(segment.segmentKey)!;

      const segmentRecommended = pickBestChannelFromCounts(segmentHistory);
      const globalRecommended = pickBestChannelFromCounts(globalChannelHistory);
      const recommendedChannel = segmentRecommended ?? globalRecommended;

      let predictedRate = 0;
      if (segmentHistory[channel].reminders > 0) {
        predictedRate = segmentHistory[channel].converted / segmentHistory[channel].reminders;
      } else if (globalChannelHistory[channel].reminders > 0) {
        predictedRate = globalChannelHistory[channel].converted / globalChannelHistory[channel].reminders;
      }

      const invoiceAmount = Math.max(0, receivable.amount);
      const predictedCollectedAmount = invoiceAmount * predictedRate;

      recommendationBacktest.remindersEvaluated += 1;
      recommendationBacktest.predictedConversions += predictedRate;
      recommendationBacktest.predictedCollectedAmount += predictedCollectedAmount;

      const channelBacktest = recommendationBacktest.byChannel[channel];
      channelBacktest.remindersEvaluated += 1;
      channelBacktest.predictedConversions += predictedRate;
      channelBacktest.predictedCollectedAmount += predictedCollectedAmount;

      if (recommendedChannel) {
        recommendationBacktest.remindersWithRecommendation += 1;
        if (recommendedChannel === channel) {
          recommendationBacktest.matchedRecommendationCount += 1;
          channelBacktest.matchedRecommendationCount += 1;
        }
      }

      if (!segmentBacktest.has(segment.segmentKey)) {
        segmentBacktest.set(segment.segmentKey, {
          segmentKey: segment.segmentKey,
          amountBucket: segment.amountBucket,
          overdueBucket: segment.overdueBucket,
          remindersEvaluated: 0,
          predictedConversions: 0,
          realizedConversions: 0,
          predictedCollectedAmount: 0,
          realizedCollectedAmount: 0,
        });
      }

      const segmentEntry = segmentBacktest.get(segment.segmentKey)!;
      segmentEntry.remindersEvaluated += 1;
      segmentEntry.predictedConversions += predictedRate;
      segmentEntry.predictedCollectedAmount += predictedCollectedAmount;

      pendingReminderPrediction.set(event.receivableId, {
        at: reminderAt,
        channel,
        segmentKey: segment.segmentKey,
        predictedConversions: predictedRate,
        predictedCollectedAmount,
      });

      segmentHistory[channel].reminders += 1;
      globalChannelHistory[channel].reminders += 1;
      continue;
    }

    if (isPaymentAction(event.actionType)) {
      paymentsCollectedCount += 1;
      paymentsCollectedAmount += event.amountCollected ?? 0;

      const reminderInfo = reminderByReceivable.get(event.receivableId);
      const paymentAt = new Date(event.createdAt).getTime();
      if (reminderInfo && !Number.isNaN(paymentAt) && paymentAt >= reminderInfo.at) {
        convertedReceivables.add(event.receivableId);
        reminderToPaidAmount += event.amountCollected ?? 0;

        if (reminderInfo.channel) {
          reminderChannelPerformance[reminderInfo.channel].convertedAmount += event.amountCollected ?? 0;

          if (!convertedReceivablesByChannel.has(reminderInfo.channel)) {
            convertedReceivablesByChannel.set(reminderInfo.channel, new Set<string>());
          }

          const channelConverted = convertedReceivablesByChannel.get(reminderInfo.channel)!;
          if (!channelConverted.has(event.receivableId)) {
            channelConverted.add(event.receivableId);
            reminderChannelPerformance[reminderInfo.channel].convertedCount += 1;
          }
        }
      }

      const pendingPrediction = pendingReminderPrediction.get(event.receivableId);
      if (pendingPrediction && !Number.isNaN(paymentAt) && paymentAt >= pendingPrediction.at) {
        recommendationBacktest.realizedConversions += 1;
        recommendationBacktest.realizedCollectedAmount += event.amountCollected ?? 0;

        const channelBacktest = recommendationBacktest.byChannel[pendingPrediction.channel];
        channelBacktest.realizedConversions += 1;
        channelBacktest.realizedCollectedAmount += event.amountCollected ?? 0;

        const segmentEntry = segmentBacktest.get(pendingPrediction.segmentKey);
        if (segmentEntry) {
          segmentEntry.realizedConversions += 1;
          segmentEntry.realizedCollectedAmount += event.amountCollected ?? 0;
        }

        const segmentHistory = segmentChannelHistory.get(pendingPrediction.segmentKey);
        if (segmentHistory) {
          segmentHistory[pendingPrediction.channel].converted += 1;
        }
        globalChannelHistory[pendingPrediction.channel].converted += 1;

        pendingReminderPrediction.delete(event.receivableId);
      }
    }
  }

  for (const channel of Object.keys(reminderChannelPerformance) as Array<keyof ReminderChannelPerformance>) {
    const entry = reminderChannelPerformance[channel];
    entry.conversionRate = entry.remindersSent > 0 ? entry.convertedCount / entry.remindersSent : 0;
  }

  recommendationBacktest.recommendationMatchRate =
    recommendationBacktest.remindersWithRecommendation > 0
      ? recommendationBacktest.matchedRecommendationCount / recommendationBacktest.remindersWithRecommendation
      : 0;

  recommendationBacktest.bySegment = [...segmentBacktest.values()]
    .sort((a, b) => {
      if (b.remindersEvaluated !== a.remindersEvaluated) return b.remindersEvaluated - a.remindersEvaluated;
      return a.segmentKey.localeCompare(b.segmentKey);
    })
    .slice(0, 6);

  const remindersSent = actionCounts.log_reminder + actionCounts.bulk_log_reminder;
  const totalLoggedActions =
    Object.values(actionCounts).reduce((sum, value) => sum + value, 0) +
    Object.values(reminderChannelCounts).reduce((sum, value) => sum + value, 0);

  const reminderToPaidCount = convertedReceivables.size;
  const reminderToPaidRate = remindedReceivables.size > 0 ? reminderToPaidCount / remindedReceivables.size : 0;

  return {
    actionCounts,
    reminderChannelCounts,
    reminderChannelPerformance,
    recommendationBacktest,
    totalLoggedActions,
    remindersSent,
    paymentsCollectedCount,
    paymentsCollectedAmount,
    reminderToPaidCount,
    reminderToPaidAmount,
    reminderToPaidRate,
  };
}

function windowedEvents(events: ReceivableActionEvent[], now: Date, windowDays: number): ReceivableActionEvent[] {
  const msPerDay = 1000 * 60 * 60 * 24;
  const earliest = now.getTime() - windowDays * msPerDay;

  return events.filter((event) => {
    const time = new Date(event.createdAt).getTime();
    if (Number.isNaN(time)) return false;
    return time >= earliest && time <= now.getTime();
  });
}

export function buildRecommendationConfidenceCalibration(input: {
  slice: Pick<ReceivableAnalyticsSlice, "recommendationBacktest">;
  now?: Date;
  windowDays?: 30;
}): ReceivableRecommendationCalibration {
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? 30;
  const backtest = input.slice.recommendationBacktest;
  const remindersEvaluated = backtest.remindersEvaluated;

  const conversionErrorPerReminder =
    remindersEvaluated > 0
      ? Math.abs(backtest.predictedConversions - backtest.realizedConversions) / remindersEvaluated
      : 1;

  const cashErrorRate =
    remindersEvaluated > 0
      ? Math.abs(backtest.predictedCollectedAmount - backtest.realizedCollectedAmount) /
        Math.max(Math.abs(backtest.realizedCollectedAmount), 1)
      : 1;

  const dominantError = Math.max(conversionErrorPerReminder, cashErrorRate);

  let maxRecommendedConfidence: RecommendationConfidence = "high";
  let status: ReceivableRecommendationCalibration["status"] = "stable";

  if (remindersEvaluated < 6) {
    maxRecommendedConfidence = "low";
    status = "watch";
  } else if (dominantError >= 0.45) {
    maxRecommendedConfidence = "low";
    status = "degraded";
  } else if (dominantError >= 0.25) {
    maxRecommendedConfidence = "medium";
    status = "watch";
  }

  return {
    windowDays,
    evaluatedAt: now.toISOString(),
    remindersEvaluated,
    conversionErrorPerReminder,
    cashErrorRate,
    maxRecommendedConfidence,
    status,
  };
}

export function buildReceivableAnalytics(input: {
  counters: Record<string, number>;
  events: ReceivableActionEvent[];
  receivables?: Receivable[];
  now?: Date;
}): ReceivableAnalytics {
  const now = input.now ?? new Date();
  const receivables = input.receivables ?? [];

  const lifetimeActionCounts = actionCountsFromCounters(input.counters);
  const lifetimeReminderChannelCounts = reminderChannelCountsFromCounters(input.counters);
  const lifetimeFromEvents = buildSliceFromEvents(input.events, receivables);

  const lifetime: ReceivableAnalyticsSlice = {
    ...lifetimeFromEvents,
    actionCounts: lifetimeActionCounts,
    reminderChannelCounts: lifetimeReminderChannelCounts,
    totalLoggedActions:
      Object.values(lifetimeActionCounts).reduce((sum, value) => sum + value, 0) +
      Object.values(lifetimeReminderChannelCounts).reduce((sum, value) => sum + value, 0),
  };

  return {
    lifetime,
    windows: {
      "7d": buildSliceFromEvents(windowedEvents(input.events, now, 7), receivables),
      "30d": buildSliceFromEvents(windowedEvents(input.events, now, 30), receivables),
    },
  };
}
