import assert from "node:assert/strict";
import { describe, test, before, after } from "node:test";
import { addDeadline, deleteDeadline, readStore, writeStore } from "../store";
import type { Store } from "../types";

describe("deleteDeadline", () => {
  let originalStore: Store;

  before(async () => {
    originalStore = await readStore();
  });

  after(async () => {
    await writeStore(originalStore);
  });

  test("deletes a deadline and returns true", async () => {
    const deadline = await addDeadline({
      title: "Test Deadline",
      dueDate: "2026-12-31",
      recurring: "none",
      status: "open",
      notes: ""
    });

    const storeBefore = await readStore();
    assert.ok(storeBefore.deadlines.find(d => d.id === deadline.id));

    const success = await deleteDeadline(deadline.id);
    assert.strictEqual(success, true);

    const storeAfter = await readStore();
    assert.strictEqual(storeAfter.deadlines.find(d => d.id === deadline.id), undefined);
  });

  test("returns false for non-existent deadline", async () => {
    const success = await deleteDeadline("non-existent-id");
    assert.strictEqual(success, false);
  });
});
