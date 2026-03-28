import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PATCH } from "@/app/api/receivables/route";
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

describe("PATCH /api/receivables action branches", () => {
  it("marks a receivable paid and records last action metadata", async () => {
    await resetStore();

    const receivable = await addReceivable({
      customerName: "Acme",
      amount: 1200,
      amountPaid: 0,
      dueDate: "2026-02-20",
      status: "pending",
      description: "Invoice #100",
    });

    const response = await PATCH(
      new Request("http://localhost/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: receivable.id, action: "mark_paid" }),
      }),
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { status: string; amountPaid: number; lastActionType?: string };
    assert.equal(payload.status, "paid");
    assert.equal(payload.amountPaid, 1200);
    assert.equal(payload.lastActionType, "mark_paid");

    const store = await readStore();
    assert.equal(store.receivableActionCounters.mark_paid, 1);

    const markPaidEvent = store.receivableActionEvents.find((event) => event.actionType === "mark_paid");
    assert.equal(markPaidEvent?.receivableId, receivable.id);
    assert.equal(markPaidEvent?.amountCollected, 1200);
  });

  it("rejects invalid partial payment payload", async () => {
    await resetStore();

    const receivable = await addReceivable({
      customerName: "Beta",
      amount: 500,
      amountPaid: 0,
      dueDate: "2026-02-20",
      status: "pending",
    });

    const response = await PATCH(
      new Request("http://localhost/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: receivable.id, action: "mark_partial", paymentAmount: 0 }),
      }),
    );

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: string };
    assert.match(payload.error, /paymentAmount/);
  });

  it("bulk marks selected receivables paid", async () => {
    await resetStore();

    const a = await addReceivable({
      customerName: "Client A",
      amount: 300,
      amountPaid: 0,
      dueDate: "2026-02-20",
      status: "pending",
    });

    const b = await addReceivable({
      customerName: "Client B",
      amount: 450,
      amountPaid: 100,
      dueDate: "2026-02-21",
      status: "partial",
    });

    const response = await PATCH(
      new Request("http://localhost/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_mark_paid", ids: [a.id, b.id] }),
      }),
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { updatedCount: number; updatedIds: string[] };
    assert.equal(payload.updatedCount, 2);
    assert.deepEqual(payload.updatedIds.sort(), [a.id, b.id].sort());

    const store = await readStore();
    const updatedA = store.receivables.find((item) => item.id === a.id);
    const updatedB = store.receivables.find((item) => item.id === b.id);

    assert.equal(updatedA?.status, "paid");
    assert.equal(updatedA?.lastActionType, "bulk_mark_paid");
    assert.equal(updatedB?.status, "paid");
    assert.equal(updatedB?.lastActionType, "bulk_mark_paid");
    assert.equal(store.receivableActionCounters.bulk_mark_paid, 2);

    const bulkPaidEvents = store.receivableActionEvents.filter((event) => event.actionType === "bulk_mark_paid");
    assert.equal(bulkPaidEvents.length, 2);
    assert.equal(
      bulkPaidEvents.reduce((sum, event) => sum + (event.amountCollected ?? 0), 0),
      650,
    );
  });

  it("bulk snooze validates date and updates follow-up dates", async () => {
    await resetStore();

    const receivable = await addReceivable({
      customerName: "Client C",
      amount: 800,
      amountPaid: 0,
      dueDate: "2026-02-20",
      status: "pending",
    });

    const badResponse = await PATCH(
      new Request("http://localhost/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_snooze", ids: [receivable.id], nextFollowUpDate: "bad-date" }),
      }),
    );

    assert.equal(badResponse.status, 400);

    const goodResponse = await PATCH(
      new Request("http://localhost/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_snooze", ids: [receivable.id], nextFollowUpDate: "2026-03-01" }),
      }),
    );

    assert.equal(goodResponse.status, 200);

    const store = await readStore();
    const updated = store.receivables.find((item) => item.id === receivable.id);
    assert.equal(updated?.nextFollowUpDate, "2026-03-01");
    assert.equal(updated?.lastActionType, "bulk_snooze");
    assert.equal(store.receivableActionCounters.bulk_snooze, 1);
  });
});
