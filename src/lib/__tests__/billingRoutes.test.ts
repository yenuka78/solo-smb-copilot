import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { POST as createCheckout } from "@/app/api/billing/checkout/route";
import { POST as createBillingPortal } from "@/app/api/billing/portal/route";
import { GET as getBillingStatus } from "@/app/api/billing/status/route";
import { POST as processStripeWebhook } from "@/app/api/billing/stripe/webhook/route";
import { readStore } from "@/lib/store";

const testDataFile = path.join(process.cwd(), "data", "store.json");

async function resetStore() {
  await fs.writeFile(
    testDataFile,
    JSON.stringify(
      {
        transactions: [],
        deadlines: [],
        receivables: [],
        settings: { taxReserveRate: 0.25, currency: "USD" },
        onboarding: { completedSteps: {} },
        billing: {
          subscriptionsByAccount: {},
          accountByStripeCustomerId: {},
          processedWebhookEventIds: [],
          updatedAt: new Date(0).toISOString(),
        },
        reminderDispatches: {},
        receivableActionCounters: {},
        receivableActionEvents: [],
      },
      null,
      2,
    ),
  );
}

function signStripePayload(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

describe("billing routes", () => {
  it("creates a checkout session and persists pending billing state", async () => {
    await resetStore();

    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PRICE_ID = "price_test_123";
    process.env.STRIPE_CHECKOUT_SUCCESS_URL = "http://localhost:3000?billing=success";
    process.env.STRIPE_CHECKOUT_CANCEL_URL = "http://localhost:3000?billing=cancel";

    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          id: "cs_test_123",
          url: "https://checkout.stripe.com/c/pay/cs_test_123",
          customer: "cus_123",
          subscription: "sub_123",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    try {
      const req = new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-account-id": "owner-1" },
        body: JSON.stringify({}),
      });

      const response = await createCheckout(req);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        checkout: { sessionId: string; url: string };
        subscription: { accountId: string; status: string; checkoutSessionId?: string };
      };

      assert.equal(payload.checkout.sessionId, "cs_test_123");
      assert.equal(payload.subscription.accountId, "owner-1");
      assert.equal(payload.subscription.status, "incomplete");
      assert.equal(payload.subscription.checkoutSessionId, "cs_test_123");

      const store = await readStore();
      assert.equal(store.billing.subscriptionsByAccount["owner-1"]?.customerId, "cus_123");
      assert.equal(store.billing.accountByStripeCustomerId["cus_123"], "owner-1");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("creates a billing portal session for an account with a Stripe customer", async () => {
    await resetStore();

    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PRICE_ID = "price_test_123";

    const originalFetch = global.fetch;
    let fetchCall = 0;
    global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      fetchCall += 1;
      if (fetchCall === 1) {
        return new Response(
          JSON.stringify({
            id: "cs_test_123",
            url: "https://checkout.stripe.com/c/pay/cs_test_123",
            customer: "cus_123",
            subscription: "sub_123",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      const body = String(init?.body ?? "");
      assert.equal(body.includes("customer=cus_123"), true);
      assert.equal(body.includes("return_url="), true);

      return new Response(
        JSON.stringify({
          id: "bps_123",
          url: "https://billing.stripe.com/session/bps_123",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const checkoutResponse = await createCheckout(
        new Request("http://localhost/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-account-id": "owner-portal" },
          body: JSON.stringify({}),
        }),
      );
      assert.equal(checkoutResponse.status, 200);

      const portalResponse = await createBillingPortal(
        new Request("http://localhost/api/billing/portal", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-account-id": "owner-portal" },
          body: JSON.stringify({}),
        }),
      );

      assert.equal(portalResponse.status, 200);
      const payload = (await portalResponse.json()) as {
        portal: { sessionId: string; url: string };
        subscription: { customerId?: string };
      };

      assert.equal(payload.portal.sessionId, "bps_123");
      assert.equal(payload.portal.url, "https://billing.stripe.com/session/bps_123");
      assert.equal(payload.subscription.customerId, "cus_123");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("rejects billing portal creation when no Stripe customer is linked", async () => {
    await resetStore();

    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";

    const response = await createBillingPortal(
      new Request("http://localhost/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-account-id": "owner-without-customer" },
        body: JSON.stringify({}),
      }),
    );

    assert.equal(response.status, 409);
    const payload = (await response.json()) as { error: string };
    assert.equal(payload.error, "No Stripe customer is linked to this account yet");
  });

  it("completes subscription state via checkout + subscription webhook events", async () => {
    await resetStore();

    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";

    const checkoutCompleted = JSON.stringify({
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          mode: "subscription",
          customer: "cus_123",
          subscription: "sub_123",
          client_reference_id: "owner-2",
        },
      },
    });

    const checkoutResponse = await processStripeWebhook(
      new Request("http://localhost/api/billing/stripe/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": signStripePayload(checkoutCompleted, "whsec_test_123"),
        },
        body: checkoutCompleted,
      }),
    );

    assert.equal(checkoutResponse.status, 200);

    const subscriptionUpdated = JSON.stringify({
      id: "evt_subscription_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          status: "active",
          customer: "cus_123",
          current_period_end: 1_800_000_000,
          cancel_at_period_end: false,
          items: {
            data: [{ price: { id: "price_test_123" } }],
          },
        },
      },
    });

    const subscriptionResponse = await processStripeWebhook(
      new Request("http://localhost/api/billing/stripe/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": signStripePayload(subscriptionUpdated, "whsec_test_123"),
        },
        body: subscriptionUpdated,
      }),
    );

    assert.equal(subscriptionResponse.status, 200);

    const store = await readStore();
    const state = store.billing.subscriptionsByAccount["owner-2"];
    assert.ok(state);
    assert.equal(state.status, "active");
    assert.equal(state.subscriptionId, "sub_123");
    assert.equal(state.customerId, "cus_123");
    assert.equal(state.priceId, "price_test_123");
    assert.equal(store.billing.processedWebhookEventIds.includes("evt_checkout_1"), true);
    assert.equal(store.billing.processedWebhookEventIds.includes("evt_subscription_1"), true);

    const statusResponse = await getBillingStatus(
      new Request("http://localhost/api/billing/status", {
        headers: { "x-account-id": "owner-2" },
      }),
    );
    assert.equal(statusResponse.status, 200);
    const statusPayload = (await statusResponse.json()) as {
      subscription: { status: string };
      billing: { webhooksReady: boolean };
    };
    assert.equal(statusPayload.subscription.status, "active");
    assert.equal(statusPayload.billing.webhooksReady, true);
  });

  it("tracks invoice payment failures and clears delinquency when invoice is paid", async () => {
    await resetStore();

    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";

    const checkoutCompleted = JSON.stringify({
      id: "evt_checkout_invoice",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_invoice",
          mode: "subscription",
          customer: "cus_invoice",
          subscription: "sub_invoice",
          client_reference_id: "owner-invoice",
        },
      },
    });

    const subscriptionUpdated = JSON.stringify({
      id: "evt_subscription_invoice",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_invoice",
          status: "active",
          customer: "cus_invoice",
          current_period_end: 1_800_000_000,
          cancel_at_period_end: false,
        },
      },
    });

    const invoiceFailed = JSON.stringify({
      id: "evt_invoice_failed_1",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_123",
          subscription: "sub_invoice",
          customer: "cus_invoice",
          status: "open",
          amount_due: 34900,
          amount_paid: 0,
          currency: "usd",
          due_date: 1_801_000_000,
          hosted_invoice_url: "https://pay.stripe.com/invoice/in_123",
          last_payment_error: {
            message: "Your card has insufficient funds.",
          },
        },
      },
    });

    const invoicePaid = JSON.stringify({
      id: "evt_invoice_paid_1",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_123",
          subscription: "sub_invoice",
          customer: "cus_invoice",
          status: "paid",
          amount_due: 34900,
          amount_paid: 34900,
          currency: "usd",
          due_date: 1_801_000_000,
          hosted_invoice_url: "https://pay.stripe.com/invoice/in_123",
        },
      },
    });

    for (const payload of [checkoutCompleted, subscriptionUpdated, invoiceFailed]) {
      const response = await processStripeWebhook(
        new Request("http://localhost/api/billing/stripe/webhook", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "stripe-signature": signStripePayload(payload, "whsec_test_123"),
          },
          body: payload,
        }),
      );
      assert.equal(response.status, 200);
    }

    let store = await readStore();
    let state = store.billing.subscriptionsByAccount["owner-invoice"];
    assert.ok(state);
    assert.equal(state.status, "past_due");
    assert.equal(state.latestInvoiceStatus, "open");
    assert.equal(state.latestInvoiceAmountDue, 349);
    assert.equal(state.latestInvoiceCurrency, "USD");
    assert.equal(Boolean(state.delinquentSince), true);
    assert.equal(state.latestPaymentError, "Your card has insufficient funds.");
    assert.equal(state.invoiceTimeline.length, 1);
    assert.equal(state.invoiceTimeline[0]?.eventType, "invoice.payment_failed");
    assert.equal(state.invoiceTimeline[0]?.paymentError, "Your card has insufficient funds.");

    const paidResponse = await processStripeWebhook(
      new Request("http://localhost/api/billing/stripe/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": signStripePayload(invoicePaid, "whsec_test_123"),
        },
        body: invoicePaid,
      }),
    );
    assert.equal(paidResponse.status, 200);

    store = await readStore();
    state = store.billing.subscriptionsByAccount["owner-invoice"];
    assert.ok(state);
    assert.equal(state.status, "active");
    assert.equal(state.latestInvoiceStatus, "paid");
    assert.equal(state.latestInvoiceAmountPaid, 349);
    assert.equal(state.delinquentSince, undefined);
    assert.equal(state.latestPaymentError, undefined);
    assert.equal(state.invoiceTimeline.length, 2);
    assert.equal(state.invoiceTimeline[0]?.eventType, "invoice.paid");
    assert.equal(state.invoiceTimeline[1]?.eventType, "invoice.payment_failed");

    const statusResponse = await getBillingStatus(
      new Request("http://localhost/api/billing/status", {
        headers: { "x-account-id": "owner-invoice" },
      }),
    );
    assert.equal(statusResponse.status, 200);
    const statusPayload = (await statusResponse.json()) as {
      subscription: {
        status: string;
        latestInvoiceHostedUrl?: string;
        latestInvoiceStatus?: string;
        invoiceTimeline?: Array<{ eventType: string }>;
      };
    };
    assert.equal(statusPayload.subscription.status, "active");
    assert.equal(statusPayload.subscription.latestInvoiceStatus, "paid");
    assert.equal(statusPayload.subscription.latestInvoiceHostedUrl, "https://pay.stripe.com/invoice/in_123");
    assert.equal(statusPayload.subscription.invoiceTimeline?.length, 2);
    assert.equal(statusPayload.subscription.invoiceTimeline?.[0]?.eventType, "invoice.paid");
  });
});
