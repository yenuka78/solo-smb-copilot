import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { runStripeBillingReconciliation } from "@/lib/billing/stripeReconciliation";
import { readStore } from "@/lib/store";
import { POST as runScheduledBillingReconciliation } from "@/app/api/billing/reconcile/run/route";
import { POST as runManualBillingReconciliation } from "@/app/api/billing/reconcile/route";

const testDataFile = path.join(process.cwd(), "data", "store.json");

async function resetStoreWithSubscription(overrides?: { status?: string; subscriptionId?: string }) {
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
          subscriptionsByAccount: {
            "owner-reconcile": {
              accountId: "owner-reconcile",
              provider: "stripe",
              status: overrides?.status ?? "past_due",
              subscriptionId: overrides?.subscriptionId ?? "sub_reconcile_1",
              customerId: "cus_reconcile_1",
              priceId: "price_local_old",
              cancelAtPeriodEnd: false,
              updatedAt: new Date().toISOString(),
            },
          },
          accountByStripeCustomerId: {
            cus_reconcile_1: "owner-reconcile",
          },
          processedWebhookEventIds: [],
          reconciliation: {
            recentReports: [],
          },
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

describe("billing reconciliation", () => {
  it("heals Stripe/local subscription drift in live mode and persists reconcile report", async () => {
    await resetStoreWithSubscription({ status: "past_due" });

    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          id: "sub_reconcile_1",
          status: "active",
          customer: "cus_reconcile_1",
          cancel_at_period_end: false,
          current_period_end: 1_900_000_000,
          items: {
            data: [{ price: { id: "price_remote_new" } }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    try {
      const report = await runStripeBillingReconciliation({
        secretKey: "sk_test_123",
        dryRun: false,
      });

      assert.equal(report.mode, "live");
      assert.equal(report.inspectedCount, 1);
      assert.equal(report.driftCount >= 1, true);
      assert.equal(report.healedCount, 1);
      assert.equal(report.unresolvedCount, 0);

      const store = await readStore();
      const state = store.billing.subscriptionsByAccount["owner-reconcile"];
      assert.equal(state?.status, "active");
      assert.equal(state?.priceId, "price_remote_new");
      assert.equal(Boolean(store.billing.reconciliation.lastReport), true);
      assert.equal(store.billing.reconciliation.lastReport?.runId, report.runId);
    } finally {
      global.fetch = originalFetch;
    }
  });


  it("manual reconcile endpoint supports dry-run mode without mutating subscription status", async () => {
    await resetStoreWithSubscription({ status: "past_due" });

    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";

    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          id: "sub_reconcile_1",
          status: "active",
          customer: "cus_reconcile_1",
          cancel_at_period_end: false,
          current_period_end: 1_900_000_000,
          items: {
            data: [{ price: { id: "price_remote_new" } }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    try {
      const response = await runManualBillingReconciliation(
        new Request("http://localhost/api/billing/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dryRun: true }),
        }),
      );

      assert.equal(response.status, 200);
      const payload = (await response.json()) as { report: { mode: string; driftCount: number; healedCount: number } };
      assert.equal(payload.report.mode, "dry_run");
      assert.equal(payload.report.driftCount >= 1, true);
      assert.equal(payload.report.healedCount, 0);

      const store = await readStore();
      assert.equal(store.billing.subscriptionsByAccount["owner-reconcile"]?.status, "past_due");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("scheduled runner enforces token and executes reconciliation", async () => {
    await resetStoreWithSubscription({ status: "active" });

    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_RECONCILE_RUNNER_TOKEN = "runner-secret";

    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          id: "sub_reconcile_1",
          status: "active",
          customer: "cus_reconcile_1",
          cancel_at_period_end: false,
          current_period_end: 1_900_000_000,
          items: {
            data: [{ price: { id: "price_local_old" } }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    try {
      const unauthorized = await runScheduledBillingReconciliation(
        new Request("http://localhost/api/billing/reconcile/run", { method: "POST" }),
      );
      assert.equal(unauthorized.status, 401);

      const authorized = await runScheduledBillingReconciliation(
        new Request("http://localhost/api/billing/reconcile/run", {
          method: "POST",
          headers: {
            "x-reconcile-token": "runner-secret",
          },
        }),
      );

      assert.equal(authorized.status, 200);
      const payload = (await authorized.json()) as { ok: boolean; report: { mode: string; status: string } };
      assert.equal(payload.ok, true);
      assert.equal(payload.report.mode, "live");
      assert.equal(["success", "partial"].includes(payload.report.status), true);
    } finally {
      global.fetch = originalFetch;
      delete process.env.STRIPE_RECONCILE_RUNNER_TOKEN;
    }
  });
});
