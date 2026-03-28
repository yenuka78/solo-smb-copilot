import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { GET as getOwnerActions } from "@/app/api/owner-actions/route";

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
            amount: 1200,
            date: "2026-02-20",
            category: "software",
            description: "Tooling",
            source: "manual",
            createdAt: "2026-02-20T00:00:00.000Z",
          },
          {
            id: "tx-2",
            type: "revenue",
            amount: 800,
            date: "2026-02-21",
            category: "retainer",
            description: "Monthly retainer",
            source: "manual",
            createdAt: "2026-02-21T00:00:00.000Z",
          },
        ],
        deadlines: [
          {
            id: "d-1",
            title: "Tax filing",
            dueDate: "2026-02-27",
            recurring: "monthly",
            status: "open",
            createdAt: "2026-02-01T00:00:00.000Z",
          },
        ],
        receivables: [
          {
            id: "r-1",
            customerName: "Omega LLC",
            amount: 1400,
            amountPaid: 0,
            dueDate: "2026-02-18",
            status: "overdue",
            reminderCount: 1,
            createdAt: "2026-02-10T00:00:00.000Z",
            updatedAt: "2026-02-20T00:00:00.000Z",
          },
        ],
        settings: { taxReserveRate: 0.25, currency: "USD", currentCashBalance: 300 },
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

describe("GET /api/owner-actions", () => {
  it("returns weekly top owner actions with expected cash impact", async () => {
    await resetStore();

    const response = await getOwnerActions();
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      brief: {
        generatedAt: string;
        windowDays: number;
        topActions: Array<{ id: string; expectedCashImpact14d: number }>;
        totalExpectedImpact14d: number;
      };
    };

    assert.equal(payload.brief.windowDays, 14);
    assert.ok(payload.brief.generatedAt.length > 0);
    assert.ok(payload.brief.topActions.length >= 1);
    assert.ok(payload.brief.topActions.length <= 5);
    assert.ok(payload.brief.totalExpectedImpact14d >= 0);
    assert.ok(payload.brief.topActions.every((action) => action.id && action.expectedCashImpact14d >= 0));
  });
});
