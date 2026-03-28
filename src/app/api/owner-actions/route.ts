import { NextResponse } from "next/server";
import { buildWeeklyOwnerActionBrief } from "@/lib/weeklyOwnerActions";
import { readStore } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  const brief = buildWeeklyOwnerActionBrief(
    store.transactions,
    store.receivables,
    store.deadlines,
    store.settings,
  );

  return NextResponse.json({
    brief,
  });
}
