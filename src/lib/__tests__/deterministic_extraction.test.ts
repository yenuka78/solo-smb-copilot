import { test, describe } from "node:test";
import assert from "node:assert";
import { normalizeExtractionConfidence } from "../parser";
import { resolveUploadMetadata } from "../ingestion";
import type { DocumentParseResult } from "../parser";

describe("Extraction Determinism & Conflict Reconciliation", () => {
  test("normalizeExtractionConfidence is deterministic", () => {
    const input = {
      amount: 0.95,
      date: 0.8,
      type: 0.7,
      category: 0.6,
      description: 0.5,
    };

    const first = normalizeExtractionConfidence(input);
    const second = normalizeExtractionConfidence(input);

    assert.deepStrictEqual(first, second);
    assert.ok(first.overall > 0);
    // Weighted: 0.95*0.3 + 0.8*0.25 + 0.7*0.2 + 0.6*0.1 + 0.5*0.15
    // = 0.285 + 0.2 + 0.14 + 0.06 + 0.075 = 0.76
    assert.strictEqual(first.overall, 0.76);
  });

  test("resolveUploadMetadata prioritizes manual input over parsed fields (Conflict Reconciliation)", () => {
    const manualInput = {
      amount: 100.0,
      date: "2026-03-01",
      category: "software",
      description: "Manual description",
    };

    const parsedResult: DocumentParseResult = {
      provider: "mock",
      fields: {
        amount: 50.0,
        date: "2026-02-28",
        category: "travel",
        description: "Parsed description",
        type: "expense",
      },
      confidence: {
        amount: 1,
        date: 1,
        type: 1,
        category: 1,
        description: 1,
        overall: 1,
      },
      reviewNeeded: false,
      reviewReasons: [],
    };

    const resolved = resolveUploadMetadata(manualInput, parsedResult);

    assert.strictEqual(resolved.amount, 100.0);
    assert.strictEqual(resolved.date, "2026-03-01");
    assert.strictEqual(resolved.category, "software");
    assert.strictEqual(resolved.description, "Manual description");
  });

  test("resolveUploadMetadata falls back to parsed fields when manual input is missing", () => {
    const manualInput = {};

    const parsedResult: DocumentParseResult = {
      provider: "mock",
      fields: {
        amount: 50.0,
        date: "2026-02-28",
        category: "travel",
        description: "Parsed description",
        type: "expense",
      },
      confidence: {
        amount: 1,
        date: 1,
        type: 1,
        category: 1,
        description: 1,
        overall: 1,
      },
      reviewNeeded: false,
      reviewReasons: [],
    };

    const resolved = resolveUploadMetadata(manualInput, parsedResult);

    assert.strictEqual(resolved.amount, 50.0);
    assert.strictEqual(resolved.date, "2026-02-28");
    assert.strictEqual(resolved.category, "travel");
    assert.strictEqual(resolved.description, "Parsed description");
  });

  test("resolveUploadMetadata handles missing required fields with reviewReasons", () => {
    const manualInput = {};
    const parsedResult: DocumentParseResult = {
      provider: "mock",
      fields: {},
      confidence: {
        amount: 0,
        date: 0,
        type: 0,
        category: 0,
        description: 0,
        overall: 0,
      },
      reviewNeeded: true,
      reviewReasons: ["Extraction failed"],
    };

    const resolved = resolveUploadMetadata(manualInput, parsedResult);

    assert.strictEqual(resolved.reviewNeeded, true);
    assert.ok(resolved.reviewReasons.includes("Amount is missing."));
    assert.ok(resolved.reviewReasons.includes("Date is missing."));
  });
});
