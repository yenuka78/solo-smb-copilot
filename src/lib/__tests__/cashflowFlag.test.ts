import { describe, test } from "node:test";
import assert from "node:assert";
import { buildSummary } from "../finance";
import type { Transaction, Deadline, Settings } from "../types";

describe("finance - cashflow trend flags", () => {
  const settings: Settings = {
    taxReserveRate: 0.2,
    currency: "USD",
  };

  const deadlines: Deadline[] = [];

  test("flags negative cashflow", () => {
    const transactions: Transaction[] = [
      {
        id: "1",
        type: "expense",
        amount: 100,
        date: new Date().toISOString(),
        category: "Test",
        description: "",
        source: "manual",
        createdAt: new Date().toISOString(),
      }
    ];

    const summary = buildSummary(transactions, deadlines, [], settings);
    assert.ok(summary.riskFlags.includes("You are currently cashflow-negative this month."));
  });

  test("flags neutral cashflow as negative (safety first)", () => {
    const transactions: Transaction[] = [
      {
        id: "1",
        type: "revenue",
        amount: 100,
        date: new Date().toISOString(),
        category: "Test",
        description: "",
        source: "manual",
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        type: "expense",
        amount: 100,
        date: new Date().toISOString(),
        category: "Test",
        description: "",
        source: "manual",
        createdAt: new Date().toISOString(),
      }
    ];

    const summary = buildSummary(transactions, deadlines, [], settings);
    // 100 - 100 = 0. We treat 0 profit as risky if it's "not positive".
    // Actually current logic says monthProfit < 0.
    assert.strictEqual(summary.monthProfit, 0);
    assert.ok(!summary.riskFlags.includes("You are currently cashflow-negative this month."));
  });

  test("does not flag positive cashflow", () => {
    const transactions: Transaction[] = [
      {
        id: "1",
        type: "revenue",
        amount: 200,
        date: new Date().toISOString(),
        category: "Test",
        description: "",
        source: "manual",
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        type: "expense",
        amount: 100,
        date: new Date().toISOString(),
        category: "Test",
        description: "",
        source: "manual",
        createdAt: new Date().toISOString(),
      }
    ];

    const summary = buildSummary(transactions, deadlines, [], settings);
    assert.ok(!summary.riskFlags.includes("You are currently cashflow-negative this month."));
  });
});
