import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { getDocumentParser, MockDocumentParser, normalizeExtractionConfidence } from "@/lib/parser";

const originalOcrProvider = process.env.OCR_PROVIDER;
const originalOcrApiKey = process.env.OCR_API_KEY;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  process.env.OCR_PROVIDER = originalOcrProvider;
  process.env.OCR_API_KEY = originalOcrApiKey;
  process.env.OPENAI_API_KEY = originalOpenAiApiKey;
});

describe("MockDocumentParser", () => {
  test("returns high confidence for structured file names", async () => {
    const parser = new MockDocumentParser();
    const result = await parser.parse({
      fileName: "invoice-2026-02-15-455.90-marketing.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from(""),
    });

    assert.equal(result.fields?.type, "revenue");
    assert.equal(result.fields?.date, "2026-02-15");
    assert.equal(result.fields?.amount, 455.9);
    assert.equal(result.confidence?.amount, 0.9);
  });

  test("flags review when key fields are missing", async () => {
    process.env.OCR_PROVIDER = "mock";
    const parser = getDocumentParser();
    const result = await parser.parse({
      fileName: "scan-random-document.png",
      mimeType: "image/png",
      bytes: Buffer.from("unstructured image payload"),
    });

    assert.equal(result.provider, "mock");
    assert.equal(result.reviewNeeded, true);
    assert.ok(result.confidence.overall < 0.75);
    assert.ok(result.reviewReasons.some((reason) => reason.toLowerCase().includes("amount")));
  });

  test("does not parse impossible calendar dates", async () => {
    const parser = new MockDocumentParser();
    const result = await parser.parse({
      fileName: "invoice-2026-13-40-455.90-marketing.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from(""),
    });

    assert.equal(result.fields.date, undefined);
    assert.equal(result.reviewNeeded, true);
    assert.ok(result.reviewReasons.some((reason) => reason.toLowerCase().includes("date")));
  });

  test("normalizes confidence to [0,1] and recomputes overall", () => {
    const normalized = normalizeExtractionConfidence({
      amount: 1.2,
      date: -0.5,
      type: Number.NaN,
      category: 0.88,
      description: 0.4,
    });

    assert.equal(normalized.amount, 1);
    assert.equal(normalized.date, 0);
    assert.equal(normalized.type, 0);
    assert.equal(normalized.category, 0.88);
    assert.equal(normalized.description, 0.4);
    assert.ok(normalized.overall >= 0 && normalized.overall <= 1);
  });

  test("returns reviewable result when OpenAI provider is selected without API key", async () => {
    process.env.OCR_PROVIDER = "openai";
    process.env.OCR_API_KEY = "";
    process.env.OPENAI_API_KEY = "";

    const parser = getDocumentParser();
    const result = await parser.parse({
      fileName: "invoice.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from(""),
    });

    assert.equal(result.provider, "openai");
    assert.equal(result.reviewNeeded, true);
    assert.ok(result.reviewReasons.some((reason) => reason.includes("OCR provider error")));
  });

  test("returns reviewable result when non-mock provider is selected but not implemented", async () => {
    process.env.OCR_PROVIDER = "google-document-ai";
    const parser = getDocumentParser();

    const result = await parser.parse({
      fileName: "invoice.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.from(""),
    });

    assert.equal(result.provider, "google-document-ai");
    assert.equal(result.reviewNeeded, true);
    assert.ok(result.reviewReasons.some((reason) => reason.includes("OCR provider error")));
    assert.equal(result.confidence.overall, 0);
  });

  test("falls back to mock on unknown provider value", async () => {
    process.env.OCR_PROVIDER = "totally-unknown-provider";
    const parser = getDocumentParser();

    const result = await parser.parse({
      fileName: "receipt-2026-02-18-20.00.png",
      mimeType: "image/png",
      bytes: Buffer.from(""),
    });

    assert.equal(result.provider, "mock");
  });
});
