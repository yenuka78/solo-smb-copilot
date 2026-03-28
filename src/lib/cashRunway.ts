import type {
  CashProjectionBandPoint,
  CashProjectionPoint,
  CashRunwaySummary,
  Receivable,
  Settings,
  Transaction,
} from "./types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfUtcDay(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getReceivableCollectionProbability(daysUntilDue: number): number {
  if (daysUntilDue < -30) return 0.3;
  if (daysUntilDue < -7) return 0.45;
  if (daysUntilDue < 0) return 0.6;
  if (daysUntilDue <= 3) return 0.8;
  if (daysUntilDue <= 14) return 0.65;
  return 0.4;
}

function normalizeBurnRateMultiplier(settings: Settings): number {
  return clamp(0.5, settings.cashBurnRateMultiplier ?? 1, 2);
}

function normalizeCollectionConfidence(settings: Settings): number {
  return clamp(0, settings.receivableCollectionConfidence ?? 1, 1.5);
}

function buildExpectedReceivableInflowByDay(
  receivables: Receivable[],
  today: Date,
  collectionConfidence: number,
): { expectedInflowByDay: Record<number, number>; expectedReceivableInflow14d: number } {
  const expectedInflowByDay: Record<number, number> = {};
  let expectedReceivableInflow14d = 0;

  for (const receivable of receivables) {
    if (receivable.status === "paid") continue;
    const remaining = Math.max(0, receivable.amount - receivable.amountPaid);
    if (remaining <= 0) continue;

    const due = startOfUtcDay(new Date(receivable.dueDate));
    const daysUntilDue = Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);
    if (daysUntilDue < -60 || daysUntilDue > 14) continue;

    const projectionDay = clamp(1, daysUntilDue <= 0 ? 1 : daysUntilDue, 14);
    const baseProbability = getReceivableCollectionProbability(daysUntilDue);
    const effectiveProbability = clamp(0, baseProbability * collectionConfidence, 1);
    const expected = remaining * effectiveProbability;

    expectedInflowByDay[projectionDay] = (expectedInflowByDay[projectionDay] ?? 0) + expected;
    expectedReceivableInflow14d += expected;
  }

  return { expectedInflowByDay, expectedReceivableInflow14d };
}

function buildProjection(options: {
  currentBalance: number;
  today: Date;
  averageDailyRevenue: number;
  averageDailyExpense: number;
  burnRateMultiplier: number;
  expectedInflowByDay: Record<number, number>;
}): {
  points: CashProjectionPoint[];
  averageDailyNet: number;
  daysUntilCashOut: number | null;
  lowestProjectedBalance: number;
  lowestProjectedBalanceDay: number | null;
} {
  const averageDailyNet = options.averageDailyRevenue - options.averageDailyExpense * options.burnRateMultiplier;

  const points: CashProjectionPoint[] = [];
  let projectedBalance = options.currentBalance;
  let lowestProjectedBalance = options.currentBalance;
  let lowestProjectedBalanceDay: number | null = null;
  let daysUntilCashOut: number | null = null;

  for (let day = 1; day <= 14; day += 1) {
    const expectedReceivableInflow = options.expectedInflowByDay[day] ?? 0;
    projectedBalance += averageDailyNet + expectedReceivableInflow;

    if (projectedBalance < lowestProjectedBalance) {
      lowestProjectedBalance = projectedBalance;
      lowestProjectedBalanceDay = day;
    }

    if (daysUntilCashOut === null && projectedBalance < 0) {
      daysUntilCashOut = day;
    }

    const date = new Date(options.today.getTime() + day * MS_PER_DAY).toISOString().slice(0, 10);
    points.push({
      day,
      date,
      projectedBalance,
      baselineNetChange: averageDailyNet,
      expectedReceivableInflow,
    });
  }

  return {
    points,
    averageDailyNet,
    daysUntilCashOut,
    lowestProjectedBalance,
    lowestProjectedBalanceDay,
  };
}

function buildProjectionBands(options: {
  currentBalance: number;
  today: Date;
  averageDailyRevenue: number;
  averageDailyExpense: number;
  burnRateMultiplier: number;
  expectedInflowByDay: Record<number, number>;
}): CashProjectionBandPoint[] {
  const worstBurnRateMultiplier = clamp(0.5, options.burnRateMultiplier * 1.15, 2);
  const bestBurnRateMultiplier = clamp(0.5, options.burnRateMultiplier * 0.9, 2);

  const worstInflowByDay = Object.fromEntries(
    Object.entries(options.expectedInflowByDay).map(([day, value]) => [Number(day), value * 0.75]),
  );
  const bestInflowByDay = Object.fromEntries(
    Object.entries(options.expectedInflowByDay).map(([day, value]) => [Number(day), value * 1.15]),
  );

  const worstProjection = buildProjection({
    ...options,
    burnRateMultiplier: worstBurnRateMultiplier,
    expectedInflowByDay: worstInflowByDay,
  }).points;

  const baseProjection = buildProjection(options).points;

  const bestProjection = buildProjection({
    ...options,
    burnRateMultiplier: bestBurnRateMultiplier,
    expectedInflowByDay: bestInflowByDay,
  }).points;

  return baseProjection.map((point, index) => ({
    day: point.day,
    date: point.date,
    worstCaseBalance: worstProjection[index]?.projectedBalance ?? point.projectedBalance,
    baseCaseBalance: point.projectedBalance,
    bestCaseBalance: bestProjection[index]?.projectedBalance ?? point.projectedBalance,
  }));
}

