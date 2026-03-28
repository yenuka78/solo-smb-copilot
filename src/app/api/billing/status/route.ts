import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { readStore } from "@/lib/store";

const DEFAULT_ACCOUNT_ID = "solo-owner";

export async function GET(req: Request) {
  const env = getEnv();
  const accountId = req.headers.get("x-account-id")?.trim() || DEFAULT_ACCOUNT_ID;
  const store = await readStore();
  const subscription = store.billing.subscriptionsByAccount[accountId] ?? null;

  return NextResponse.json({
    accountId,
    billing: {
      enabled: env.billing.stripeEnabled,
      checkoutReady: env.billing.canCreateCheckout,
      portalReady: env.billing.canCreatePortal,
      webhooksReady: env.billing.canProcessWebhooks,
      reconciliationReady: env.billing.canRunReconciliation,
      runnerTokenConfigured: Boolean(env.billing.stripeReconcileRunnerToken),
      publishableKeyPresent: Boolean(env.billing.stripePublishableKey),
      configured: env.billing.isStripeConfigured,
    },
    reconciliation: store.billing.reconciliation,
    subscription,
  });
}
