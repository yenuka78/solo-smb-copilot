import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PATCH as patchDashboard } from "@/app/api/dashboard/route";
import { readStore } from "@/lib/store";

const testDataFile = path.join(process.cwd(), "data", "store.json");

async function resetStore() {
  await fs.writeFile(
    testDataFile,
    JSON.stringify(
      {
        transactions: [],
        deadlines: [],
        receivables: [],
        settings: { taxReserveRate: 0.25, currency: "USD" },
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

describe("PATCH /api/dashboard currentCashBalance", () => {
  it("persists cash runway settings in dashboard settings", async () => {
    await resetStore();

    const response = await patchDashboard(
      new Request("http://localhost/api/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentCashBalance: 3200,
          cashBurnRateMultiplier: 1.25,
          receivableCollectionConfidence: 0.85,
        }),
      }),
    );

    assert.equal(response.status, 200);
    const store = await readStore();
    assert.equal(store.settings.currentCashBalance, 3200);
    assert.equal(store.settings.cashBurnRateMultiplier, 1.25);
    assert.equal(store.settings.receivableCollectionConfidence, 0.85);
  });

  it("rejects invalid cash runway assumption ranges", async () => {
    await resetStore();

    const negativeCashResponse = await patchDashboard(
      new Request("http://localhost/api/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentCashBalance: -1 }),
      }),
    );

    assert.equal(negativeCashResponse.status, 400);

    const burnResponse = await patchDashboard(
      new Request("http://localhost/api/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashBurnRateMultiplier: 2.5 }),
      }),
    );

    assert.equal(burnResponse.status, 400);

    const confidenceResponse = await patchDashboard(
      new Request("http://localhost/api/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receivableCollectionConfidence: 2 }),
      }),
    );

    assert.equal(confidenceResponse.status, 400);
  });
});