export function buildCashRunwaySummary(
  transactions: Transaction[],
  receivables: Receivable[],
  settings: Settings,
  now = new Date(),
): CashRunwaySummary {
  const currentBalance = settings.currentCashBalance ?? 0;
  const burnRateMultiplier = normalizeBurnRateMultiplier(settings);
  const collectionConfidence = normalizeCollectionConfidence(settings);
  const today = startOfUtcDay(now);
  const lookbackStart = new Date(today.getTime() - 29 * MS_PER_DAY);

  const recentTransactions = transactions.filter((tx) => {
    const txDay = startOfUtcDay(new Date(tx.date));
    return txDay >= lookbackStart && txDay <= today;
  });

  const revenue30d = recentTransactions
    .filter((tx) => tx.type === "revenue")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const expense30d = recentTransactions
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const averageDailyRevenue = revenue30d / 30;
  const averageDailyExpense = expense30d / 30;

  const { expectedInflowByDay, expectedReceivableInflow14d } = buildExpectedReceivableInflowByDay(
    receivables,
    today,
    collectionConfidence,
  );

  const baseProjection = buildProjection({
    currentBalance,
    today,
    averageDailyRevenue,
    averageDailyExpense,
    burnRateMultiplier,
    expectedInflowByDay,
  });

  const projectionBands14d = buildProjectionBands({
    currentBalance,
    today,
    averageDailyRevenue,
    averageDailyExpense,
    burnRateMultiplier,
    expectedInflowByDay,
  });

  const runwayDays = baseProjection.averageDailyNet >= 0 ? null : currentBalance / Math.abs(baseProjection.averageDailyNet);

  const riskReasons: string[] = [];
  if (currentBalance <= 0) {
    riskReasons.push("Current cash balance is at or below zero.");
  }
  if (baseProjection.daysUntilCashOut !== null) {
    riskReasons.push(`Projected cash balance drops below zero within ${baseProjection.daysUntilCashOut} day(s).`);
  }
  if (baseProjection.averageDailyNet < 0) {
    riskReasons.push(`Current burn rate is ${Math.abs(baseProjection.averageDailyNet).toFixed(2)} per day.`);
  }
  if (expectedReceivableInflow14d > 0) {
    riskReasons.push(`Expected receivable inflow in next 14 days: ${expectedReceivableInflow14d.toFixed(2)}.`);
  }
  if (burnRateMultiplier !== 1 || collectionConfidence !== 1) {
    riskReasons.push(
      `Forecast assumptions active: burn x${burnRateMultiplier.toFixed(2)}, collection confidence ${(collectionConfidence * 100).toFixed(0)}%.`,
    );
  }

  const suggestedActions: string[] = [];
  if (baseProjection.daysUntilCashOut !== null || currentBalance <= 0) {
    suggestedActions.push("Prioritize collecting overdue receivables this week.");
    suggestedActions.push("Delay non-essential expenses for the next 14 days.");
  }
  if (baseProjection.averageDailyNet < 0) {
    suggestedActions.push("Cut or pause one recurring expense category with the highest monthly burn.");
  }
  if (expectedReceivableInflow14d < Math.abs(baseProjection.averageDailyNet) * 7) {
    suggestedActions.push("Create a short-term cash bridge plan (accelerated invoicing or owner top-up).");
  }
  if (collectionConfidence < 0.8) {
    suggestedActions.push("Increase collection confidence: tighten follow-up cadence or request partial prepayment on new work.");
  }
  if (suggestedActions.length === 0) {
    suggestedActions.push("Maintain current pace and continue monitoring runway weekly.");
  }

  let riskLevel: CashRunwaySummary["riskLevel"] = "low";
  if (baseProjection.daysUntilCashOut !== null || currentBalance <= 0 || (runwayDays !== null && runwayDays <= 21)) {
    riskLevel = "high";
  } else if ((runwayDays !== null && runwayDays <= 60) || baseProjection.lowestProjectedBalance <= currentBalance * 0.35) {
    riskLevel = "medium";
  }

  return {
    currentBalance,
    assumptions: {
      burnRateMultiplier,
      collectionConfidence,
    },
    averageDailyRevenue,
    averageDailyExpense,
    averageDailyNet: baseProjection.averageDailyNet,
    runwayDays,
    daysUntilCashOut: baseProjection.daysUntilCashOut,
    lowestProjectedBalance: baseProjection.lowestProjectedBalance,
    lowestProjectedBalanceDay: baseProjection.lowestProjectedBalanceDay,
    expectedReceivableInflow14d,
    projection14d: baseProjection.points,
    projectionBands14d,
    riskLevel,
    riskReasons,
    suggestedActions,
  };
}
