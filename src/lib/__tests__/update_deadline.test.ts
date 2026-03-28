import { describe, it } from "node:test";
import assert from "node:assert";
import { addDeadline, updateDeadline, readStore } from "../store";

// Mock FS for store
import { promises as fs } from "node:fs";
import path from "node:path";

const testDataFile = path.join(process.cwd(), "data", "store.json");

// Helper to reset store
async function resetStore() {
  await fs.writeFile(testDataFile, JSON.stringify({
    transactions: [],
    deadlines: [],
    settings: { taxReserveRate: 0.25, currency: "USD" },
    onboarding: { completedSteps: {} },
    billing: { subscriptionsByAccount: {} },
    reminderDispatches: {}
  }, null, 2));
}

describe("updateDeadline", () => {
  it("should update an existing deadline partially", async () => {
    await resetStore();
    
    const d1 = await addDeadline({
      title: "Tax Day",
      dueDate: "2026-04-15",
      recurring: "none",
      status: "open",
      notes: "Initial note"
    });

    const updated = await updateDeadline({
      id: d1.id,
      title: "New Tax Day",
      notes: "Updated note"
    });

    assert.ok(updated);
    assert.strictEqual(updated?.title, "New Tax Day");
    assert.strictEqual(updated?.notes, "Updated note");
    assert.strictEqual(updated?.dueDate, "2026-04-15"); // Unchanged
    assert.strictEqual(updated?.status, "open"); // Unchanged

    const store = await readStore();
    assert.strictEqual(store.deadlines[0].title, "New Tax Day");
  });

  it("should update all fields of a deadline", async () => {
    await resetStore();
    
    const d1 = await addDeadline({
      title: "Old",
      dueDate: "2026-01-01",
      recurring: "none",
      status: "open"
    });

    const updated = await updateDeadline({
      id: d1.id,
      title: "New",
      dueDate: "2026-12-31",
      recurring: "monthly",
      status: "done",
      notes: "Final notes"
    });

    assert.ok(updated);
    assert.strictEqual(updated?.title, "New");
    assert.strictEqual(updated?.dueDate, "2026-12-31");
    assert.strictEqual(updated?.recurring, "monthly");
    assert.strictEqual(updated?.status, "done");
    assert.strictEqual(updated?.notes, "Final notes");
  });

  it("should return null if deadline ID not found", async () => {
    await resetStore();
    const result = await updateDeadline({
      id: "non-existent-id",
      title: "Will fail"
    });
    assert.strictEqual(result, null);
  });
});
