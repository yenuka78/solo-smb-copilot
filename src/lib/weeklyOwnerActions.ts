import { buildCashRunwaySummary } from "./cashRunway";
import { buildReceivablesQueue } from "./receivables";
import type { Deadline, OwnerActionBrief, OwnerActionItem, Receivable, Settings, Transaction } from "./types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfUtcDay(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateBaseCollectionProbability(daysOverdue: number): number {
  if (daysOverdue > 30) return 0.22;
  if (daysOverdue > 14) return 0.3;
  if (daysOverdue > 7) return 0.42;
  if (daysOverdue >= 0) return 0.55;
  return 0.35;
}

function buildCollectionActions(receivables: Receivable[], now: Date): OwnerActionItem[] {
  const queue = buildReceivablesQueue(receivables, now);
  const highPriority = queue.items.filter((item) => item.amountRemaining > 0).slice(0, 3);

  return highPriority.map((item, index) => {
    const baseProbability = estimateBaseCollectionProbability(item.daysOverdue);
    const uplift = item.daysOverdue > 14 ? 0.28 : item.daysOverdue >= 0 ? 0.22 : 0.12;
    const expectedImpact = item.amountRemaining * clamp(0.05, uplift * (item.followUpStale ? 1.1 : 1), 0.45);

    return {
      id: `collect-${item.id}`,
      category: "collections",
      title: `Collect ${item.customerName} receivable`,
      description:
        item.daysOverdue > 0
          ? `${item.daysOverdue}d overdue for ${item.amountRemaining.toFixed(2)}. Use ${item.reminderCount >= 2 ? "phone escalation" : "same-day reminder + call"}.`
          : `Due soon for ${item.amountRemaining.toFixed(2)}. Confirm payment timing now to pull cash forward.`,
      rationale: `Baseline collectability ~${Math.round(baseProbability * 100)}%. Focused follow-up can lift 14-day conversion by ~${Math.round(uplift * 100)}%.`,
      expectedCashImpact14d: Number(expectedImpact.toFixed(2)),
      confidence: item.daysOverdue >= 0 ? "high" : "medium",
      priorityScore: Number((expectedImpact + (3 - index) * 40 + item.riskScore).toFixed(2)),
    };
  });
}

function buildCostControlAction(transactions: Transaction[], now: Date): OwnerActionItem | null {
  const today = startOfUtcDay(now);
  const lookbackStart = new Date(today.getTime() - 29 * MS_PER_DAY);

  const recentExpenses = transactions.filter((tx) => {
    if (tx.type !== "expense") return false;
    const txDay = startOfUtcDay(new Date(tx.date));
    return txDay >= lookbackStart && txDay <= today;
  });

  if (recentExpenses.length === 0) return null;

  const expenseByCategory = new Map<string, number>();
  for (const tx of recentExpenses) {
    const category = tx.category || "uncategorized";
    expenseByCategory.set(category, (expenseByCategory.get(category) ?? 0) + tx.amount);
  }

  const topExpenseCategory = [...expenseByCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!topExpenseCategory) return null;

  const [category, amount30d] = topExpenseCategory;
  const dailyRunRate = amount30d / 30;
  const expectedSavings14d = dailyRunRate * 14 * 0.2;

  return {
    id: `trim-expense-${category.toLowerCase().replace(/\s+/g, "-")}`,
    category: "cost_control",
    title: `Trim ${category} spend this week`,
    description: `${category} is your largest 30-day expense bucket (${amount30d.toFixed(2)}). Pause or renegotiate one recurring line item this week.`,
    rationale: `Assumes a 20% cut in this category over the next 14 days based on trailing spend rate.`,
    expectedCashImpact14d: Number(expectedSavings14d.toFixed(2)),
    confidence: "medium",
    priorityScore: Number((expectedSavings14d + 55).toFixed(2)),
  };
}

