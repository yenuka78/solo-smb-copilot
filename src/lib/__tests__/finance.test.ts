import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildAlerts, buildSummary } from "@/lib/finance";
import type { Deadline, Transaction } from "@/lib/types";

describe("buildSummary", () => {
  test("calculates monthly totals, tax reserve, and risk flags", () => {
    const now = new Date("2026-02-20T00:00:00Z");

    const tx: Transaction[] = [
      {
        id: "1",
        type: "revenue",
        amount: 1000,
        date: "2026-02-05",
        category: "sales",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
      {
        id: "2",
        type: "expense",
        amount: 900,
        date: "2026-02-10",
        category: "ops",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
      {
        id: "3",
        type: "revenue",
        amount: 250,
        date: "2026-01-01",
        category: "sales",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
    ];

    const deadlines: Deadline[] = [
      {
        id: "d1",
        title: "VAT",
        dueDate: "2026-02-10",
        recurring: "quarterly",
        status: "open",
        notes: "",
        createdAt: now.toISOString(),
      },
      {
        id: "d2",
        title: "Payroll",
        dueDate: "2026-02-24",
        recurring: "monthly",
        status: "open",
        notes: "",
        createdAt: now.toISOString(),
      },
    ];

    const result = buildSummary(tx, deadlines, [], { taxReserveRate: 0.25, currency: "USD" }, now);

    assert.equal(result.monthRevenue, 1000);
    assert.equal(result.monthExpense, 900);
    assert.equal(result.prevMonthRevenue, 250);
    assert.equal(result.prevMonthExpense, 0);
    assert.equal(result.monthProfit, 100);
    assert.equal(result.monthProfitMargin, 0.1);
    assert.equal(result.taxReserveSuggestion, 25);
    assert.equal(result.overdueDeadlines, 1);
    assert.equal(result.dueSoonDeadlines, 1);
    assert.equal(result.riskFlags.length, 2);

    assert.equal(result.expenseCategories.length, 1);
    assert.equal(result.expenseCategories[0].category, "ops");
    assert.equal(result.expenseCategories[0].amount, 900);
    assert.equal(result.expenseCategories[0].percentage, 1.0);
  });

  test("calculates multiple expense categories correctly", () => {
    const now = new Date("2026-02-20T00:00:00Z");

    const tx: Transaction[] = [
      {
        id: "1",
        type: "expense",
        amount: 600,
        date: "2026-02-10",
        category: "Rent",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
      {
        id: "2",
        type: "expense",
        amount: 400,
        date: "2026-02-15",
        category: "Software",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
    ];

    const result = buildSummary(tx, [], [], { taxReserveRate: 0.25, currency: "USD" }, now);

    assert.equal(result.monthExpense, 1000);
    assert.equal(result.expenseCategories.length, 2);
    assert.equal(result.expenseCategories[0].category, "Rent");
    assert.equal(result.expenseCategories[0].amount, 600);
    assert.equal(result.expenseCategories[0].percentage, 0.6);
    assert.equal(result.expenseCategories[1].category, "Software");
    assert.equal(result.expenseCategories[1].amount, 400);
    assert.equal(result.expenseCategories[1].percentage, 0.4);
  });

  test("calculates multiple revenue categories correctly", () => {
    const now = new Date("2026-02-20T00:00:00Z");

    const tx: Transaction[] = [
      {
        id: "1",
        type: "revenue",
        amount: 700,
        date: "2026-02-10",
        category: "Services",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
      {
        id: "2",
        type: "revenue",
        amount: 300,
        date: "2026-02-15",
        category: "Digital Products",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
    ];

    const result = buildSummary(tx, [], [], { taxReserveRate: 0.25, currency: "USD" }, now);

    assert.equal(result.monthRevenue, 1000);
    assert.equal(result.revenueCategories.length, 2);
    assert.equal(result.revenueCategories[0].category, "Services");
    assert.equal(result.revenueCategories[0].amount, 700);
    assert.equal(result.revenueCategories[0].percentage, 0.7);
    assert.equal(result.revenueCategories[1].category, "Digital Products");
    assert.equal(result.revenueCategories[1].amount, 300);
    assert.equal(result.revenueCategories[1].percentage, 0.3);
  });

  test("treats due-today deadlines as due soon, not overdue", () => {
    const now = new Date("2026-02-20T18:30:00Z");

    const deadlines: Deadline[] = [
      {
        id: "d-today",
        title: "Sales tax filing",
        dueDate: "2026-02-20",
        recurring: "monthly",
        status: "open",
        notes: "",
        createdAt: now.toISOString(),
      },
    ];

    const result = buildSummary([], deadlines, [], { taxReserveRate: 0.25, currency: "USD" }, now);

    assert.equal(result.overdueDeadlines, 0);
    assert.equal(result.dueSoonDeadlines, 1);
  });
});

describe("buildAlerts", () => {
  test("generates actionable alerts", () => {
    const now = new Date("2026-02-20T00:00:00Z");
    const tx: Transaction[] = [
      {
        id: "1",
        type: "expense",
        amount: 150,
        date: "2026-02-05",
        category: "ads",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
      {
        id: "2",
        type: "revenue",
        amount: 100,
        date: "2026-02-10",
        category: "sales",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
      {
        id: "3",
        type: "revenue",
        amount: 1000,
        date: "2026-01-10",
        category: "sales",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
    ];

    const deadlines: Deadline[] = [
      {
        id: "d1",
        title: "Quarterly tax estimate",
        dueDate: "2026-02-21",
        recurring: "quarterly",
        status: "open",
        notes: "",
        createdAt: now.toISOString(),
      },
    ];

    const alerts = buildAlerts(tx, deadlines, 0.25, now);
    assert.ok(alerts.length >= 2);
    assert.ok(alerts.some((a) => a.type === "missing_receipt"));
    assert.ok(alerts.some((a) => a.type === "revenue_drop"));
  });

  test("does not flag due-today deadlines as overdue", () => {
    const now = new Date("2026-02-20T18:30:00Z");

    const deadlines: Deadline[] = [
      {
        id: "d1",
        title: "Quarterly tax estimate",
        dueDate: "2026-02-20",
        recurring: "quarterly",
        status: "open",
        notes: "",
        createdAt: now.toISOString(),
      },
    ];

    const alerts = buildAlerts([], deadlines, 0.25, now);

    assert.equal(alerts.some((a) => a.type === "overdue_deadline"), false);
    assert.equal(alerts.some((a) => a.type === "deadline_reserve_risk"), true);
  });
});
