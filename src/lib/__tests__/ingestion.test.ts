import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveUploadMetadata } from "@/lib/ingestion";
import type { DocumentParseResult } from "@/lib/parser";

const parsedBase: DocumentParseResult = {
  provider: "mock",
  fields: {
    amount: 120.5,
    date: "2026-02-12",
    type: "expense",
    category: "software",
    description: "Auto-parsed from invoice",
  },
  confidence: {
    amount: 0.9,
    date: 0.9,
    type: 0.8,
    category: 0.75,
    description: 0.7,
    overall: 0.84,
  },
  reviewNeeded: false,
  reviewReasons: [],
};

describe("resolveUploadMetadata", () => {
  test("uses OCR fields when manual metadata is missing", () => {
    const resolved = resolveUploadMetadata(
      {
        amount: 0,
        date: "",
        type: "",
        category: "",
        description: "",
      },
      parsedBase,
    );

    assert.equal(resolved.type, "expense");
    assert.equal(resolved.amount, 120.5);
    assert.equal(resolved.date, "2026-02-12");
    assert.equal(resolved.reviewNeeded, false);
  });

  test("preserves manual values and review flag for missing required fields", () => {
    const resolved = resolveUploadMetadata(
      {
        type: "revenue",
        amount: 500,
        date: "",
        category: "consulting",
        description: "Manual override",
      },
      {
        ...parsedBase,
        fields: {
          ...parsedBase.fields,
          date: undefined,
        },
        confidence: {
          ...parsedBase.confidence,
          overall: 0.6,
        },
        reviewNeeded: true,
        reviewReasons: ["Overall extraction confidence is below threshold."],
      },
    );

    assert.equal(resolved.type, "revenue");
    assert.equal(resolved.amount, 500);
    assert.equal(resolved.category, "consulting");
    assert.equal(resolved.description, "Manual override");
    assert.equal(resolved.reviewNeeded, true);
    assert.ok(resolved.reviewReasons.some((reason) => reason.includes("Date is missing")));
  });
});
