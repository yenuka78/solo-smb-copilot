import { NextResponse } from "next/server";
import { readStore, resolveTransactionReview } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  const pending = store.transactions.filter((tx) => tx.ocr?.reviewNeeded);
  return NextResponse.json({ pending });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    amount?: number;
    date?: string;
    category?: string;
    description?: string;
    type?: "revenue" | "expense";
  } | null;

  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (body.amount !== undefined && body.amount <= 0) {
    return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
  }

  const updated = await resolveTransactionReview({
    id: body.id,
    amount: body.amount,
    date: body.date,
    category: body.category,
    description: body.description,
    type: body.type,
  });

  if (!updated) {
    return NextResponse.json({ error: "transaction not found" }, { status: 404 });
  }

  return NextResponse.json({ transaction: updated });
}
