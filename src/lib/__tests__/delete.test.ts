import { describe, it } from "node:test";
import assert from "node:assert";
import { addTransaction, deleteTransaction, readStore } from "../store";

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
    billing: { subscriptionsByAccount: {} }
  }, null, 2));
}

describe("deleteTransaction", () => {
  it("should delete a transaction by ID", async () => {
    await resetStore();
    
    // Add two transactions
    const tx1 = await addTransaction({
      type: "revenue",
      amount: 100,
      date: "2026-01-01",
      category: "sales",
      description: "sale 1",
      source: "manual"
    });

    const tx2 = await addTransaction({
      type: "expense",
      amount: 50,
      date: "2026-01-02",
      category: "software",
      description: "tool",
      source: "manual"
    });

    let store = await readStore();
    assert.strictEqual(store.transactions.length, 2);

    // Delete first one
    const success = await deleteTransaction(tx1.id);
    assert.strictEqual(success, true);

    store = await readStore();
    assert.strictEqual(store.transactions.length, 1);
    assert.strictEqual(store.transactions[0].id, tx2.id);
  });

  it("should return false if transaction ID not found", async () => {
    await resetStore();
    const success = await deleteTransaction("non-existent-id");
    assert.strictEqual(success, false);
  });
});
