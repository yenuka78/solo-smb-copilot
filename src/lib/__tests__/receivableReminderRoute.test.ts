import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { POST } from "@/app/api/receivables/reminder/route";
import { addReceivable, readStore } from "../store";

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

describe("POST /api/receivables/reminder", () => {
  it("bulk drafts reminders, logs touch events, and increments analytics counters", async () => {
    await resetStore();

    const first = await addReceivable({
      customerName: "Client A",
      amount: 600,
      amountPaid: 0,
      dueDate: "2026-02-20",
      status: "pending",
      description: "Invoice A",
    });

    const second = await addReceivable({
      customerName: "Client B",
      amount: 900,
      amountPaid: 100,
      dueDate: "2026-02-18",
      status: "partial",
      description: "Invoice B",
    });

    const response = await POST(
      new Request("http://localhost/api/receivables/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [first.id, second.id], channel: "sms" }),
      }),
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      updatedCount: number;
      drafts: Array<{ id: string; customerName: string; draft: string }>;
    };

    assert.equal(payload.updatedCount, 2);
    assert.equal(payload.drafts.length, 2);
    assert.deepEqual(
      payload.drafts.map((entry) => entry.id).sort(),
      [first.id, second.id].sort(),
    );

    const store = await readStore();
    const updatedFirst = store.receivables.find((item) => item.id === first.id);
    const updatedSecond = store.receivables.find((item) => item.id === second.id);

    assert.equal(updatedFirst?.reminderCount, 1);
    assert.equal(updatedFirst?.lastReminderChannel, "sms");
    assert.equal(updatedFirst?.lastActionType, "bulk_log_reminder");

    assert.equal(updatedSecond?.reminderCount, 1);
    assert.equal(updatedSecond?.lastReminderChannel, "sms");
    assert.equal(updatedSecond?.lastActionType, "bulk_log_reminder");

    assert.equal(store.receivableActionCounters.bulk_log_reminder, 2);
    assert.equal(store.receivableActionCounters.reminder_sms, 2);

    const reminderEvents = store.receivableActionEvents.filter((event) => event.actionType === "bulk_log_reminder");
    assert.equal(reminderEvents.length, 2);
    assert.ok(reminderEvents.every((event) => event.channel === "sms"));
  });
});
