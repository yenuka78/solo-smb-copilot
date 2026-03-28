import { randomUUID } from "node:crypto";
import { readStore, recordBillingReconciliationReport, upsertSubscriptionState } from "@/lib/store";
import type { BillingReconciliationDrift, BillingReconciliationReport, SubscriptionStatus } from "@/lib/types";

type StripeSubscriptionResponse = {
  id?: string;
  status?: string;
  customer?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  items?: {
    data?: Array<{
      price?: {
        id?: string;
      };
    }>;
  };
};

const KNOWN_STATUSES = new Set([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

function normalizeStatus(value: unknown): SubscriptionStatus {
  if (typeof value !== "string") return "incomplete";
  return (KNOWN_STATUSES.has(value) ? value : "incomplete") as SubscriptionStatus;
}

function toIsoFromUnix(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Date(value * 1000).toISOString();
}

function readFirstPriceId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const maybeItems = (value as { items?: { data?: Array<{ price?: { id?: string } }> } }).items?.data;
  if (!maybeItems || maybeItems.length === 0) return undefined;
  return maybeItems[0]?.price?.id;
}

function normalizeString(value: string | undefined): string {
  return (value ?? "").trim();
}

async function fetchStripeSubscription(input: {
  secretKey: string;
  subscriptionId: string;
}): Promise<{ ok: true; subscription: StripeSubscriptionResponse } | { ok: false; status: number; message: string }> {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    return {
      ok: false,
      status: response.status,
      message: payload?.error?.message ?? `Stripe API request failed with status ${response.status}`,
    };
  }

  const subscription = (await response.json()) as StripeSubscriptionResponse;
  return { ok: true, subscription };
}

