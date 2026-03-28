import { formatIsoDateForDisplay } from "@/lib/dateDisplay";

type SearchableTransaction = {
  amount: number;
  date: string;
  type?: "revenue" | "expense";
  category: string;
  description: string;
  receiptName?: string;
};

function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/[$,\s]/g, "");
}

function normalizeTextForSearch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function amountSearchTokens(amount: number): string[] {
  const amountWithCents = amount.toFixed(2);

  return [
    amount.toString(),
    amountWithCents,
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount),
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount),
  ];
}

function typeSearchTokens(type?: SearchableTransaction["type"]): string[] {
  if (!type) return [];
  if (type === "revenue") return ["revenue", "revenues", "rev", "income", "incomes", "inc", "sale", "sales"];
  return ["expense", "expenses", "exp", "cost", "costs", "spend", "spending", "spent"];
}

function toIsoDay(value: string | Date): string | null {
  if (typeof value === "string") {
    const rawDayMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (rawDayMatch) return rawDayMatch[0];

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }

  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function shiftIsoDay(isoDay: string, days: number): string {
  const base = new Date(`${isoDay}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function dayDifference(fromIsoDay: string, toIsoDay: string): number {
  const from = new Date(`${fromIsoDay}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIsoDay}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function relativeDateSearchTokens(transactionDate: string, referenceDate: Date): string[] {
  const txDay = toIsoDay(transactionDate);
  const today = toIsoDay(referenceDate);
  if (!txDay || !today) return [];

  if (txDay === today) return ["today"];
  if (txDay === shiftIsoDay(today, -1)) return ["yesterday"];
  if (txDay === shiftIsoDay(today, 1)) return ["tomorrow"];
  return [];
}

function relativeMonthSearchTokens(transactionDate: string, referenceDate: Date): string[] {
  const txDay = toIsoDay(transactionDate);
  if (!txDay || Number.isNaN(referenceDate.getTime())) return [];

  const txDate = new Date(`${txDay}T00:00:00.000Z`);
  const txMonthKey = `${txDate.getUTCFullYear()}-${txDate.getUTCMonth()}`;
  const currentMonthKey = `${referenceDate.getUTCFullYear()}-${referenceDate.getUTCMonth()}`;

  const lastMonth = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 1, 1));
  const nextMonth = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1));
  const lastMonthKey = `${lastMonth.getUTCFullYear()}-${lastMonth.getUTCMonth()}`;
  const nextMonthKey = `${nextMonth.getUTCFullYear()}-${nextMonth.getUTCMonth()}`;

  if (txMonthKey === currentMonthKey) return ["this month", "current month"];
  if (txMonthKey === lastMonthKey) return ["last month", "previous month"];
  if (txMonthKey === nextMonthKey) return ["next month"];

  return [];
}

function startOfUtcWeek(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  start.setUTCDate(start.getUTCDate() - diffToMonday);
  return start;
}

function weekKey(date: Date): string {
  return startOfUtcWeek(date).toISOString().slice(0, 10);
}

function relativeWeekSearchTokens(transactionDate: string, referenceDate: Date): string[] {
  const txDay = toIsoDay(transactionDate);
  if (!txDay || Number.isNaN(referenceDate.getTime())) return [];

  const txDate = new Date(`${txDay}T00:00:00.000Z`);
  const currentWeekKey = weekKey(referenceDate);

  const lastWeekDate = new Date(referenceDate);
  lastWeekDate.setUTCDate(lastWeekDate.getUTCDate() - 7);

  const nextWeekDate = new Date(referenceDate);
  nextWeekDate.setUTCDate(nextWeekDate.getUTCDate() + 7);

  const txWeekKey = weekKey(txDate);
  if (txWeekKey === currentWeekKey) return ["this week", "current week"];
  if (txWeekKey === weekKey(lastWeekDate)) return ["last week", "previous week"];
  if (txWeekKey === weekKey(nextWeekDate)) return ["next week"];

  return [];
}

function relativeYearSearchTokens(transactionDate: string, referenceDate: Date): string[] {
  const txDay = toIsoDay(transactionDate);
  if (!txDay || Number.isNaN(referenceDate.getTime())) return [];

  const txYear = new Date(`${txDay}T00:00:00.000Z`).getUTCFullYear();
  const currentYear = referenceDate.getUTCFullYear();

  if (txYear === currentYear) {
    return [
      "this year",
      "this yr",
      "current year",
      "current yr",
      "this fiscal year",
      "this fiscal yr",
      "current fiscal year",
      "current fiscal yr",
    ];
  }

  if (txYear === currentYear - 1) {
    return [
      "last year",
      "last yr",
      "previous year",
      "previous yr",
      "last fiscal year",
      "last fiscal yr",
      "previous fiscal year",
      "previous fiscal yr",
    ];
  }

  if (txYear === currentYear + 1) {
    return ["next year", "next yr", "next fiscal year", "next fiscal yr"];
  }

  return [];
}

