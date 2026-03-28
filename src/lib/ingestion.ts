import type { DocumentParseResult } from "./parser";
import type { TransactionType } from "./types";

export type UploadMetadataInput = {
  type?: string;
  amount?: number;
  date?: string;
  category?: string;
  description?: string;
};

export type ResolvedUploadMetadata = {
  type: TransactionType;
  amount?: number;
  date?: string;
  category: string;
  description: string;
  reviewNeeded: boolean;
  extractionConfidence: number;
  parserProvider: DocumentParseResult["provider"];
  reviewReasons: string[];
  extractedFields: DocumentParseResult["fields"];
};

function asTransactionType(value: string | undefined): TransactionType | undefined {
  if (value === "revenue" || value === "expense") return value;
  return undefined;
}

export function resolveUploadMetadata(
  input: UploadMetadataInput,
  parsed: DocumentParseResult,
): ResolvedUploadMetadata {
  const resolvedType = asTransactionType(input.type) ?? parsed.fields.type ?? "expense";
  const resolvedAmount =
    typeof input.amount === "number" && Number.isFinite(input.amount) && input.amount > 0
      ? input.amount
      : parsed.fields.amount;
  const resolvedDate = input.date?.trim() || parsed.fields.date;
  const resolvedCategory = input.category?.trim() || parsed.fields.category || "general";
  const resolvedDescription =
    input.description?.trim() || parsed.fields.description || "Uploaded receipt/invoice";

  const reviewReasons = [...parsed.reviewReasons];
  if (!resolvedAmount) reviewReasons.push("Amount is missing.");
  if (!resolvedDate) reviewReasons.push("Date is missing.");

  return {
    type: resolvedType,
    amount: resolvedAmount,
    date: resolvedDate,
    category: resolvedCategory,
    description: resolvedDescription,
    reviewNeeded: reviewReasons.length > 0,
    extractionConfidence: parsed.confidence.overall,
    parserProvider: parsed.provider,
    reviewReasons,
    extractedFields: parsed.fields,
  };
}
