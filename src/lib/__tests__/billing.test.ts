import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";
import { verifyStripeWebhookSignature } from "@/lib/billing/stripeWebhook";

describe("verifyStripeWebhookSignature", () => {
  test("accepts valid signatures", () => {
    const payload = JSON.stringify({ id: "evt_test", type: "customer.subscription.updated" });
    const webhookSecret = "whsec_test_123";
    const timestamp = 1_700_000_000;
    const signed = `${timestamp}.${payload}`;
    const v1 = createHmac("sha256", webhookSecret).update(signed).digest("hex");

    const result = verifyStripeWebhookSignature({
      payload,
      webhookSecret,
      signatureHeader: `t=${timestamp},v1=${v1}`,
      toleranceSeconds: 300,
      nowMs: timestamp * 1000,
    });

    assert.equal(result.ok, true);
  });

  test("rejects mismatched signatures", () => {
    const result = verifyStripeWebhookSignature({
      payload: "{}",
      webhookSecret: "whsec_test_123",
      signatureHeader: "t=1700000000,v1=bad",
      toleranceSeconds: 300,
      nowMs: 1_700_000_000_000,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "signature_mismatch");
    }
  });
});
