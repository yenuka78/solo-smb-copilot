import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildSummary } from "../finance";
import type { Transaction, Deadline, Settings } from "../types";

describe("buildSummary goal and limit validation", () => {
  const settings: Settings = {
    taxReserveRate: 0.25,
    currency: "USD",
  };

  const deadlines: Deadline[] = [];
  const now = new Date("2026-02-25T12:00:00Z");

  test("returns risk flag when revenue goal is missed at end of month", () => {
    // End of month
    const eom = new Date("2026-02-28T23:59:59Z");
    const withGoal: Settings = { ...settings, monthlyRevenueGoal: 5000 };
    const lowRevenue: Transaction[] = [
      {
        id: "1",
        type: "revenue",
        amount: 3000,
        date: "2026-02-15",
        category: "Sales",
        description: "",
        source: "manual",
        createdAt: "2026-02-15T00:00:00Z",
      },
    ];

    const summary = buildSummary(lowRevenue, deadlines, [], withGoal, eom);
    assert.ok(summary.riskFlags.some(f => f.includes("Revenue goal") && f.includes("missed")));
  });

  test("does not return revenue risk flag before end of month", () => {
    const midMonth = new Date("2026-02-15T12:00:00Z");
    const withGoal: Settings = { ...settings, monthlyRevenueGoal: 5000 };
    const summary = buildSummary([], deadlines, [], withGoal, midMonth);
    assert.ok(!summary.riskFlags.some(f => f.includes("Revenue goal")));
  });

  test("returns risk flag when expense limit is exceeded", () => {
    const withLimit: Settings = { ...settings, monthlyExpenseLimit: 1000 };
    const highExpense: Transaction[] = [
      {
        id: "1",
        type: "expense",
        amount: 1200,
        date: "2026-02-10",
        category: "Ads",
        description: "",
        source: "manual",
        createdAt: "2026-02-10T00:00:00Z",
      },
    ];

    const summary = buildSummary(highExpense, deadlines, [], withLimit, now);
    assert.ok(summary.riskFlags.some(f => f.includes("Monthly expense limit") && f.includes("exceeded")));
  });

  test("returns warning flag when expense limit is nearly reached (90%+)", () => {
    const withLimit: Settings = { ...settings, monthlyExpenseLimit: 1000 };
    const nearLimit: Transaction[] = [
      {
        id: "1",
        type: "expense",
        amount: 950,
        date: "2026-02-10",
        category: "Ads",
        description: "",
        source: "manual",
        createdAt: "2026-02-10T00:00:00Z",
      },
    ];

    const summary = buildSummary(nearLimit, deadlines, [], withLimit, now);
    assert.ok(summary.riskFlags.some(f => f.includes("Warning") && f.includes("95%") && f.includes("expense limit")));
  });
});
