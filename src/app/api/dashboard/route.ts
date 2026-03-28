import { NextResponse } from "next/server";
import { buildAlerts, buildSummary } from "@/lib/finance";
import { buildOnboardingProgress } from "@/lib/onboarding";
import { readStore, writeStore } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  const summary = buildSummary(store.transactions, store.deadlines, store.receivables, store.settings);
  const alerts = buildAlerts(store.transactions, store.deadlines, store.settings.taxReserveRate);

  const reviewTransactions = store.transactions.filter((tx) => tx.ocr?.reviewNeeded);
  const autoParsedHighConfidence = store.transactions.filter(
    (tx) => tx.ocr && !tx.ocr.reviewNeeded && tx.ocr.extractionConfidence >= 0.75,
  );

  const categories = Array.from(new Set(store.transactions.map((tx) => tx.category).filter(Boolean)));

  return NextResponse.json({
    summary,
    alerts,
    settings: store.settings,
    recentTransactions: store.transactions.slice(0, 50),
    deadlines: store.deadlines.slice(0, 20),
    reviewQueue: {
      pendingCount: reviewTransactions.length,
      highConfidenceAutoParsedCount: autoParsedHighConfidence.length,
    },
    onboarding: buildOnboardingProgress(store.onboarding),
    categories: categories.sort(),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { action: "dismiss" | "restore" } | null;

  if (!body || !["dismiss", "restore"].includes(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const store = await readStore();
  if (body.action === "dismiss") {
    store.onboarding.dismissed = true;
  } else {
    store.onboarding.dismissed = false;
  }

  await writeStore(store);
  return NextResponse.json({ onboarding: buildOnboardingProgress(store.onboarding) });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    taxReserveRate?: number;
    currency?: string;
    monthlyRevenueGoal?: number | null;
    monthlyExpenseLimit?: number | null;
    currentCashBalance?: number | null;
    cashBurnRateMultiplier?: number | null;
    receivableCollectionConfidence?: number | null;
    dismissOnboarding?: boolean;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (body.taxReserveRate !== undefined && (body.taxReserveRate < 0 || body.taxReserveRate > 1)) {
    return NextResponse.json({ error: "taxReserveRate must be between 0 and 1" }, { status: 400 });
  }

  if (body.monthlyRevenueGoal !== undefined && body.monthlyRevenueGoal !== null && body.monthlyRevenueGoal < 0) {
    return NextResponse.json({ error: "monthlyRevenueGoal must be non-negative" }, { status: 400 });
  }

  if (body.monthlyExpenseLimit !== undefined && body.monthlyExpenseLimit !== null && body.monthlyExpenseLimit < 0) {
    return NextResponse.json({ error: "monthlyExpenseLimit must be non-negative" }, { status: 400 });
  }

  if (body.currentCashBalance !== undefined && body.currentCashBalance !== null && body.currentCashBalance < 0) {
    return NextResponse.json({ error: "currentCashBalance must be non-negative" }, { status: 400 });
  }

  if (
    body.cashBurnRateMultiplier !== undefined &&
    body.cashBurnRateMultiplier !== null &&
    (body.cashBurnRateMultiplier < 0.5 || body.cashBurnRateMultiplier > 2)
  ) {
    return NextResponse.json({ error: "cashBurnRateMultiplier must be between 0.5 and 2" }, { status: 400 });
  }

  if (
    body.receivableCollectionConfidence !== undefined &&
    body.receivableCollectionConfidence !== null &&
    (body.receivableCollectionConfidence < 0 || body.receivableCollectionConfidence > 1.5)
  ) {
    return NextResponse.json({ error: "receivableCollectionConfidence must be between 0 and 1.5" }, { status: 400 });
  }

  const store = await readStore();

  if (body.dismissOnboarding !== undefined) {
    store.onboarding.dismissed = body.dismissOnboarding;
  }

  if (body.taxReserveRate !== undefined) {
    store.settings.taxReserveRate = body.taxReserveRate;
    store.onboarding.completedSteps.set_tax_rate = new Date().toISOString();
  }

  if (body.currency !== undefined) {
    store.settings.currency = body.currency;
  }

  if (body.monthlyRevenueGoal !== undefined) {
    store.settings.monthlyRevenueGoal = body.monthlyRevenueGoal === null ? undefined : body.monthlyRevenueGoal;
    if (body.monthlyRevenueGoal !== null) {
      store.onboarding.completedSteps.set_revenue_goal = new Date().toISOString();
    }
  }

  if (body.monthlyExpenseLimit !== undefined) {
    store.settings.monthlyExpenseLimit = body.monthlyExpenseLimit === null ? undefined : body.monthlyExpenseLimit;
    if (body.monthlyExpenseLimit !== null) {
      store.onboarding.completedSteps.set_expense_limit = new Date().toISOString();
    }
  }

  if (body.currentCashBalance !== undefined) {
    store.settings.currentCashBalance = body.currentCashBalance === null ? undefined : body.currentCashBalance;
  }

  if (body.cashBurnRateMultiplier !== undefined) {
    store.settings.cashBurnRateMultiplier = body.cashBurnRateMultiplier === null ? undefined : body.cashBurnRateMultiplier;
  }

  if (body.receivableCollectionConfidence !== undefined) {
    store.settings.receivableCollectionConfidence =
      body.receivableCollectionConfidence === null ? undefined : body.receivableCollectionConfidence;
  }

  await writeStore(store);
  return NextResponse.json({ settings: store.settings });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null) as { step: string } | null;
  if (!body || body.step !== "check_tax_reserve") {
    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  }

  const store = await readStore();
  if (!store.onboarding.completedSteps.check_tax_reserve) {
    store.onboarding.completedSteps.check_tax_reserve = new Date().toISOString();
    await writeStore(store);
  }

  return NextResponse.json({ ok: true });
}
