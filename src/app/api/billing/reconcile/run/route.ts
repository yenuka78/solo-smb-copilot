import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { runStripeBillingReconciliation } from "@/lib/billing/stripeReconciliation";

export const runtime = "nodejs";

function readRunnerToken(req: Request): string {
  const headerToken = req.headers.get("x-reconcile-token")?.trim();
  if (headerToken) return headerToken;

  const bearer = req.headers.get("authorization")?.trim();
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }

  return "";
}

export async function POST(req: Request) {
  const env = getEnv();

  if (!env.billing.canRunReconciliation || !env.billing.stripeSecretKey) {
    return NextResponse.json({ error: "Stripe reconciliation is not configured" }, { status: 503 });
  }

  if (env.billing.stripeReconcileRunnerToken) {
    const provided = readRunnerToken(req);
    if (!provided || provided !== env.billing.stripeReconcileRunnerToken) {
      return NextResponse.json({ error: "Unauthorized reconcile runner token" }, { status: 401 });
    }
  }

  const report = await runStripeBillingReconciliation({
    secretKey: env.billing.stripeSecretKey,
    dryRun: false,
  });

  return NextResponse.json({
    ok: report.status !== "failed",
    report,
  });
}
