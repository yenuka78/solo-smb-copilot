import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { createStripeCheckoutSession } from "@/lib/billing/stripeApi";
import { getSubscriptionState, upsertSubscriptionState } from "@/lib/store";

export const runtime = "nodejs";

const DEFAULT_ACCOUNT_ID = "solo-owner";
const DEFAULT_SUCCESS_URL = "http://localhost:3000?billing=success";
const DEFAULT_CANCEL_URL = "http://localhost:3000?billing=cancel";

export async function POST(req: Request) {
  const env = getEnv();
  if (!env.billing.canCreateCheckout || !env.billing.stripeSecretKey || !env.billing.stripePriceId) {
    return NextResponse.json(
      {
        error: "Stripe checkout is not configured",
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    accountId?: string;
    successUrl?: string;
    cancelUrl?: string;
  };

  const accountId = body.accountId?.trim() || req.headers.get("x-account-id")?.trim() || DEFAULT_ACCOUNT_ID;

  const existing = await getSubscriptionState(accountId);
  if (existing && (existing.status === "active" || existing.status === "trialing")) {
    return NextResponse.json({
      alreadySubscribed: true,
      subscription: existing,
    });
  }

  try {
    const session = await createStripeCheckoutSession({
      secretKey: env.billing.stripeSecretKey,
      priceId: env.billing.stripePriceId,
      accountId,
      successUrl: body.successUrl?.trim() || env.billing.stripeCheckoutSuccessUrl || DEFAULT_SUCCESS_URL,
      cancelUrl: body.cancelUrl?.trim() || env.billing.stripeCheckoutCancelUrl || DEFAULT_CANCEL_URL,
    });

    const subscription = await upsertSubscriptionState({
      accountId,
      status: existing?.status ?? "incomplete",
      customerId: session.customer,
      subscriptionId: session.subscription,
      checkoutSessionId: session.id,
      checkoutSessionUrl: session.url,
      priceId: env.billing.stripePriceId,
      cancelAtPeriodEnd: existing?.cancelAtPeriodEnd ?? false,
    });

    return NextResponse.json({
      checkout: {
        sessionId: session.id,
        url: session.url,
      },
      subscription,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create checkout session",
      },
      { status: 502 },
    );
  }
}
