import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { GET as getCashRunway } from "@/app/api/cash-runway/route";

const testDataFile = path.join(process.cwd(), "data", "store.json");

async function resetStore() {
  await fs.writeFile(
    testDataFile,
    JSON.stringify(
      {
        transactions: [
          {
            id: "tx-1",
            type: "expense",
            amount: 1800,
            date: "2026-02-20",
            category: "payroll",
            description: "",
            source: "manual",
            createdAt: "2026-02-20T00:00:00.000Z",
          },
          {
            id: "tx-2",
            type: "revenue",
            amount: 300,
            date: "2026-02-20",
            category: "sales",
            description: "",
            source: "manual",
            createdAt: "2026-02-20T00:00:00.000Z",
          },
        ],
        deadlines: [],
        receivables: [
          {
            id: "r-1",
            customerName: "Beta Co",
            amount: 500,
            amountPaid: 0,
            dueDate: "2026-02-26",
            status: "pending",
            reminderCount: 0,
            createdAt: "2026-02-20T00:00:00.000Z",
            updatedAt: "2026-02-20T00:00:00.000Z",
          },
        ],
        settings: { taxReserveRate: 0.25, currency: "USD", currentCashBalance: 250 },
        onboarding: { completedSteps: {} },
        billing: { subscriptionsByAccount: {}, updatedAt: new Date(0).toISOString() },
        reminderDispatches: {},
        receivableActionCounters: {},
        receivableActionEvents: [],
      },
      null,
      2,
    ),
  );
}

describe("GET /api/cash-runway", () => {
  it("returns 14-day runway summary payload", async () => {
    await resetStore();

    const response = await getCashRunway();
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      summary: {
        currentBalance: number;
        assumptions: { burnRateMultiplier: number; collectionConfidence: number };
        projection14d: Array<{ day: number; projectedBalance: number }>;
        projectionBands14d: Array<{ day: number; worstCaseBalance: number; baseCaseBalance: number; bestCaseBalance: number }>;
        riskLevel: "low" | "medium" | "high";
      };
    };

    assert.equal(payload.summary.currentBalance, 250);
    assert.equal(payload.summary.assumptions.burnRateMultiplier, 1);
    assert.equal(payload.summary.projection14d.length, 14);
    assert.equal(payload.summary.projectionBands14d.length, 14);
    assert.ok(["low", "medium", "high"].includes(payload.summary.riskLevel));
  });
});
