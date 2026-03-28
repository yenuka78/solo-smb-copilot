import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildTransactionListCsv } from "@/lib/transactionsCsv";

describe("buildTransactionListCsv", () => {
  test("escapes quotes across all fields and keeps CSV shape stable", () => {
    const csv = buildTransactionListCsv([
      {
        date: "2026-02-22",
        type: "expense",
        category: 'Office "Ops"',
        description: 'Printer paper, size "A4"',
        amount: 45.5,
        receiptName: 'receipt "feb".pdf',
      },
    ]);

    assert.match(csv, /^"Date","Type","Category","Description","Amount","Receipt"/);
    assert.ok(csv.includes('"Office ""Ops"""'));
    assert.ok(csv.includes('"Printer paper, size ""A4"""'));
    assert.ok(csv.includes('"receipt ""feb"".pdf"'));
  });

  test("normalizes multiline text so one transaction stays on one CSV row", () => {
    const csv = buildTransactionListCsv([
      {
        date: "2026-02-22",
        type: "revenue",
        category: "Consulting",
        description: "Milestone 1\nPhase A",
        amount: 1200,
        receiptName: "invoice-2026-02.pdf",
      },
    ]);

    assert.ok(csv.includes('"Milestone 1 Phase A"'));
    assert.equal(csv.split("\n").length, 2);
  });
});
