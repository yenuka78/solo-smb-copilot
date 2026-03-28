import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildSummary } from "@/lib/finance";
import { Transaction, Deadline, Settings } from "@/lib/types";

describe("finance buildSummary expense limit", () => {
  const settings: Settings = {
    taxReserveRate: 0.25,
    currency: "USD",
    monthlyExpenseLimit: 1000,
  };

  const deadlines: Deadline[] = [];
  const now = new Date("2026-02-25T10:00:00Z");

  test("calculates expense progress correctly when limit is set", () => {
    const transactions: Transaction[] = [
      {
        id: "1",
        type: "expense",
        amount: 400,
        date: "2026-02-15",
        category: "Software",
        description: "Cloud",
        source: "manual",
        createdAt: new Date().toISOString(),
      },
    ];

    const summary = buildSummary(transactions, deadlines, [], settings, now);
    assert.equal(summary.monthlyExpenseLimit, 1000);
    assert.equal(summary.monthlyExpenseProgress, 0.4);
  });

  test("caps expense progress at 1.0 when over limit", () => {
    const transactions: Transaction[] = [
      {
        id: "1",
        type: "expense",
        amount: 1200,
        date: "2026-02-15",
        category: "Software",
        description: "Cloud",
        source: "manual",
        createdAt: new Date().toISOString(),
      },
    ];

    const summary = buildSummary(transactions, deadlines, [], settings, now);
    assert.equal(summary.monthlyExpenseProgress, 1);
  });

  test("returns undefined for expense progress when limit is missing or zero", () => {
    const noLimitSettings: Settings = { ...settings, monthlyExpenseLimit: undefined };
    const summaryNoLimit = buildSummary([], deadlines, [], noLimitSettings, now);
    assert.equal(summaryNoLimit.monthlyExpenseProgress, undefined);

    const zeroLimitSettings: Settings = { ...settings, monthlyExpenseLimit: 0 };
    const summaryZeroLimit = buildSummary([], deadlines, [], zeroLimitSettings, now);
    assert.equal(summaryZeroLimit.monthlyExpenseProgress, undefined);
  });
});
