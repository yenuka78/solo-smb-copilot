import type { DashboardSummary, Deadline, Receivable, Transaction } from "@/lib/types";

export type MonthlyExportReport = {
  generatedAt: string;
  month: string;
  transactionCount: number;
  deadlineCount: number;
  receivableCount: number;
  summary: DashboardSummary;
};

export type MonthlyExportArtifacts = {
  csv: string;
  json: MonthlyExportReport;
  markdown: string;
};

function escapeCsvCell(value: string | number): string {
  const escaped = String(value).replaceAll('"', '""');
  return `"${escaped}"`;
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function buildTransactionsCsv(transactions: Transaction[]): string {
  const rows: Array<Array<string | number>> = [
    ["id", "type", "amount", "date", "category", "description", "receiptName", "source"],
    ...transactions.map((tx) => [
      tx.id,
      tx.type,
      tx.amount,
      tx.date,
      tx.category,
      tx.description,
      tx.receiptName ?? "",
      tx.source,
    ]),
  ];

  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\n");
}

export function buildMonthlySummaryMarkdown(input: {
  month: string;
  currency: string;
  generatedAt: string;
  transactions: Transaction[];
  deadlines: Deadline[];
  receivables: Receivable[];
  summary: DashboardSummary;
}): string {
  const { month, currency, generatedAt, transactions, deadlines, receivables, summary } = input;

  const lines: string[] = [
    `# Monthly Finance Summary (${month})`,
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Snapshot",
    "",
    `- Revenue: ${formatMoney(summary.monthRevenue, currency)}`,
    `- Expense: ${formatMoney(summary.monthExpense, currency)}`,
    `- Profit: ${formatMoney(summary.monthProfit, currency)}`,
    `- Suggested tax reserve: ${formatMoney(summary.taxReserveSuggestion, currency)}`,
    `- Open deadlines due soon (7d): ${summary.dueSoonDeadlines}`,
    `- Overdue deadlines: ${summary.overdueDeadlines}`,
    `- Overdue receivables: ${summary.overdueReceivablesCount} (${formatMoney(summary.overdueReceivablesAmount, currency)})`,
    "",
    "## Risk flags",
    "",
  ];

  if (summary.riskFlags.length === 0) {
    lines.push("- None");
  } else {
    for (const flag of summary.riskFlags) {
      lines.push(`- ${flag}`);
    }
  }

  lines.push("", "## Transactions", "");

  if (transactions.length === 0) {
    lines.push("No transactions recorded for this month.");
  } else {
    lines.push(
      "| Date | Type | Category | Description | Amount | Receipt | Source |",
      "| --- | --- | --- | --- | ---: | --- | --- |",
    );

    for (const tx of transactions) {
      lines.push(
        `| ${escapeMarkdownCell(tx.date)} | ${escapeMarkdownCell(tx.type)} | ${escapeMarkdownCell(tx.category)} | ${escapeMarkdownCell(tx.description || "-")} | ${formatMoney(tx.amount, currency)} | ${escapeMarkdownCell(tx.receiptName ?? "-")} | ${escapeMarkdownCell(tx.source)} |`,
      );
    }
  }

  lines.push("", "## Deadlines", "");

  if (deadlines.length === 0) {
    lines.push("No deadlines with due dates in this month.");
  } else {
    lines.push("| Due date | Title | Status | Recurring |", "| --- | --- | --- | --- |");
    for (const deadline of deadlines) {
      lines.push(
        `| ${escapeMarkdownCell(deadline.dueDate)} | ${escapeMarkdownCell(deadline.title)} | ${escapeMarkdownCell(deadline.status)} | ${escapeMarkdownCell(deadline.recurring)} |`,
      );
    }
  }

  lines.push("", "## Receivables", "");

  if (receivables.length === 0) {
    lines.push("No receivables with due dates in this month.");
  } else {
    lines.push("| Due date | Customer | Amount | Status |", "| --- | --- | ---: | --- |");
    for (const r of receivables) {
      lines.push(
        `| ${escapeMarkdownCell(r.dueDate)} | ${escapeMarkdownCell(r.customerName)} | ${formatMoney(r.amount, currency)} | ${escapeMarkdownCell(r.status)} |`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function buildMonthlyExportArtifacts(input: {
  month: string;
  currency: string;
  generatedAt?: string;
  transactions: Transaction[];
  deadlines: Deadline[];
  receivables?: Receivable[];
  summary: DashboardSummary;
}): MonthlyExportArtifacts {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const receivables = input.receivables ?? [];

  return {
    csv: buildTransactionsCsv(input.transactions),
    json: {
      generatedAt,
      month: input.month,
      transactionCount: input.transactions.length,
      deadlineCount: input.deadlines.length,
      receivableCount: receivables.length,
      summary: input.summary,
    },
    markdown: buildMonthlySummaryMarkdown({
      month: input.month,
      currency: input.currency,
      generatedAt,
      transactions: input.transactions,
      deadlines: input.deadlines,
      receivables,
      summary: input.summary,
    }),
  };
}
