import { test } from "node:test";
import assert from "node:assert";
import { buildSummary } from "../finance";
import { Transaction, Deadline, Settings } from "../types";

test("buildSummary OCR review risk flag", () => {
  const now = new Date("2026-02-25");
  const settings: Settings = { taxReserveRate: 0.25, currency: "USD" };
  const transactions: Transaction[] = [
    {
      id: "tx1",
      type: "expense",
      amount: 100,
      date: "2026-02-20",
      category: "Software",
      description: "Needs review",
      source: "import",
      createdAt: "2026-02-20T00:00:00Z",
      ocr: {
        provider: "mock",
        extractionConfidence: 0.5,
        reviewNeeded: true,
        reviewReasons: ["Low confidence"],
      },
    },
  ];
  const deadlines: Deadline[] = [];

  const summary = buildSummary(transactions, deadlines, [], settings, now);
  assert.ok(summary.riskFlags.some(f => f.includes("1 transaction(s) waiting for OCR review")));
});

test("buildSummary no OCR review risk flag when queue is empty", () => {
  const now = new Date("2026-02-25");
  const settings: Settings = { taxReserveRate: 0.25, currency: "USD" };
  const transactions: Transaction[] = [
    {
      id: "tx1",
      type: "expense",
      amount: 100,
      date: "2026-02-20",
      category: "Software",
      description: "Clean",
      source: "manual",
      createdAt: "2026-02-20T00:00:00Z",
    },
  ];
  const deadlines: Deadline[] = [];

  const summary = buildSummary(transactions, deadlines, [], settings, now);
  assert.ok(!summary.riskFlags.some(f => f.includes("waiting for OCR review")));
});
