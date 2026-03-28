# Stripe subscription gating (minimal scaffold)

This project includes a **safe-by-default scaffold** for Stripe-based premium gating.
When Stripe is not configured, premium guards are bypassed so local development keeps working.

## What is included

- Env parsing/schema-like helper: `src/lib/env.ts`
- Signature verification helper (no Stripe SDK required): `src/lib/billing/stripeWebhook.ts`
- Billing routes:
  - `POST /api/billing/checkout`
  - `POST /api/billing/portal`
  - `GET /api/billing/status`
  - `POST /api/billing/stripe/webhook`
- Subscription state persisted in `data/store.json` under `billing.subscriptionsByAccount`
- Premium guard helper: `src/lib/billing/guard.ts`
- Premium checks currently wired into:
  - `POST /api/upload`
  - `POST /api/export/monthly`
  - `POST /api/reminders/run`

## Subscription state shape

Stored in `Store.billing`:

```ts
billing: {
  subscriptionsByAccount: {
    [accountId: string]: {
      accountId: string;
      provider: "stripe";
      status: "incomplete" | "incomplete_expired" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "paused";
      subscriptionId?: string;
      customerId?: string;
      priceId?: string;
      currentPeriodEnd?: string; // ISO datetime
      cancelAtPeriodEnd: boolean;
      updatedAt: string; // ISO datetime
    }
  };
  updatedAt: string;
}
```

Default account mapping uses `metadata.accountId` from Stripe payload, or falls back to `solo-owner`.

## Production enablement checklist

1. **Set env vars**
   - `STRIPE_ENABLED=true`
   - `STRIPE_SECRET_KEY=sk_live_...` (or test key in staging)
   - `STRIPE_WEBHOOK_SECRET=whsec_...`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...`
2. **Configure webhook endpoint in Stripe**
   - URL: `https://<your-domain>/api/billing/stripe/webhook`
   - Subscribe to at least:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
3. **Ensure tenant/account mapping is correct**
   - Replace fallback mapping logic in webhook handler with your auth model.
4. **Harden webhook handling**
   - Add idempotency/event replay protection (store processed event IDs).
   - Add structured logging + alerting on signature failures.
5. **Verify checkout + portal flows**
   - Confirm `POST /api/billing/checkout` and `POST /api/billing/portal` are reachable from your deployed UI.
   - Ensure `metadata.accountId` mapping still matches your auth model.
6. **Guard all premium routes**
   - Reuse `requirePremiumAccess` across every paid feature endpoint.
7. **Backfill/seed existing customers**
   - Sync live subscriptions into `billing.subscriptionsByAccount` before enforcing gates.
8. **Run smoke tests**
   - Disabled mode: verify all routes still work locally.
   - Enabled mode + no active subscription: returns HTTP 402 on premium routes.
   - Enabled mode + active/trialing: premium routes allowed.

## Notes

- This scaffold intentionally does not require live Stripe keys to run.
- Signature verification is minimal and should be reviewed before production launch.