export async function runStripeBillingReconciliation(input: {
  secretKey: string;
  dryRun?: boolean;
  maxAccounts?: number;
}): Promise<BillingReconciliationReport> {
  const startedAt = new Date().toISOString();
  const mode: BillingReconciliationReport["mode"] = input.dryRun ? "dry_run" : "live";

  const store = await readStore();
  const entries = Object.entries(store.billing.subscriptionsByAccount)
    .filter(([, subscription]) => Boolean(subscription.subscriptionId || subscription.customerId))
    .slice(0, Math.max(1, input.maxAccounts ?? 250));

  const drifts: BillingReconciliationDrift[] = [];
  let healedCount = 0;
  let unresolvedCount = 0;

  try {
    for (const [accountId, local] of entries) {
      if (!local.subscriptionId) {
        drifts.push({
          accountId,
          field: "subscription_id",
          action: "needs_review",
          message: "Local billing state has no Stripe subscription id; cannot reconcile this account.",
        });
        unresolvedCount += 1;
        continue;
      }

      const remoteResult = await fetchStripeSubscription({
        secretKey: input.secretKey,
        subscriptionId: local.subscriptionId,
      });

      if (!remoteResult.ok) {
        if (remoteResult.status === 404) {
          drifts.push({
            accountId,
            subscriptionId: local.subscriptionId,
            field: "missing_remote_subscription",
            localValue: local.status,
            remoteValue: "not_found",
            action: input.dryRun ? "needs_review" : "healed",
            message: input.dryRun
              ? "Stripe subscription is missing; live reconciliation would mark local state as canceled."
              : "Stripe subscription is missing; local state was marked canceled.",
          });

          if (!input.dryRun) {
            await upsertSubscriptionState({
              accountId,
              status: "canceled",
              subscriptionId: local.subscriptionId,
              customerId: local.customerId,
              cancelAtPeriodEnd: true,
            });
            healedCount += 1;
          } else {
            unresolvedCount += 1;
          }
          continue;
        }

        drifts.push({
          accountId,
          subscriptionId: local.subscriptionId,
          field: "fetch_error",
          action: "needs_review",
          message: `Stripe fetch failed: ${remoteResult.message}`,
        });
        unresolvedCount += 1;
        continue;
      }

      const remote = remoteResult.subscription;
      const remoteStatus = normalizeStatus(remote.status);
      const remoteCurrentPeriodEnd = toIsoFromUnix(remote.current_period_end);
      const remoteCancelAtPeriodEnd = Boolean(remote.cancel_at_period_end);
      const remotePriceId = readFirstPriceId(remote);
      const remoteCustomerId = typeof remote.customer === "string" ? remote.customer : undefined;

      const accountDrifts: BillingReconciliationDrift[] = [];

      if (local.status !== remoteStatus) {
        accountDrifts.push({
          accountId,
          subscriptionId: local.subscriptionId,
          field: "status",
          localValue: local.status,
          remoteValue: remoteStatus,
          action: input.dryRun ? "needs_review" : "healed",
          message: `Status drift detected (${local.status} -> ${remoteStatus}).`,
        });
      }

      if (normalizeString(local.currentPeriodEnd) !== normalizeString(remoteCurrentPeriodEnd)) {
        accountDrifts.push({
          accountId,
          subscriptionId: local.subscriptionId,
          field: "current_period_end",
          localValue: local.currentPeriodEnd,
          remoteValue: remoteCurrentPeriodEnd,
          action: input.dryRun ? "needs_review" : "healed",
          message: "Current period end drift detected.",
        });
      }

      if (Boolean(local.cancelAtPeriodEnd) !== remoteCancelAtPeriodEnd) {
        accountDrifts.push({
          accountId,
          subscriptionId: local.subscriptionId,
          field: "cancel_at_period_end",
          localValue: String(Boolean(local.cancelAtPeriodEnd)),
          remoteValue: String(remoteCancelAtPeriodEnd),
          action: input.dryRun ? "needs_review" : "healed",
          message: "Cancel-at-period-end drift detected.",
        });
      }

      if (normalizeString(local.priceId) !== normalizeString(remotePriceId)) {
        accountDrifts.push({
          accountId,
          subscriptionId: local.subscriptionId,
          field: "price_id",
          localValue: local.priceId,
          remoteValue: remotePriceId,
          action: input.dryRun ? "needs_review" : "healed",
          message: "Price id drift detected.",
        });
      }

      if (normalizeString(local.customerId) !== normalizeString(remoteCustomerId)) {
        accountDrifts.push({
          accountId,
          subscriptionId: local.subscriptionId,
          field: "customer_id",
          localValue: local.customerId,
          remoteValue: remoteCustomerId,
          action: input.dryRun ? "needs_review" : "healed",
          message: "Customer id drift detected.",
        });
      }

      if (accountDrifts.length > 0) {
        drifts.push(...accountDrifts);

        if (!input.dryRun) {
          await upsertSubscriptionState({
            accountId,
            status: remoteStatus,
            subscriptionId: local.subscriptionId,
            customerId: remoteCustomerId,
            currentPeriodEnd: remoteCurrentPeriodEnd,
            cancelAtPeriodEnd: remoteCancelAtPeriodEnd,
            priceId: remotePriceId,
          });
          healedCount += 1;
        }
      }
    }

    const completedAt = new Date().toISOString();
    const status: BillingReconciliationReport["status"] =
      drifts.length === 0 ? "success" : unresolvedCount > 0 ? "partial" : input.dryRun ? "partial" : "success";

    const report: BillingReconciliationReport = {
      runId: randomUUID(),
      mode,
      status,
      startedAt,
      completedAt,
      inspectedCount: entries.length,
      driftCount: drifts.length,
      healedCount,
      unresolvedCount,
      drifts: drifts.slice(0, 50),
    };

    await recordBillingReconciliationReport(report);
    return report;
  } catch (error) {
    const completedAt = new Date().toISOString();
    const report: BillingReconciliationReport = {
      runId: randomUUID(),
      mode,
      status: "failed",
      startedAt,
      completedAt,
      inspectedCount: entries.length,
      driftCount: drifts.length,
      healedCount,
      unresolvedCount: unresolvedCount + 1,
      drifts: drifts.slice(0, 50),
      error: error instanceof Error ? error.message : "Unexpected reconciliation failure",
    };

    await recordBillingReconciliationReport(report);
    return report;
  }
}
