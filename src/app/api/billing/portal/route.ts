import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { createStripeBillingPortalSession } from "@/lib/billing/stripeApi";
import { getSubscriptionState } from "@/lib/store";

export const runtime = "nodejs";

const DEFAULT_ACCOUNT_ID = "solo-owner";
const DEFAULT_RETURN_URL = "http://localhost:3000?billing=manage";

export async function POST(req: Request) {
  const env = getEnv();
  if (!env.billing.canCreatePortal || !env.billing.stripeSecretKey) {
    return NextResponse.json(
      {
        error: "Stripe billing portal is not configured",
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    accountId?: string;
    returnUrl?: string;
  };

  const accountId = body.accountId?.trim() || req.headers.get("x-account-id")?.trim() || DEFAULT_ACCOUNT_ID;
  const subscription = await getSubscriptionState(accountId);

  if (!subscription?.customerId) {
    return NextResponse.json(
      {
        error: "No Stripe customer is linked to this account yet",
      },
      { status: 409 },
    );
  }

  try {
    const portal = await createStripeBillingPortalSession({
      secretKey: env.billing.stripeSecretKey,
      customerId: subscription.customerId,
      returnUrl: body.returnUrl?.trim() || env.billing.stripePortalReturnUrl || env.billing.stripeCheckoutCancelUrl || DEFAULT_RETURN_URL,
    });

    return NextResponse.json({
      portal: {
        sessionId: portal.id,
        url: portal.url,
      },
      accountId,
      subscription,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create billing portal session",
      },
      { status: 502 },
    );
  }
}
