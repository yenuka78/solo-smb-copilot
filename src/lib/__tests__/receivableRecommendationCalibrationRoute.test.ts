import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { POST as postCalibration } from "@/app/api/receivables/recommendation-calibration/route";
import { addReceivable, readStore, recordReceivableActionEvents } from "../store";

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

describe("POST /api/receivables/recommendation-calibration", () => {
  it("persists a 30-day confidence cap from backtest error", async () => {
    await resetStore();

    const r1 = await addReceivable({
      customerName: "Cal One",
      amount: 1000,
      amountPaid: 0,
      dueDate: "2026-02-20",
      status: "pending",
    });

    const r2 = await addReceivable({
      customerName: "Cal Two",
      amount: 2000,
      amountPaid: 0,
      dueDate: "2026-02-20",
      status: "pending",
    });

    const d1 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const d2 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await recordReceivableActionEvents([
      {
        receivableId: r1.id,
        actionType: "log_reminder",
        channel: "email",
        createdAt: d1,
      },
      {
        receivableId: r2.id,
        actionType: "log_reminder",
        channel: "email",
        createdAt: d2,
      },
    ]);

    const response = await postCalibration();
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      recommendationCalibration: {
        windowDays: 30;
        remindersEvaluated: number;
        maxRecommendedConfidence: "low" | "medium" | "high";
        status: "stable" | "watch" | "degraded";
      };
    };

    assert.equal(payload.recommendationCalibration.windowDays, 30);
    assert.equal(payload.recommendationCalibration.remindersEvaluated, 2);
    assert.equal(payload.recommendationCalibration.maxRecommendedConfidence, "low");
    assert.equal(payload.recommendationCalibration.status, "watch");

    const store = await readStore();
    assert.equal(store.settings.receivableRecommendationCalibration?.windowDays, 30);
    assert.equal(store.settings.receivableRecommendationCalibration?.maxRecommendedConfidence, "low");
  });
});
