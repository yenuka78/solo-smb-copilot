import { describe, it } from "node:test";
import assert from "node:assert";
import { addTransaction, updateTransaction, readStore } from "../store";

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

describe("updateTransaction", () => {
  it("should update a transaction by ID", async () => {
    await resetStore();
    
    // Add transaction
    const tx = await addTransaction({
      type: "revenue",
      amount: 100,
      date: "2026-01-01",
      category: "sales",
      description: "initial sale",
      source: "manual"
    });

    // Update amount and description
    const updated = await updateTransaction({
      id: tx.id,
      amount: 200,
      description: "updated sale"
    });

    assert.ok(updated, "Transaction should be updated");
    assert.strictEqual(updated.amount, 200);
    assert.strictEqual(updated.description, "updated sale");
    assert.strictEqual(updated.category, "sales", "Category should remain unchanged");

    // Verify persistence
    const store = await readStore();
    const storedTx = store.transactions.find((t) => t.id === tx.id);
    assert.ok(storedTx);
    assert.strictEqual(storedTx.amount, 200);
    assert.strictEqual(storedTx.description, "updated sale");
  });

  it("should clear OCR review flags on update", async () => {
    await resetStore();
    
    // Add transaction with OCR flags manually (since addTransaction doesn't support adding OCR data directly in the helper function signature, we manipulate the store directly for setup or trust addTransaction if modified, but let's assume we can't easily add OCR via helper without modifying it. Wait, addTransaction takes Omit<Transaction, "id" | "createdAt"> so we CAN pass ocr if we want, technically, if the type allows it. Let's check type definition.)
    
    // Actually addTransaction takes Omit<Transaction, "id" | "createdAt">.
    // So we can pass ocr.
    
    const tx = await addTransaction({
      type: "expense",
      amount: 50,
      date: "2026-01-02",
      category: "food",
      description: "lunch",
      source: "import",
      ocr: {
        provider: "mock" as const,
        extractionConfidence: 0.5,
        reviewNeeded: true,
        reviewReasons: ["low confidence"]
      }
    });

    // Verify it has reviewNeeded = true
    let store = await readStore();
    let storedTx = store.transactions.find((t) => t.id === tx.id);
    assert.strictEqual(storedTx?.ocr?.reviewNeeded, true);

    // Update it
    await updateTransaction({
      id: tx.id,
      amount: 55
    });

    // Verify reviewNeeded = false
    store = await readStore();
    storedTx = store.transactions.find((t) => t.id === tx.id);
    assert.strictEqual(storedTx?.ocr?.reviewNeeded, false);
    assert.strictEqual(storedTx?.ocr?.reviewReasons.length, 0);
  });

  it("should update and clear receipt name when provided", async () => {
    await resetStore();

    const tx = await addTransaction({
      type: "expense",
      amount: 89,
      date: "2026-01-03",
      category: "software",
      description: "tool subscription",
      source: "manual",
      receiptName: "receipt-original.pdf"
    });

    const updated = await updateTransaction({
      id: tx.id,
      receiptName: "receipt-updated.pdf"
    });

    assert.ok(updated);
    assert.strictEqual(updated.receiptName, "receipt-updated.pdf");

    const cleared = await updateTransaction({
      id: tx.id,
      receiptName: undefined
    });

    assert.ok(cleared);
    assert.strictEqual(cleared.receiptName, undefined);

    const store = await readStore();
    const storedTx = store.transactions.find((t) => t.id === tx.id);
    assert.ok(storedTx);
    assert.strictEqual(storedTx.receiptName, undefined);
  });

  it("should return null if transaction ID not found", async () => {
    await resetStore();
    const result = await updateTransaction({ id: "non-existent-id", amount: 100 });
    assert.strictEqual(result, null);
  });
});
