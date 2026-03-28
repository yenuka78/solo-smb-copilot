const STRIPE_API_BASE = "https://api.stripe.com/v1";

type StripeCheckoutSession = {
  id: string;
  url?: string;
  customer?: string;
  subscription?: string;
  status?: string;
};

type StripeBillingPortalSession = {
  id: string;
  url?: string;
};

type StripeApiError = {
  error?: {
    message?: string;
  };
};

function buildAuthHeaders(secretKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

export async function createStripeCheckoutSession(input: {
  secretKey: string;
  priceId: string;
  accountId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeCheckoutSession> {
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", input.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("client_reference_id", input.accountId);
  params.set("metadata[accountId]", input.accountId);
  params.set("subscription_data[metadata][accountId]", input.accountId);
  params.set("allow_promotion_codes", "true");

  const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: "POST",
    headers: buildAuthHeaders(input.secretKey),
    body: params.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as StripeApiError | null;
    throw new Error(payload?.error?.message ?? "Stripe checkout session creation failed");
  }

  return (await response.json()) as StripeCheckoutSession;
}

export async function createStripeBillingPortalSession(input: {
  secretKey: string;
  customerId: string;
  returnUrl: string;
}): Promise<StripeBillingPortalSession> {
  const params = new URLSearchParams();
  params.set("customer", input.customerId);
  params.set("return_url", input.returnUrl);

  const response = await fetch(`${STRIPE_API_BASE}/billing_portal/sessions`, {
    method: "POST",
    headers: buildAuthHeaders(input.secretKey),
    body: params.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as StripeApiError | null;
    throw new Error(payload?.error?.message ?? "Stripe billing portal session creation failed");
  }

  return (await response.json()) as StripeBillingPortalSession;
}
