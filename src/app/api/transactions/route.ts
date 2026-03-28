import { NextResponse } from "next/server";
import { addTransaction, deleteTransaction, readStore, updateTransaction } from "@/lib/store";
import type { TransactionType } from "@/lib/types";

function isTransactionType(value: string): value is TransactionType {
  return value === "revenue" || value === "expense";
}

export async function GET() {
  const store = await readStore();
  return NextResponse.json({ transactions: store.transactions });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null) as {
    id?: string;
    amount?: number;
    date?: string;
    category?: string;
    description?: string;
    receiptName?: string;
    type?: string;
  } | null;

  if (!body || !body.id) {
    return NextResponse.json({ error: "Missing transaction ID" }, { status: 400 });
  }

  if (body.type && !isTransactionType(body.type)) {
    return NextResponse.json({ error: "Invalid transaction type" }, { status: 400 });
  }

  const updated = await updateTransaction({
    id: body.id,
    amount: body.amount ? Number(body.amount) : undefined,
    date: body.date,
    category: body.category?.trim(),
    description: body.description?.trim(),
    ...(Object.prototype.hasOwnProperty.call(body, "receiptName")
      ? { receiptName: body.receiptName?.trim() || undefined }
      : {}),
    type: body.type as TransactionType | undefined,
  });

  if (!updated) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  return NextResponse.json({ transaction: updated });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    type?: string;
    amount?: number;
    date?: string;
    category?: string;
    description?: string;
    source?: "manual" | "import";
    receiptName?: string;
  } | null;

  if (!body || !body.type || !isTransactionType(body.type) || !body.amount || body.amount <= 0 || !body.date) {
    return NextResponse.json({ error: "Missing or invalid transaction fields" }, { status: 400 });
  }

  const created = await addTransaction({
    type: body.type,
    amount: Number(body.amount),
    date: body.date,
    category: body.category?.trim() || "general",
    description: body.description?.trim() || "",
    source: body.source ?? "manual",
    receiptName: body.receiptName?.trim() || undefined,
  });

  return NextResponse.json({ transaction: created }, { status: 201 });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null) as { id?: string } | null;

  if (!body || !body.id) {
    return NextResponse.json({ error: "Missing transaction ID" }, { status: 400 });
  }

  const success = await deleteTransaction(body.id);
  if (!success) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
