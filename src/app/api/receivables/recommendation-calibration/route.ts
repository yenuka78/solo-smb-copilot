import { NextResponse } from "next/server";
import { buildReceivableAnalytics, buildRecommendationConfidenceCalibration } from "@/lib/receivableAnalytics";
import { readStore, writeStore } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    recommendationCalibration: store.settings.receivableRecommendationCalibration ?? null,
  });
}

export async function POST() {
  const store = await readStore();
  const now = new Date();

  const analytics = buildReceivableAnalytics({
    counters: store.receivableActionCounters,
    events: store.receivableActionEvents,
    receivables: store.receivables,
    now,
  });

  const calibration = buildRecommendationConfidenceCalibration({
    slice: analytics.windows["30d"],
    now,
  });

  store.settings.receivableRecommendationCalibration = calibration;
  await writeStore(store);

  return NextResponse.json({
    recommendationCalibration: calibration,
  });
}
