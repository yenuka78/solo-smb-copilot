import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { GET as getReceivables, PATCH as patchReceivables } from "@/app/api/receivables/route";
import { POST as postReminder } from "@/app/api/receivables/reminder/route";
import { addReceivable } from "../store";

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

describe("GET /api/receivables analytics", () => {
  it("returns lifetime and windowed conversion metrics", async () => {
    await resetStore();

    const receivable = await addReceivable({
      customerName: "Gamma",
      amount: 1000,
      amountPaid: 0,
      dueDate: "2026-02-20",
      status: "pending",
    });

    const reminderResponse = await postReminder(
      new Request("http://localhost/api/receivables/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: receivable.id, channel: "email" }),
      }),
    );
    assert.equal(reminderResponse.status, 200);

    const paymentResponse = await patchReceivables(
      new Request("http://localhost/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: receivable.id, action: "mark_partial", paymentAmount: 250 }),
      }),
    );
    assert.equal(paymentResponse.status, 200);

    const response = await getReceivables();
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      items: Array<{
        id: string;
        recommendedReminderChannel: "email" | "sms" | "whatsapp" | "phone" | "other";
        recommendedReminderReason: string;
        recommendedReminderConfidence: "low" | "medium" | "high";
        recommendedReminderTags: string[];
      }>;
      recommendationCalibration: {
        windowDays: 30;
        maxRecommendedConfidence: "low" | "medium" | "high";
      } | null;
      analytics: {
        lifetime: {
          remindersSent: number;
          paymentsCollectedCount: number;
          paymentsCollectedAmount: number;
          reminderToPaidCount: number;
          reminderToPaidAmount: number;
          reminderChannelPerformance: {
            email: {
              remindersSent: number;
              convertedCount: number;
              convertedAmount: number;
              conversionRate: number;
            };
          };
          recommendationBacktest: {
            remindersEvaluated: number;
            matchedRecommendationCount: number;
            realizedConversions: number;
            predictedConversions: number;
            byChannel: {
              email: {
                remindersEvaluated: number;
                realizedConversions: number;
              };
            };
            bySegment: Array<{ segmentKey: string; remindersEvaluated: number }>;
          };
        };
        windows: {
          "7d": {
            remindersSent: number;
            paymentsCollectedCount: number;
            reminderToPaidCount: number;
            recommendationBacktest: {
              remindersEvaluated: number;
              realizedConversions: number;
            };
            reminderChannelPerformance: {
              email: {
                remindersSent: number;
                convertedCount: number;
                convertedAmount: number;
                conversionRate: number;
              };
            };
          };
        };
      };
    };

    assert.equal(payload.analytics.lifetime.remindersSent, 1);
    assert.equal(payload.analytics.lifetime.paymentsCollectedCount, 1);
    assert.equal(payload.analytics.lifetime.paymentsCollectedAmount, 250);
    assert.equal(payload.analytics.lifetime.reminderToPaidCount, 1);
    assert.equal(payload.analytics.lifetime.reminderToPaidAmount, 250);

    assert.equal(payload.analytics.windows["7d"].remindersSent, 1);
    assert.equal(payload.analytics.windows["7d"].paymentsCollectedCount, 1);
    assert.equal(payload.analytics.windows["7d"].reminderToPaidCount, 1);
    assert.equal(payload.analytics.lifetime.reminderChannelPerformance.email.remindersSent, 1);
    assert.equal(payload.analytics.lifetime.reminderChannelPerformance.email.convertedCount, 1);
    assert.equal(payload.analytics.lifetime.reminderChannelPerformance.email.convertedAmount, 250);
    assert.equal(payload.analytics.windows["7d"].reminderChannelPerformance.email.conversionRate, 1);
    assert.equal(payload.analytics.lifetime.recommendationBacktest.remindersEvaluated, 1);
    assert.equal(payload.analytics.lifetime.recommendationBacktest.realizedConversions, 1);
    assert.ok(payload.analytics.lifetime.recommendationBacktest.predictedConversions >= 0);
    assert.equal(payload.analytics.lifetime.recommendationBacktest.byChannel.email.remindersEvaluated, 1);
    assert.equal(payload.analytics.lifetime.recommendationBacktest.byChannel.email.realizedConversions, 1);
    assert.ok(payload.analytics.lifetime.recommendationBacktest.bySegment.length >= 1);
    assert.equal(payload.analytics.windows["7d"].recommendationBacktest.remindersEvaluated, 1);
    assert.equal(payload.analytics.windows["7d"].recommendationBacktest.realizedConversions, 1);
    assert.equal(payload.recommendationCalibration, null);

    assert.equal(payload.items[0]?.id, receivable.id);
    assert.equal(payload.items[0]?.recommendedReminderChannel, "email");
    assert.equal(payload.items[0]?.recommendedReminderConfidence, "low");
    assert.match(payload.items[0]?.recommendedReminderReason ?? "", /Reusing last channel|Defaulting to email/);
    assert.ok(payload.items[0]?.recommendedReminderTags.includes("source:fallback"));
  });
});
