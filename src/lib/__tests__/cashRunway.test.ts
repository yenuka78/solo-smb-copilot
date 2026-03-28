import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildCashRunwaySummary } from "@/lib/cashRunway";
import type { Receivable, Settings, Transaction } from "@/lib/types";

describe("buildCashRunwaySummary", () => {
  test("flags high risk when burn and low cash project a 14-day cash-out", () => {
    const now = new Date("2026-02-25T00:00:00Z");
    const transactions: Transaction[] = [
      {
        id: "t1",
        type: "expense",
        amount: 3000,
        date: "2026-02-10",
        category: "payroll",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
      {
        id: "t2",
        type: "revenue",
        amount: 500,
        date: "2026-02-12",
        category: "services",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
    ];

    const receivables: Receivable[] = [
      {
        id: "r1",
        customerName: "ACME",
        amount: 600,
        amountPaid: 0,
        dueDate: "2026-02-28",
        status: "pending",
        reminderCount: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ];

    const settings: Settings = {
      taxReserveRate: 0.25,
      currency: "USD",
      currentCashBalance: 400,
    };

    const summary = buildCashRunwaySummary(transactions, receivables, settings, now);

    assert.equal(summary.currentBalance, 400);
    assert.equal(summary.riskLevel, "high");
    assert.ok(summary.daysUntilCashOut !== null);
    assert.ok(summary.expectedReceivableInflow14d > 0);
    assert.equal(summary.projection14d.length, 14);
    assert.equal(summary.projectionBands14d.length, 14);
    assert.equal(summary.assumptions.burnRateMultiplier, 1);
    assert.equal(summary.assumptions.collectionConfidence, 1);
    assert.ok(summary.suggestedActions.length > 0);
  });

  test("returns null runway when average daily net is positive", () => {
    const now = new Date("2026-02-25T00:00:00Z");
    const transactions: Transaction[] = [
      {
        id: "t1",
        type: "revenue",
        amount: 9000,
        date: "2026-02-15",
        category: "services",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
      {
        id: "t2",
        type: "expense",
        amount: 1200,
        date: "2026-02-16",
        category: "software",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
    ];

    const settings: Settings = {
      taxReserveRate: 0.25,
      currency: "USD",
      currentCashBalance: 2500,
    };

    const summary = buildCashRunwaySummary(transactions, [], settings, now);

    assert.equal(summary.averageDailyNet > 0, true);
    assert.equal(summary.runwayDays, null);
    assert.equal(summary.daysUntilCashOut, null);
    assert.equal(summary.riskLevel, "low");
  });

  test("applies forecast assumptions and exposes best/base/worst projection bands", () => {
    const now = new Date("2026-02-25T00:00:00Z");
    const transactions: Transaction[] = [
      {
        id: "t1",
        type: "expense",
        amount: 2400,
        date: "2026-02-15",
        category: "payroll",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
      {
        id: "t2",
        type: "revenue",
        amount: 1200,
        date: "2026-02-16",
        category: "services",
        description: "",
        source: "manual",
        createdAt: now.toISOString(),
      },
    ];

    const receivables: Receivable[] = [
      {
        id: "r1",
        customerName: "Orion Ltd",
        amount: 1000,
        amountPaid: 0,
        dueDate: "2026-02-27",
        status: "pending",
        reminderCount: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ];

    const baseline = buildCashRunwaySummary(
      transactions,
      receivables,
      { taxReserveRate: 0.25, currency: "USD", currentCashBalance: 1000 },
      now,
    );

    const stressed = buildCashRunwaySummary(
      transactions,
      receivables,
      {
        taxReserveRate: 0.25,
        currency: "USD",
        currentCashBalance: 1000,
        cashBurnRateMultiplier: 1.5,
        receivableCollectionConfidence: 0.6,
      },
      now,
    );

    assert.equal(stressed.assumptions.burnRateMultiplier, 1.5);
    assert.equal(stressed.assumptions.collectionConfidence, 0.6);
    assert.ok(stressed.averageDailyNet < baseline.averageDailyNet);
    assert.ok(stressed.expectedReceivableInflow14d < baseline.expectedReceivableInflow14d);
    assert.equal(stressed.projectionBands14d.length, 14);

    const firstBand = stressed.projectionBands14d[0];
    assert.ok(firstBand.worstCaseBalance <= firstBand.baseCaseBalance);
    assert.ok(firstBand.baseCaseBalance <= firstBand.bestCaseBalance);
  });
});
