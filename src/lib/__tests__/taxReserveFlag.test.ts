import { test } from "node:test";
import assert from "node:assert";
import { buildSummary } from "../finance";
import { Transaction, Deadline, Settings } from "../types";

test("buildSummary high tax reserve risk flag", () => {
  const now = new Date("2026-02-25");
  const settings: Settings = { taxReserveRate: 0.25, currency: "USD" };
  const transactions: Transaction[] = [
    {
      id: "tx1",
      type: "revenue",
      amount: 25000,
      date: "2026-02-20",
      category: "Sales",
      description: "Big contract",
      source: "manual",
      createdAt: "2026-02-20T00:00:00Z",
    },
  ];
  const deadlines: Deadline[] = [];

  const summary = buildSummary(transactions, deadlines, [], settings, now);
  
  // Tax reserve = 25000 * 0.25 = 6250.
  // Since 6250 > 5000, it should flag.
  assert.ok(summary.riskFlags.some(f => f.includes("Large tax reserve suggested ($6,250.00)")), "Should flag large tax reserve");
});

test("buildSummary no high tax reserve risk flag for small amounts", () => {
  const now = new Date("2026-02-25");
  const settings: Settings = { taxReserveRate: 0.25, currency: "USD" };
  const transactions: Transaction[] = [
    {
      id: "tx1",
      type: "revenue",
      amount: 1000,
      date: "2026-02-20",
      category: "Sales",
      description: "Small sale",
      source: "manual",
      createdAt: "2026-02-20T00:00:00Z",
    },
  ];
  const deadlines: Deadline[] = [];

  const summary = buildSummary(transactions, deadlines, [], settings, now);
  
  // Tax reserve = 1000 * 0.25 = 250.
  // 250 < 5000, no flag.
  assert.ok(!summary.riskFlags.some(f => f.includes("Large tax reserve suggested")), "Should not flag small tax reserve");
});
