import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { readStore } from "@/lib/store";
import { runStripeBillingReconciliation } from "@/lib/billing/stripeReconciliation";

export const runtime = "nodejs";

export async function GET() {
  const env = getEnv();
  const store = await readStore();

  return NextResponse.json({
    billing: {
      enabled: env.billing.stripeEnabled,
      reconciliationReady: env.billing.canRunReconciliation,
      runnerTokenConfigured: Boolean(env.billing.stripeReconcileRunnerToken),
    },
    reconciliation: store.billing.reconciliation,
  });
}

export async function POST(req: Request) {
  const env = getEnv();
  if (!env.billing.canRunReconciliation || !env.billing.stripeSecretKey) {
    return NextResponse.json(
      {
        error: "Stripe reconciliation is not configured",
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    dryRun?: boolean;
    maxAccounts?: number;
  };

  const report = await runStripeBillingReconciliation({
    secretKey: env.billing.stripeSecretKey,
    dryRun: Boolean(body.dryRun),
    maxAccounts: body.maxAccounts,
  });

  return NextResponse.json({ report });
}
