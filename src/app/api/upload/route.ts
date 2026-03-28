import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requirePremiumAccess } from "@/lib/billing/guard";
import { resolveUploadMetadata } from "@/lib/ingestion";
import { getDocumentParser } from "@/lib/parser";
import { addTransaction, markOnboardingStepComplete } from "@/lib/store";

const uploadDir = path.join(process.cwd(), "data", "uploads");

export async function POST(req: Request) {
  const gate = await requirePremiumAccess(req, { feature: "document upload + OCR" });
  if (!gate.ok) return gate.response;

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const amountInput = Number(form.get("amount") || 0);
  const dateInput = String(form.get("date") || "");
  const typeInput = String(form.get("type") || "");
  const categoryInput = String(form.get("category") || "");
  const descriptionInput = String(form.get("description") || "");

  await mkdir(uploadDir, { recursive: true });

  const extension = path.extname(file.name) || ".bin";
  const safeName = `${Date.now()}-${randomUUID()}${extension}`;
  const fullPath = path.join(uploadDir, safeName);

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, bytes);

  const parser = getDocumentParser();
  const parsed = await parser.parse({
    fileName: file.name,
    mimeType: file.type,
    bytes,
  });

  const resolved = resolveUploadMetadata(
    {
      type: typeInput,
      amount: amountInput,
      date: dateInput,
      category: categoryInput,
      description: descriptionInput,
    },
    parsed,
  );

  // For async/AI providers we allow missing core fields and keep the item in review flow.
  const allowsMissingCoreFields = ["gemini", "openai"].includes(resolved.parserProvider);

  if (!allowsMissingCoreFields && (!resolved.amount || !resolved.date)) {
    return NextResponse.json(
      {
        error: "Amount and date are required (either manually or OCR-parsed).",
        parser: parsed,
      },
      { status: 400 },
    );
  }

  const tx = await addTransaction({
    type: resolved.type,
    amount: resolved.amount ?? 0,
    date: resolved.date ?? new Date().toISOString().split("T")[0],
    category: resolved.category,
    description: resolved.description,
    source: "import",
    receiptName: file.name,
    ocr: {
      provider: resolved.parserProvider,
      extractionConfidence: resolved.extractionConfidence,
      reviewNeeded: resolved.reviewNeeded,
      reviewReasons: resolved.reviewReasons,
      extractedFields: resolved.extractedFields,
    },
  });

  await markOnboardingStepComplete("upload_first_receipt");

  return NextResponse.json({
    uploaded: {
      filename: file.name,
      storedAs: safeName,
      bytes: bytes.length,
    },
    parser: parsed,
    transaction: tx,
  });
}