function quarterKey(date: Date): string {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}

function relativeQuarterSearchTokens(transactionDate: string, referenceDate: Date): string[] {
  const txDay = toIsoDay(transactionDate);
  if (!txDay || Number.isNaN(referenceDate.getTime())) return [];

  const txDate = new Date(`${txDay}T00:00:00.000Z`);
  const currentQuarterKey = quarterKey(referenceDate);

  const lastQuarterDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 3, 1));
  const nextQuarterDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 3, 1));

  const txQuarterKey = quarterKey(txDate);
  if (txQuarterKey === currentQuarterKey) {
    return ["this quarter", "this qtr", "current quarter", "current qtr", "this fiscal quarter", "current fiscal quarter"];
  }
  if (txQuarterKey === quarterKey(lastQuarterDate)) {
    return ["last quarter", "last qtr", "previous quarter", "previous qtr", "last fiscal quarter", "previous fiscal quarter"];
  }
  if (txQuarterKey === quarterKey(nextQuarterDate)) return ["next quarter", "next qtr", "next fiscal quarter"];

  return [];
}

function quarterPeriodSearchTokens(transactionDate: string): string[] {
  const txDay = toIsoDay(transactionDate);
  if (!txDay) return [];

  const txDate = new Date(`${txDay}T00:00:00.000Z`);
  const quarter = Math.floor(txDate.getUTCMonth() / 3) + 1;
  const year = txDate.getUTCFullYear();

  return [
    `q${quarter}`,
    `q${quarter} ${year}`,
    `${year} q${quarter}`,
    `quarter ${quarter}`,
    `quarter ${quarter} ${year}`,
  ];
}

function fiscalYearPeriodSearchTokens(transactionDate: string): string[] {
  const txDay = toIsoDay(transactionDate);
  if (!txDay) return [];

  const txDate = new Date(`${txDay}T00:00:00.000Z`);
  const year = txDate.getUTCFullYear();
  const shortYear = String(year).slice(-2);

  return [
    `fy${year}`,
    `fy ${year}`,
    `fy${shortYear}`,
    `fy ${shortYear}`,
    `fiscal year ${year}`,
  ];
}

function relativeRangeSearchTokens(transactionDate: string, referenceDate: Date): string[] {
  const txDay = toIsoDay(transactionDate);
  const today = toIsoDay(referenceDate);
  if (!txDay || !today) return [];

  const daysAgo = dayDifference(txDay, today);
  const daysAhead = dayDifference(today, txDay);

  const tokens: string[] = [];

  if (daysAgo >= 0 && daysAgo <= 6) {
    tokens.push("last 7 days", "past 7 days");
  }

  if (daysAgo >= 0 && daysAgo <= 13) {
    tokens.push("last 14 days", "past 14 days", "last 2 weeks", "past 2 weeks");
  }

  if (daysAgo >= 0 && daysAgo <= 29) {
    tokens.push("last 30 days", "past 30 days");
  }

  if (daysAgo >= 0 && daysAgo <= 59) {
    tokens.push("last 60 days", "past 60 days");
  }

  if (daysAgo >= 0 && daysAgo <= 89) {
    tokens.push("last 90 days", "past 90 days");
  }

  if (daysAhead > 0 && daysAhead <= 6) {
    tokens.push("next 7 days", "upcoming 7 days");
  }

  if (daysAhead > 0 && daysAhead <= 13) {
    tokens.push("next 14 days", "upcoming 14 days", "next 2 weeks", "upcoming 2 weeks");
  }

  if (daysAhead > 0 && daysAhead <= 29) {
    tokens.push("next 30 days", "upcoming 30 days");
  }

  if (daysAhead > 0 && daysAhead <= 59) {
    tokens.push("next 60 days", "upcoming 60 days");
  }

  if (daysAhead > 0 && daysAhead <= 89) {
    tokens.push("next 90 days", "upcoming 90 days");
  }

  return tokens;
}

