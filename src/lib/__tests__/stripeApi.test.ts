import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStripeBillingPortalSession } from "@/lib/billing/stripeApi";

describe("stripeApi", () => {
  test("createStripeBillingPortalSession posts customer + return_url", async () => {
    const originalFetch = global.fetch;

    global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(init?.method, "POST");
      const body = String(init?.body ?? "");
      assert.equal(body.includes("customer=cus_test_123"), true);
      assert.equal(body.includes("return_url=https%3A%2F%2Fapp.example.com%2Fsettings"), true);

      return new Response(
        JSON.stringify({ id: "bps_test_123", url: "https://billing.stripe.com/session/bps_test_123" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const session = await createStripeBillingPortalSession({
        secretKey: "sk_test_123",
        customerId: "cus_test_123",
        returnUrl: "https://app.example.com/settings",
      });

      assert.equal(session.id, "bps_test_123");
      assert.equal(session.url, "https://billing.stripe.com/session/bps_test_123");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
