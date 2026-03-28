import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getSubscriptionState } from "@/lib/store";

const DEFAULT_ACCOUNT_ID = "solo-owner";
const PREMIUM_STATUSES = new Set(["active", "trialing"]);

export type PremiumAccessResult =
  | { ok: true; accountId: string; bypassed: boolean }
  | { ok: false; response: NextResponse };

export async function requirePremiumAccess(
  request: Request,
  options?: { feature?: string; accountIdHeader?: string },
): Promise<PremiumAccessResult> {
  const env = getEnv();

  // Safe default for local/dev: if Stripe isn't enabled, premium checks are bypassed.
  if (!env.billing.isStripeConfigured) {
    return { ok: true, accountId: DEFAULT_ACCOUNT_ID, bypassed: true };
  }

  const headerName = options?.accountIdHeader ?? "x-account-id";
  const accountId = request.headers.get(headerName)?.trim() || DEFAULT_ACCOUNT_ID;

  const subscription = await getSubscriptionState(accountId);
  if (subscription && PREMIUM_STATUSES.has(subscription.status)) {
    return { ok: true, accountId, bypassed: false };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "Premium subscription required",
        feature: options?.feature ?? "premium feature",
        accountId,
      },
      { status: 402 },
    ),
  };
}