function buildRevenuePushAction(transactions: Transaction[], now: Date): OwnerActionItem | null {
  const today = startOfUtcDay(now);
  const lookbackStart = new Date(today.getTime() - 29 * MS_PER_DAY);

  const recentRevenue = transactions
    .filter((tx) => {
      if (tx.type !== "revenue") return false;
      const txDay = startOfUtcDay(new Date(tx.date));
      return txDay >= lookbackStart && txDay <= today;
    })
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (recentRevenue <= 0) return null;

  const averageDailyRevenue = recentRevenue / 30;
  const expectedLift = averageDailyRevenue * 2.5;

  return {
    id: "accelerate-invoicing",
    category: "revenue_push",
    title: "Pull one invoice forward by 48 hours",
    description: "Invoice any completed-but-unbilled work today and ask for partial prepayment on upcoming scope.",
    rationale: "Uses trailing daily revenue to estimate realistic near-term acceleration from faster invoicing.",
    expectedCashImpact14d: Number(expectedLift.toFixed(2)),
    confidence: "medium",
    priorityScore: Number((expectedLift + 45).toFixed(2)),
  };
}

function buildComplianceAction(deadlines: Deadline[], now: Date): OwnerActionItem | null {
  const current = startOfUtcDay(now);
  const openDeadlines = deadlines
    .filter((deadline) => deadline.status === "open")
    .map((deadline) => {
      const due = startOfUtcDay(new Date(deadline.dueDate));
      const daysUntilDue = Math.round((due.getTime() - current.getTime()) / MS_PER_DAY);
      return { ...deadline, daysUntilDue };
    })
    .filter((deadline) => deadline.daysUntilDue <= 7)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  if (openDeadlines.length === 0) return null;

  const nextDeadline = openDeadlines[0];
  const avoidedPenalty = 150 + Math.max(0, 7 - nextDeadline.daysUntilDue) * 20;

  return {
    id: `deadline-${nextDeadline.id}`,
    category: "compliance",
    title: `Close deadline: ${nextDeadline.title}`,
    description:
      nextDeadline.daysUntilDue < 0
        ? `Overdue by ${Math.abs(nextDeadline.daysUntilDue)}d. Completing now reduces likely rush fees/penalties.`
        : `Due in ${nextDeadline.daysUntilDue}d. Block 30 minutes this week to submit early and avoid penalties.`,
    rationale: "Expected impact models avoided late fees + rush processing costs.",
    expectedCashImpact14d: Number(avoidedPenalty.toFixed(2)),
    confidence: "low",
    priorityScore: Number((avoidedPenalty + 30).toFixed(2)),
  };
}

function dedupeAndRank(actions: OwnerActionItem[]): OwnerActionItem[] {
  const seenTitles = new Set<string>();
  const ranked = actions
    .filter((action): action is OwnerActionItem => Boolean(action))
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return b.expectedCashImpact14d - a.expectedCashImpact14d;
    });

  const unique: OwnerActionItem[] = [];
  for (const action of ranked) {
    if (seenTitles.has(action.title)) continue;
    seenTitles.add(action.title);
    unique.push(action);
    if (unique.length === 5) break;
  }

  return unique;
}

export function buildWeeklyOwnerActionBrief(
  transactions: Transaction[],
  receivables: Receivable[],
  deadlines: Deadline[],
  settings: Settings,
  now = new Date(),
): OwnerActionBrief {
  const runway = buildCashRunwaySummary(transactions, receivables, settings, now);

  const collectionActions = buildCollectionActions(receivables, now);
  const costControlAction = buildCostControlAction(transactions, now);
  const revenuePushAction = buildRevenuePushAction(transactions, now);
  const complianceAction = buildComplianceAction(deadlines, now);

  const actions = dedupeAndRank([
    ...collectionActions,
    ...(costControlAction ? [costControlAction] : []),
    ...(revenuePushAction ? [revenuePushAction] : []),
    ...(complianceAction ? [complianceAction] : []),
  ]);

  if (actions.length === 0) {
    actions.push({
      id: "maintain-pace",
      category: "revenue_push",
      title: "Maintain current execution cadence",
      description: "No urgent weekly interventions detected. Keep receivable follow-ups and transaction capture cadence steady.",
      rationale: "Fallback action when there is insufficient activity history to model specific interventions.",
      expectedCashImpact14d: 0,
      confidence: "low",
      priorityScore: 0,
    });
  }

  return {
    generatedAt: new Date(now).toISOString(),
    windowDays: 14,
    projectedStartingCash: runway.currentBalance,
    riskLevel: runway.riskLevel,
    topActions: actions,
    totalExpectedImpact14d: Number(actions.reduce((sum, action) => sum + action.expectedCashImpact14d, 0).toFixed(2)),
  };
}
