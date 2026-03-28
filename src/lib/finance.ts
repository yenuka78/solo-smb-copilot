import type { DashboardSummary, Deadline, RiskAlert, Transaction, Settings, Receivable } from "./types";

function isSameMonth(date: Date, now = new Date()): boolean {
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
}

function sumByType(transactions: Transaction[], type: "revenue" | "expense"): number {
  return transactions.filter((tx) => tx.type === type).reduce((sum, tx) => sum + tx.amount, 0);
}

function startOfUtcDay(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function deadlineDaysDiff(dueDate: string, now: Date): number {
  const due = startOfUtcDay(new Date(dueDate));
  const current = startOfUtcDay(now);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((due.getTime() - current.getTime()) / msPerDay);
}

export function buildSummary(
  transactions: Transaction[],
  deadlines: Deadline[],
  receivables: Receivable[],
  settings: Settings,
  now = new Date(),
): DashboardSummary {
  const monthTx = transactions.filter((tx) => isSameMonth(new Date(tx.date), now));
  const monthRevenue = sumByType(monthTx, "revenue");
  const monthExpense = sumByType(monthTx, "expense");
  const monthProfit = monthRevenue - monthExpense;
  const monthProfitMargin = monthRevenue > 0 ? Math.max(-1, monthProfit / monthRevenue) : 0;
  const taxReserveSuggestion = Math.max(0, monthProfit * settings.taxReserveRate);

  const prevMonth = new Date(now);
  prevMonth.setUTCMonth(now.getUTCMonth() - 1);
  const prevMonthTx = transactions.filter((tx) => isSameMonth(new Date(tx.date), prevMonth));
  const prevMonthRevenue = sumByType(prevMonthTx, "revenue");
  const prevMonthExpense = sumByType(prevMonthTx, "expense");

  const categoryMap: Record<string, number> = {};
  monthTx
    .filter((tx) => tx.type === "expense")
    .forEach((tx) => {
      const cat = tx.category || "Uncategorized";
      categoryMap[cat] = (categoryMap[cat] || 0) + tx.amount;
    });

  const expenseCategories = Object.entries(categoryMap)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: monthExpense > 0 ? amount / monthExpense : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const revenueCategoryMap: Record<string, number> = {};
  monthTx
    .filter((tx) => tx.type === "revenue")
    .forEach((tx) => {
      const cat = tx.category || "Uncategorized";
      revenueCategoryMap[cat] = (revenueCategoryMap[cat] || 0) + tx.amount;
    });

  const revenueCategories = Object.entries(revenueCategoryMap)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: monthRevenue > 0 ? amount / monthRevenue : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const overdueDeadlines = deadlines.filter(
    (d) => d.status === "open" && deadlineDaysDiff(d.dueDate, now) < 0,
  ).length;

  const dueSoonDeadlines = deadlines.filter((d) => {
    if (d.status !== "open") return false;
    const daysLeft = deadlineDaysDiff(d.dueDate, now);
    return daysLeft >= 0 && daysLeft <= 7;
  }).length;

  const overdueReceivables = receivables.filter((r) => {
    if (r.status === "paid") return false;
    return deadlineDaysDiff(r.dueDate, now) < 0;
  });

  const overdueReceivablesCount = overdueReceivables.length;
  const overdueReceivablesAmount = overdueReceivables.reduce((sum, r) => sum + (r.amount - r.amountPaid), 0);

  const riskFlags: string[] = [];

  if (monthRevenue > 0 && monthExpense / monthRevenue > 0.8) {
    riskFlags.push("Expense ratio is above 80% this month.");
  }

  if (overdueDeadlines > 0) {
    riskFlags.push(`${overdueDeadlines} deadline(s) are overdue.`);
  }

  if (overdueReceivablesCount > 0) {
    const overdueAmtStr = new Intl.NumberFormat("en-US", { style: "currency", currency: settings.currency }).format(overdueReceivablesAmount);
    riskFlags.push(`${overdueReceivablesCount} receivable(s) are overdue (${overdueAmtStr}).`);
  }

  if (monthProfit < 0) {
    riskFlags.push("You are currently cashflow-negative this month.");
  }

  const reviewTransactions = transactions.filter((tx) => tx.ocr?.reviewNeeded).length;
  if (reviewTransactions > 0) {
    riskFlags.push(`You have ${reviewTransactions} transaction(s) waiting for OCR review.`);
  }

  if (taxReserveSuggestion >= 5000) {
    const reserveStr = new Intl.NumberFormat("en-US", { style: "currency", currency: settings.currency }).format(taxReserveSuggestion);
    riskFlags.push(`Large tax reserve suggested (${reserveStr}). Consider moving to a separate account.`);
  }

  let monthlyRevenueProgress: number | undefined;
  if (settings.monthlyRevenueGoal && settings.monthlyRevenueGoal > 0) {
    monthlyRevenueProgress = Math.min(1, monthRevenue / settings.monthlyRevenueGoal);
  }

  let monthlyExpenseProgress: number | undefined;
  if (settings.monthlyExpenseLimit && settings.monthlyExpenseLimit > 0) {
    monthlyExpenseProgress = Math.min(1, monthExpense / settings.monthlyExpenseLimit);

    if (monthExpense > settings.monthlyExpenseLimit) {
      const limitStr = new Intl.NumberFormat("en-US", { style: "currency", currency: settings.currency }).format(settings.monthlyExpenseLimit);
      const spentStr = new Intl.NumberFormat("en-US", { style: "currency", currency: settings.currency }).format(monthExpense);
      riskFlags.push(`Monthly expense limit of ${limitStr} exceeded (${spentStr} spent).`);
    } else if (monthExpense >= settings.monthlyExpenseLimit * 0.9) {
      const limitStr = new Intl.NumberFormat("en-US", { style: "currency", currency: settings.currency }).format(settings.monthlyExpenseLimit);
      const percent = Math.round((monthExpense / settings.monthlyExpenseLimit) * 100);
      riskFlags.push(`Warning: You have used ${percent}% of your ${limitStr} expense limit.`);
    }
  }

  const isEndOfMonth = () => {
    const nextDay = new Date(now);
    nextDay.setUTCDate(now.getUTCDate() + 1);
    return nextDay.getUTCMonth() !== now.getUTCMonth();
  };

  if (isEndOfMonth() && settings.monthlyRevenueGoal && settings.monthlyRevenueGoal > 0 && monthRevenue < settings.monthlyRevenueGoal) {
    const goalStr = new Intl.NumberFormat("en-US", { style: "currency", currency: settings.currency }).format(settings.monthlyRevenueGoal);
    const revenueStr = new Intl.NumberFormat("en-US", { style: "currency", currency: settings.currency }).format(monthRevenue);
    riskFlags.push(`Revenue goal of ${goalStr} was missed (completed: ${revenueStr}).`);
  }

  return {
    monthRevenue,
    monthExpense,
    monthProfit,
    monthProfitMargin,
    taxReserveSuggestion,
    prevMonthRevenue,
    prevMonthExpense,
    overdueDeadlines,
    dueSoonDeadlines,
    overdueReceivablesCount,
    overdueReceivablesAmount,
    riskFlags,
    expenseCategories,
    revenueCategories,
    monthlyRevenueGoal: settings.monthlyRevenueGoal,
    monthlyRevenueProgress,
    monthlyExpenseLimit: settings.monthlyExpenseLimit,
    monthlyExpenseProgress,
  };
}

export function buildAlerts(
  transactions: Transaction[],
  deadlines: Deadline[],
  taxReserveRate: number,
  now = new Date(),
): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  const monthTx = transactions.filter((tx) => isSameMonth(new Date(tx.date), now));
  const monthRevenue = sumByType(monthTx, "revenue");
  const monthExpense = sumByType(monthTx, "expense");
  const monthProfit = monthRevenue - monthExpense;
  const reserveTarget = Math.max(0, monthProfit * taxReserveRate);

  const missingReceipt = monthTx.filter(
    (tx) => tx.type === "expense" && tx.amount >= 100 && !tx.receiptName,
  );
  if (missingReceipt.length > 0) {
    alerts.push({
      id: "missing-receipts",
      type: "missing_receipt",
      severity: "medium",
      message: `${missingReceipt.length} expense(s) above $100 are missing receipt attachment names.`,
    });
  }

  const prevMonth = new Date(now);
  prevMonth.setUTCMonth(now.getUTCMonth() - 1);
  const prevMonthTx = transactions.filter((tx) => isSameMonth(new Date(tx.date), prevMonth));
  const prevExpense = sumByType(prevMonthTx, "expense");
  const prevRevenue = sumByType(prevMonthTx, "revenue");

  if (prevExpense > 0 && monthExpense > prevExpense * 1.5) {
    alerts.push({
      id: "spend-spike",
      type: "spend_spike",
      severity: "high",
      message: "This month expense is more than 50% higher than last month.",
    });
  }

  if (prevRevenue > 0 && monthRevenue < prevRevenue * 0.7) {
    alerts.push({
      id: "revenue-drop",
      type: "revenue_drop",
      severity: "high",
      message: "Revenue dropped more than 30% compared to last month.",
    });
  }

  const overdue = deadlines.filter((d) => d.status === "open" && deadlineDaysDiff(d.dueDate, now) < 0).length;
  if (overdue > 0) {
    alerts.push({
      id: "overdue-deadline",
      type: "overdue_deadline",
      severity: "high",
      message: `${overdue} deadline(s) are overdue and need immediate action.`,
    });
  }

  const dueSoon = deadlines.filter((d) => {
    if (d.status !== "open") return false;
    const diffDays = deadlineDaysDiff(d.dueDate, now);
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  if (dueSoon > 0 && (monthProfit <= 0 || reserveTarget > 0)) {
    alerts.push({
      id: "reserve-risk",
      type: "deadline_reserve_risk",
      severity: monthProfit <= 0 ? "high" : "medium",
      message: `${dueSoon} deadline(s) in 7 days. Verify tax reserve transfer now (${reserveTarget.toFixed(2)} suggested).`,
    });
  }

  return alerts;
}
