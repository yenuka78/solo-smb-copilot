import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildSummary } from "@/lib/finance";
import type { Transaction } from "@/lib/types";

describe("buildSummary revenue progress", () => {
  test("calculates revenue goal progress correctly", () => {
    const now = new Date("2026-02-20T00:00:00Z");

    const tx: Transaction[] = [
      {
        id: "1",
        type: "revenue",
        amount: 5000,
        date: "2026-02-05",
        category: "sales",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
    ];

    // 50% progress
    const result50 = buildSummary(tx, [], [], { taxReserveRate: 0.25, monthlyRevenueGoal: 10000 }, now);
    assert.equal(result50.monthlyRevenueGoal, 10000);
    assert.equal(result50.monthlyRevenueProgress, 0.5);

    // 100% progress
    const result100 = buildSummary(tx, [], [], { taxReserveRate: 0.25, monthlyRevenueGoal: 5000 }, now);
    assert.equal(result100.monthlyRevenueProgress, 1.0);

    // 100% cap for over-achievement
    const result120 = buildSummary(tx, [], [], { taxReserveRate: 0.25, monthlyRevenueGoal: 4000 }, now);
    assert.equal(result120.monthlyRevenueProgress, 1.0);

    // Undefined progress if goal is 0 or missing
    const resultNone = buildSummary(tx, [], [], { taxReserveRate: 0.25 }, now);
    assert.equal(resultNone.monthlyRevenueProgress, undefined);
    
    const resultZero = buildSummary(tx, [], [], { taxReserveRate: 0.25, monthlyRevenueGoal: 0 }, now);
    assert.equal(resultZero.monthlyRevenueProgress, undefined);
  });
});
