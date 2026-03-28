import { getEnv, type OcrProvider } from "./env";
import type { TransactionType } from "./types";

export type ParsedDocumentFields = {
  amount?: number;
  date?: string;
  type?: TransactionType;
  category?: string;
  description?: string;
};

export type ExtractionConfidence = {
  amount: number;
  date: number;
  type: number;
  category: number;
  description: number;
  overall: number;
};

export type DocumentParseResult = {
  provider: OcrProvider;
  fields: ParsedDocumentFields;
  confidence: ExtractionConfidence;
  reviewNeeded: boolean;
  reviewReasons: string[];
};

export type DocumentParserInput = {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

export interface DocumentParser {
  parse(input: DocumentParserInput): Promise<DocumentParseResult>;
}

export type ExtractionConfidenceInput = Partial<Omit<ExtractionConfidence, "overall">>;

type RawDocumentParseResult = {
  fields?: ParsedDocumentFields;
  confidence?: ExtractionConfidenceInput;
  reviewReasons?: string[];
};

interface DocumentParserAdapter {
  id: OcrProvider;
  parse(input: DocumentParserInput): Promise<RawDocumentParseResult>;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeConfidenceValue(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(Number(value.toFixed(2)));
}

function scoreOverall(confidence: Omit<ExtractionConfidence, "overall">): number {
  const weighted =
    confidence.amount * 0.3 +
    confidence.date * 0.25 +
    confidence.type * 0.2 +
    confidence.category * 0.1 +
    confidence.description * 0.15;

  return normalizeConfidenceValue(weighted, 0);
}

export function normalizeExtractionConfidence(confidence?: ExtractionConfidenceInput): ExtractionConfidence {
  const normalized = {
    amount: normalizeConfidenceValue(confidence?.amount, 0),
    date: normalizeConfidenceValue(confidence?.date, 0),
    type: normalizeConfidenceValue(confidence?.type, 0),
    category: normalizeConfidenceValue(confidence?.category, 0),
    description: normalizeConfidenceValue(confidence?.description, 0),
  };

  return {
    ...normalized,
    overall: scoreOverall(normalized),
  };
}

function parseAmount(text: string): number | undefined {
  const strongTagged = text.match(
    /(?:total(?:\s+due)?|amount(?:\s+due)?|grand\s+total|balance\s+due|invoice\s+total)[^0-9]{0,25}([0-9]+(?:[.,][0-9]{2})?)/i,
  );
  if (strongTagged?.[1]) {
    const parsed = Number(strongTagged[1].replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const currencyMatches = Array.from(text.matchAll(/[$€£]\s*([0-9]+(?:[.,][0-9]{2})?)/g))
    .map((m) => Number(m[1].replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (currencyMatches.length > 0) {
    return Math.max(...currencyMatches);
  }

  const tagged = text.match(/(?:amount|total|usd|\$)\s*[:=-]?\s*([0-9]+(?:[.,][0-9]{2})?)/i);
  if (tagged?.[1]) {
    const parsed = Number(tagged[1].replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const candidates = Array.from(text.matchAll(/\b([0-9]+(?:[.,][0-9]{2})?)\b/g)).map((m) => m[1]);
  if (candidates.length === 0) return undefined;

  const decimalCandidates = candidates
    .filter((value) => /[.,][0-9]{2}$/.test(value))
    .map((value) => Number(value.replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (decimalCandidates.length > 0) return Math.max(...decimalCandidates);

  const nonYearCandidate = candidates
    .map((value) => Number(value.replace(",", ".")))
    .find((parsed) => Number.isFinite(parsed) && parsed > 0 && !(parsed >= 1900 && parsed <= 2100));

  return nonYearCandidate;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
  );
}

function parseDate(text: string): string | undefined {
  const iso = text.match(/\b(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)\b/);
  if (iso) {
    const [, yearRaw, monthRaw, dayRaw] = iso;
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);

    if (isValidDateParts(year, month, day)) {
      return `${yearRaw}-${monthRaw}-${dayRaw}`;
    }
  }

  const monthNameDate = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+([0-3]?\d),\s*(20\d{2}|19\d{2})\b/i,
  );
  if (monthNameDate) {
    const [, monthName, dayRaw, yearRaw] = monthNameDate;
    const candidate = new Date(`${monthName} ${dayRaw}, ${yearRaw}`);
    if (!Number.isNaN(candidate.getTime())) {
      return candidate.toISOString().slice(0, 10);
    }
  }

  const slashDate = text.match(/\b([0-3]?\d)[\/.-]([01]?\d)[\/.-]((?:19|20)\d{2})\b/);
  if (slashDate) {
    const [, firstRaw, secondRaw, yearRaw] = slashDate;
    const first = Number(firstRaw);
    const second = Number(secondRaw);
    const year = Number(yearRaw);

    let month = first;
    let day = second;

    // Prefer month/day when ambiguous, but handle day/month when first token cannot be month.
    if (first > 12 && second <= 12) {
      month = second;
      day = first;
    }

    if (isValidDateParts(year, month, day)) {
      return `${yearRaw}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return undefined;
}

function parseType(text: string): TransactionType | undefined {
  if (/(invoice|sale|revenue|payment-received)/i.test(text)) return "revenue";
  if (/(receipt|expense|bill|purchase)/i.test(text)) return "expense";
  return undefined;
}

function parseCategory(text: string): string | undefined {
  const known: Array<[RegExp, string]> = [
    [/fuel|gas|diesel/i, "transport"],
    [/rent|lease/i, "rent"],
    [/ads|marketing/i, "marketing"],
    [/software|saas/i, "software"],
    [/travel|flight|hotel/i, "travel"],
    [/meal|restaurant/i, "meals"],
  ];

  for (const [pattern, category] of known) {
    if (pattern.test(text)) return category;
  }
  return undefined;
}

function parseDescription(text: string): string | undefined {
  const normalized = text.replace(/[-_]+/g, " ").trim();
  if (!normalized) return undefined;
  return `Auto-parsed from ${normalized.slice(0, 80)}`;
}

function extractFirstJsonObject(raw: string): string | undefined {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return undefined;
  return raw.slice(start, end + 1);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toIsoDateOrUndefined(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return parseDate(normalized) ?? undefined;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return undefined;

  const iso = date.toISOString().slice(0, 10);
  return parseDate(iso) ?? undefined;
}

function toAmountOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Number(value.toFixed(2));
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.,-]/g, "").replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return Number(parsed.toFixed(2));
  }

  return undefined;
}

function extractPrintablePreview(bytes: Buffer): string {
  return bytes
    .toString("latin1")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  try {
    const mod = await import("pdf-parse");
    const pdfParse = ((mod as unknown as { default?: unknown }).default ?? mod) as (input: Buffer) => Promise<{ text?: string }>;
    if (typeof pdfParse !== "function") return "";

    const parsed = await pdfParse(bytes);
    return (parsed.text || "").replace(/\s+/g, " ").trim().slice(0, 12000);
  } catch {
    return "";
  }
}

async function extractDocumentPreview(input: DocumentParserInput): Promise<string> {
  const isPdf =
    input.mimeType === "application/pdf"
    || input.fileName.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    const pdfText = await extractPdfText(input.bytes);
    if (pdfText) return pdfText;
  }

  return extractPrintablePreview(input.bytes);
}

function buildReviewReasons(
  fields: ParsedDocumentFields,
  confidence: ExtractionConfidence,
  inheritedReasons: string[] = [],
): string[] {
  const reasons = [...inheritedReasons];

  if (!fields.amount) reasons.push("Amount could not be confidently extracted.");
  if (!fields.date) reasons.push("Date could not be confidently extracted.");
  if (!fields.type) reasons.push("Document type was inferred with low confidence.");
  if (confidence.overall < 0.75) reasons.push("Overall extraction confidence is below threshold.");

  return reasons;
}

function toParseResult(
  provider: OcrProvider,
  raw: RawDocumentParseResult,
  parseError?: unknown,
): DocumentParseResult {
  const fields = raw.fields ?? {};
  const confidence = normalizeExtractionConfidence(raw.confidence);

  const reviewReasons = buildReviewReasons(fields, confidence, raw.reviewReasons);

  if (parseError) {
    const message = parseError instanceof Error ? parseError.message : "Unknown parse error";
    reviewReasons.push(`OCR provider error (${provider}): ${message}`);
  }

  return {
    provider,
    fields,
    confidence,
    reviewNeeded: reviewReasons.length > 0,
    reviewReasons,
  };
}

class OpenAIProviderAdapter implements DocumentParserAdapter {
  id: OcrProvider = "openai";

  async parse(input: DocumentParserInput): Promise<RawDocumentParseResult> {
    const { ocr } = getEnv();
    const apiKey = ocr.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("OCR_API_KEY (or OPENAI_API_KEY) is required for OCR_PROVIDER=openai");
    }

    const endpoint = ocr.endpoint?.trim() || "https://api.openai.com/v1/responses";

    const systemPrompt = [
      "Extract accounting metadata from the provided receipt/invoice document.",
      "Return ONLY a JSON object (no markdown/code fences) with this exact shape:",
      "{",
      '  "amount": number|null,',
      '  "date": "YYYY-MM-DD"|null,',
      '  "type": "revenue"|"expense"|null,',
      '  "category": string|null,',
      '  "description": string|null,',
      '  "confidence": {',
      '    "amount": number,',
      '    "date": number,',
      '    "type": number,',
      '    "category": number,',
      '    "description": number',
      "  }",
      "}",
      "Confidence values must be between 0 and 1.",
      "If unknown, use null and lower confidence.",
      "Use expense/revenue only for type.",
    ].join("\n");

    const documentPreview = await extractDocumentPreview(input);

    const userText = [
      `fileName: ${input.fileName}`,
      `mimeType: ${input.mimeType}`,
      "If the document is not clearly readable, still provide best-effort extraction.",
      input.mimeType.startsWith("image/")
        ? "Image is attached below."
        : `Document text preview: ${documentPreview || "(empty)"}`,
    ].join("\n");

    const content: Array<Record<string, unknown>> = [{ type: "input_text", text: userText }];

    if (input.mimeType.startsWith("image/")) {
      const dataUrl = `data:${input.mimeType};base64,${input.bytes.toString("base64")}`;
      content.push({
        type: "input_image",
        image_url: dataUrl,
      });
    } else if (input.mimeType === "application/pdf" || input.fileName.toLowerCase().endsWith(".pdf")) {
      const dataUrl = `data:application/pdf;base64,${input.bytes.toString("base64")}`;
      content.push({
        type: "input_file",
        filename: input.fileName,
        file_data: dataUrl,
      });
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        instructions: systemPrompt,
        input: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`OpenAI OCR request failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };

    const rawContent = payload.output_text
      || payload.output?.flatMap((item) => item.content ?? []).map((part) => part.text || "").join("\n")
      || "";

    if (!rawContent.trim()) {
      throw new Error("OpenAI OCR returned empty response content");
    }

    const jsonText = extractFirstJsonObject(rawContent) ?? rawContent;
    const parsed = JSON.parse(jsonText) as {
      amount?: unknown;
      date?: unknown;
      type?: unknown;
      category?: unknown;
      description?: unknown;
      confidence?: ExtractionConfidenceInput;
    };

    const heuristicSource = `${input.fileName} ${documentPreview}`;

    const description = normalizeOptionalString(parsed.description) ?? parseDescription(input.fileName);
    const amount = toAmountOrUndefined(parsed.amount) ?? parseAmount(heuristicSource);
    const date = toIsoDateOrUndefined(parsed.date) ?? parseDate(heuristicSource);

    const textHints = [description, normalizeOptionalString(parsed.category), heuristicSource]
      .filter(Boolean)
      .join(" ");

    const category =
      normalizeOptionalString(parsed.category)?.toLowerCase()
      || parseCategory(textHints)
      || "general";

    const typeCandidate = normalizeOptionalString(parsed.type)?.toLowerCase();
    const type = typeCandidate === "revenue" || typeCandidate === "expense"
      ? typeCandidate
      : parseType(textHints);

    const confidence: ExtractionConfidenceInput = {
      ...(parsed.confidence ?? {}),
      amount: parsed.confidence?.amount ?? (amount ? 0.72 : 0),
      date: parsed.confidence?.date ?? (date ? 0.72 : 0),
      type: parsed.confidence?.type ?? (type ? 0.65 : 0),
      category: parsed.confidence?.category ?? (category && category !== "general" ? 0.55 : 0),
      description: parsed.confidence?.description ?? (description ? 0.5 : 0),
    };

    return {
      fields: {
        amount,
        date,
        type,
        category,
        description,
      },
      confidence,
    };
  }
}

class MockProviderAdapter implements DocumentParserAdapter {
  id: OcrProvider = "mock";

  async parse(input: DocumentParserInput): Promise<RawDocumentParseResult> {
    const stem = input.fileName.replace(/\.[a-z0-9]+$/i, "");
    const bufferPreview = input.bytes.toString("utf8", 0, 128).replace(/\0/g, " ");
    const sourceText = `${stem} ${bufferPreview}`;

    const fields: ParsedDocumentFields = {
      amount: parseAmount(sourceText),
      date: parseDate(sourceText),
      type: parseType(sourceText),
      category: parseCategory(sourceText),
      description: parseDescription(stem),
    };

    return {
      fields,
      confidence: {
        amount: fields.amount ? 0.9 : 0.35,
        date: fields.date ? 0.88 : 0.35,
        type: fields.type ? 0.82 : 0.5,
        category: fields.category ? 0.78 : 0.45,
        description: fields.description ? 0.7 : 0.3,
      },
    };
  }
}

export class MockDocumentParser implements DocumentParser {
  private readonly parser = new SafeDocumentParser(new MockProviderAdapter());

  async parse(input: DocumentParserInput): Promise<DocumentParseResult> {
    return this.parser.parse(input);
  }
}

class FutureProviderPlaceholder implements DocumentParserAdapter {
  constructor(public readonly id: OcrProvider) {}

  async parse(input: DocumentParserInput): Promise<RawDocumentParseResult> {
    void input;
    throw new Error(
      `${this.id} is not enabled in this build yet. Configure credentials and implement provider adapter before switching from mock.`,
    );
  }
}

class SafeDocumentParser implements DocumentParser {
  constructor(private readonly provider: DocumentParserAdapter) {}

  async parse(input: DocumentParserInput): Promise<DocumentParseResult> {
    try {
      const raw = await this.provider.parse(input);
      return toParseResult(this.provider.id, raw);
    } catch (error) {
      return toParseResult(this.provider.id, {}, error);
    }
  }
}

class GeminiProviderAdapter implements DocumentParserAdapter {
  id: OcrProvider = "gemini";

  async parse(input: DocumentParserInput): Promise<RawDocumentParseResult> {
    void input;
    // When using Gemini as a provider, we mark the document for agent review.
    // The actual extraction happens asynchronously by the agent looking at the stored file.
    return {
      fields: {},
      confidence: {},
      reviewReasons: ["Document queued for Gemini AI extraction."],
    };
  }
}

function getProviderFromEnv(): DocumentParserAdapter {
  const { ocr } = getEnv();

  if (ocr.provider === "mock") {
    return new MockProviderAdapter();
  }

  if (ocr.provider === "openai") {
    return new OpenAIProviderAdapter();
  }

  if (ocr.provider === "gemini") {
    return new GeminiProviderAdapter();
  }

  return new FutureProviderPlaceholder(ocr.provider);
}

export function getDocumentParser(): DocumentParser {
  return new SafeDocumentParser(getProviderFromEnv());
}
