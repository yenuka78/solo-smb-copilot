import { NextResponse } from "next/server";
import { buildCashRunwaySummary } from "@/lib/cashRunway";
import { readStore } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  const summary = buildCashRunwaySummary(store.transactions, store.receivables, store.settings);

  return NextResponse.json({
    summary,
  });
}