function periodToDateSearchTokens(transactionDate: string, referenceDate: Date): string[] {
  const txDay = toIsoDay(transactionDate);
  const today = toIsoDay(referenceDate);
  if (!txDay || !today || Number.isNaN(referenceDate.getTime())) return [];

  const daysAgo = dayDifference(txDay, today);
  if (daysAgo < 0) return [];

  const txTime = new Date(`${txDay}T00:00:00.000Z`).getTime();
  const todayTime = new Date(`${today}T00:00:00.000Z`).getTime();

  const weekStartTime = startOfUtcWeek(referenceDate).getTime();
  const monthStartTime = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1);
  const quarterStartTime = Date.UTC(referenceDate.getUTCFullYear(), Math.floor(referenceDate.getUTCMonth() / 3) * 3, 1);
  const yearStartTime = Date.UTC(referenceDate.getUTCFullYear(), 0, 1);

  const tokens: string[] = [];

  if (txTime >= weekStartTime && txTime <= todayTime) {
    tokens.push("week to date", "week-to-date", "wtd");
  }

  if (txTime >= monthStartTime && txTime <= todayTime) {
    tokens.push("month to date", "month-to-date", "mtd");
  }

  if (txTime >= quarterStartTime && txTime <= todayTime) {
    tokens.push("quarter to date", "quarter-to-date", "qtd");
  }

  if (txTime >= yearStartTime && txTime <= todayTime) {
    tokens.push("year to date", "year-to-date", "ytd");
  }

  return tokens;
}

function tokenMatchesQuery(token: string, query: string, normalizedTextQuery: string): boolean {
  if (token.includes(query)) return true;
  if (!normalizedTextQuery) return false;
  return normalizeTextForSearch(token).includes(normalizedTextQuery);
}

export function matchesTransactionSearch(
  tx: SearchableTransaction,
  rawQuery: string,
  referenceDate: Date = new Date(),
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const normalizedQuery = normalizeSearchToken(query);
  const normalizedTextQuery = normalizeTextForSearch(query);
  const formattedDate = formatIsoDateForDisplay(tx.date).toLowerCase();
  const relativeDateMatches = relativeDateSearchTokens(tx.date, referenceDate).some((token) => tokenMatchesQuery(token, query, normalizedTextQuery));
  const relativeMonthMatches = relativeMonthSearchTokens(tx.date, referenceDate).some((token) => tokenMatchesQuery(token, query, normalizedTextQuery));
  const relativeWeekMatches = relativeWeekSearchTokens(tx.date, referenceDate).some((token) => tokenMatchesQuery(token, query, normalizedTextQuery));
  const relativeYearMatches = relativeYearSearchTokens(tx.date, referenceDate).some((token) => tokenMatchesQuery(token, query, normalizedTextQuery));
  const relativeQuarterMatches = relativeQuarterSearchTokens(tx.date, referenceDate).some((token) => tokenMatchesQuery(token, query, normalizedTextQuery));
  const quarterPeriodMatches = quarterPeriodSearchTokens(tx.date).some((token) => tokenMatchesQuery(token, query, normalizedTextQuery));
  const fiscalYearPeriodMatches = fiscalYearPeriodSearchTokens(tx.date).some((token) => tokenMatchesQuery(token, query, normalizedTextQuery));
  const relativeRangeMatches = relativeRangeSearchTokens(tx.date, referenceDate).some((token) => tokenMatchesQuery(token, query, normalizedTextQuery));
  const periodToDateMatches = periodToDateSearchTokens(tx.date, referenceDate).some((token) => tokenMatchesQuery(token, query, normalizedTextQuery));

  const textMatches = (value?: string): boolean => {
    if (!value) return false;
    const lower = value.toLowerCase();
    if (lower.includes(query)) return true;
    if (!normalizedTextQuery) return false;
    return normalizeTextForSearch(value).includes(normalizedTextQuery);
  };

  const amountMatches = amountSearchTokens(tx.amount).some(
    (token) => token.toLowerCase().includes(query) || normalizeSearchToken(token).includes(normalizedQuery)
  );

  const typeMatches = typeSearchTokens(tx.type).some((token) => token.includes(query));

  // Category prefix filtering (e.g. "cat:software")
  if (query.startsWith("cat:") || query.startsWith("category:")) {
    const categoryQuery = query.startsWith("cat:") ? query.slice(4) : query.slice(9);
    if (!categoryQuery) return true;
    return textMatches(tx.category);
  }

  return (
    textMatches(tx.description)
    || textMatches(tx.category)
    || typeMatches
    || amountMatches
    || tx.date.toLowerCase().includes(query)
    || formattedDate.includes(query)
    || relativeDateMatches
    || relativeMonthMatches
    || relativeWeekMatches
    || relativeYearMatches
    || relativeQuarterMatches
    || quarterPeriodMatches
    || fiscalYearPeriodMatches
    || relativeRangeMatches
    || periodToDateMatches
    || textMatches(tx.receiptName)
  );
}
