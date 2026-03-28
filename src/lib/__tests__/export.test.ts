import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildMonthlyExportArtifacts, buildTransactionsCsv } from "@/lib/export";
import type { DashboardSummary, Deadline, Transaction } from "@/lib/types";

const summary: DashboardSummary = {
  monthRevenue: 1500,
  monthExpense: 350.75,
  monthProfit: 1149.25,
  monthProfitMargin: 0.766,
  taxReserveSuggestion: 287.3125,
  prevMonthRevenue: 1200,
  prevMonthExpense: 300,
  overdueDeadlines: 1,
  dueSoonDeadlines: 2,
  overdueReceivablesCount: 0,
  overdueReceivablesAmount: 0,
  riskFlags: ["Expense ratio is above 80% this month."],
  expenseCategories: [],
  revenueCategories: [],
};

const transactions: Transaction[] = [
  {
    id: "tx-1",
    type: "revenue",
    amount: 1500,
    date: "2026-02-05",
    category: "consulting",
    description: "Retainer, \"ACME\"",
    source: "manual",
    receiptName: "invoice-001.pdf",
    createdAt: "2026-02-05T00:00:00.000Z",
  },
  {
    id: "tx-2",
    type: "expense",
    amount: 350.75,
    date: "2026-02-08",
    category: "software|ops",
    description: "Tools renewal",
    source: "import",
    createdAt: "2026-02-08T00:00:00.000Z",
  },
];

const deadlines: Deadline[] = [
  {
    id: "d-1",
    title: "Quarterly tax filing",
    dueDate: "2026-02-20",
    recurring: "quarterly",
    status: "open",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
];

describe("buildTransactionsCsv", () => {
  test("quotes and escapes values consistently", () => {
    const csv = buildTransactionsCsv(transactions);

    assert.match(csv, /^"id","type","amount","date","category","description","receiptName","source"/);
    assert.ok(csv.includes('"Retainer, ""ACME"""'));
    assert.ok(csv.includes('"software|ops"'));
  });
});

describe("buildMonthlyExportArtifacts", () => {
  test("builds JSON report and markdown summary for accountants", () => {
    const artifacts = buildMonthlyExportArtifacts({
      month: "2026-02",
      currency: "USD",
      generatedAt: "2026-02-19T06:00:00.000Z",
      transactions,
      deadlines,
      summary,
    });

    assert.equal(artifacts.json.month, "2026-02");
    assert.equal(artifacts.json.transactionCount, 2);
    assert.equal(artifacts.json.deadlineCount, 1);

    assert.ok(artifacts.markdown.includes("# Monthly Finance Summary (2026-02)"));
    assert.ok(artifacts.markdown.includes("- Revenue: $1,500.00"));
    assert.ok(artifacts.markdown.includes("- Suggested tax reserve: $287.31"));
    assert.ok(artifacts.markdown.includes("| Date | Type | Category | Description | Amount | Receipt | Source |"));
    assert.ok(artifacts.markdown.includes("software\\|ops"));
    assert.ok(artifacts.markdown.includes("## Deadlines"));
  });

  test("uses empty-state copy when month has no records", () => {
    const artifacts = buildMonthlyExportArtifacts({
      month: "2026-03",
      currency: "USD",
      generatedAt: "2026-03-01T00:00:00.000Z",
      transactions: [],
      deadlines: [],
      summary: {
        ...summary,
        monthRevenue: 0,
        monthExpense: 0,
        monthProfit: 0,
        taxReserveSuggestion: 0,
        overdueDeadlines: 0,
        dueSoonDeadlines: 0,
        riskFlags: [],
      },
    });

    assert.ok(artifacts.markdown.includes("- None"));
    assert.ok(artifacts.markdown.includes("No transactions recorded for this month."));
    assert.ok(artifacts.markdown.includes("No deadlines with due dates in this month."));
  });
});
