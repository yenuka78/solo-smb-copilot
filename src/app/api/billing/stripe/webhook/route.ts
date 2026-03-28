import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import {
  getSubscriptionState,
  hasProcessedWebhookEvent,
  markWebhookEventProcessed,
  resolveAccountIdByStripeCustomerId,
  resolveAccountIdBySubscriptionId,
  upsertSubscriptionState,
} from "@/lib/store";
import { type StripeWebhookEvent, verifyStripeWebhookSignature } from "@/lib/billing/stripeWebhook";

export const runtime = "nodejs";

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

const KNOWN_INVOICE_STATUSES = new Set(["draft", "open", "paid", "uncollectible", "void"]);

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

function readInvoiceStatus(value: unknown): "draft" | "open" | "paid" | "uncollectible" | "void" | undefined {
  if (typeof value !== "string") return undefined;
  return KNOWN_INVOICE_STATUSES.has(value)
    ? (value as "draft" | "open" | "paid" | "uncollectible" | "void")
    : undefined;
}

function toAmountInCurrencyUnits(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value / 100;
}

async function resolveAccountId(payload: Record<string, unknown>): Promise<string> {
  const metadataAccountId = payload.metadata && typeof payload.metadata === "object"
    ? String((payload.metadata as Record<string, unknown>).accountId ?? "")
    : "";

  if (metadataAccountId) return metadataAccountId;

  const customerId = typeof payload.customer === "string" ? payload.customer : "";
  if (customerId) {
    const mapped = await resolveAccountIdByStripeCustomerId(customerId);
    if (mapped) return mapped;
  }

  const subscriptionId = typeof payload.subscription === "string" ? payload.subscription : "";
  if (subscriptionId) {
    const mapped = await resolveAccountIdBySubscriptionId(subscriptionId);
    if (mapped) return mapped;
  }

  const clientReferenceId = typeof payload.client_reference_id === "string" ? payload.client_reference_id : "";
  if (clientReferenceId) return clientReferenceId;

  return "solo-owner";
}

async function applyStripeCheckoutCompletedEvent(event: StripeWebhookEvent): Promise<void> {
  const payload = event.data?.object;
  if (!payload || typeof payload !== "object") return;

  const record = payload as Record<string, unknown>;
  if (record.mode !== "subscription") return;

  const accountId = await resolveAccountId(record);
  await upsertSubscriptionState({
    accountId,
    status: "incomplete",
    customerId: typeof record.customer === "string" ? record.customer : undefined,
    subscriptionId: typeof record.subscription === "string" ? record.subscription : undefined,
    checkoutSessionId: typeof record.id === "string" ? record.id : undefined,
    checkoutSessionUrl: undefined,
    cancelAtPeriodEnd: false,
  });
}

async function applyStripeSubscriptionEvent(event: StripeWebhookEvent): Promise<void> {
  const payload = event.data?.object;
  if (!payload || typeof payload !== "object") return;

  const record = payload as Record<string, unknown>;
  const accountId = await resolveAccountId(record);

  if (event.type === "customer.subscription.deleted") {
    await upsertSubscriptionState({
      accountId,
      status: "canceled",
      subscriptionId: typeof record.id === "string" ? record.id : undefined,
      customerId: typeof record.customer === "string" ? record.customer : undefined,
      currentPeriodEnd: toIsoFromUnix(record.current_period_end),
      cancelAtPeriodEnd: true,
    });
    return;
  }

  if (event.type?.startsWith("customer.subscription.")) {
    const rawStatus = typeof record.status === "string" ? record.status : "incomplete";
    const status = (KNOWN_STATUSES.has(rawStatus) ? rawStatus : "incomplete") as
      | "incomplete"
      | "incomplete_expired"
      | "trialing"
      | "active"
      | "past_due"
      | "canceled"
      | "unpaid"
      | "paused";

    await upsertSubscriptionState({
      accountId,
      status,
      subscriptionId: typeof record.id === "string" ? record.id : undefined,
      customerId: typeof record.customer === "string" ? record.customer : undefined,
      priceId: readFirstPriceId(record),
      currentPeriodEnd: toIsoFromUnix(record.current_period_end),
      cancelAtPeriodEnd: Boolean(record.cancel_at_period_end),
    });
  }
}

async function applyStripeInvoiceEvent(event: StripeWebhookEvent): Promise<void> {
  if (event.type !== "invoice.payment_failed" && event.type !== "invoice.paid") {
    return;
  }

  const payload = event.data?.object;
  if (!payload || typeof payload !== "object") return;

  const record = payload as Record<string, unknown>;
  const accountId = await resolveAccountId(record);
  const existing = await getSubscriptionState(accountId);

  const dueDateIso = toIsoFromUnix(record.due_date);
  const invoiceStatus = readInvoiceStatus(record.status);
  const paymentError = record.last_payment_error && typeof record.last_payment_error === "object"
    ? String((record.last_payment_error as { message?: string }).message ?? "") || undefined
    : undefined;

  const baseUpdate = {
    accountId,
    status: existing?.status ?? "incomplete",
    subscriptionId: typeof record.subscription === "string" ? record.subscription : existing?.subscriptionId,
    customerId: typeof record.customer === "string" ? record.customer : existing?.customerId,
    latestInvoiceId: typeof record.id === "string" ? record.id : undefined,
    latestInvoiceStatus: invoiceStatus,
    latestInvoiceAmountDue: toAmountInCurrencyUnits(record.amount_due),
    latestInvoiceAmountPaid: toAmountInCurrencyUnits(record.amount_paid),
    latestInvoiceCurrency: typeof record.currency === "string" ? record.currency.toUpperCase() : undefined,
    latestInvoiceDueDate: dueDateIso,
    latestInvoiceHostedUrl: typeof record.hosted_invoice_url === "string" ? record.hosted_invoice_url : undefined,
  };

  if (event.type === "invoice.payment_failed") {
    const fallbackStatus =
      existing?.status && existing.status !== "canceled" && existing.status !== "paused"
        ? "past_due"
        : existing?.status ?? "past_due";

    await upsertSubscriptionState({
      ...baseUpdate,
      status: fallbackStatus,
      latestPaymentError: paymentError ?? "Stripe failed to collect this invoice.",
      invoiceTimelineEvent: event.id
        ? {
            eventId: event.id,
            eventType: "invoice.payment_failed",
            occurredAt: new Date().toISOString(),
            invoiceId: typeof record.id === "string" ? record.id : undefined,
            invoiceStatus,
            amountDue: toAmountInCurrencyUnits(record.amount_due),
            amountPaid: toAmountInCurrencyUnits(record.amount_paid),
            currency: typeof record.currency === "string" ? record.currency.toUpperCase() : undefined,
            dueDate: dueDateIso,
            hostedInvoiceUrl: typeof record.hosted_invoice_url === "string" ? record.hosted_invoice_url : undefined,
            paymentError: paymentError ?? "Stripe failed to collect this invoice.",
            resultingSubscriptionStatus: fallbackStatus,
          }
        : null,
      delinquentSince: existing?.delinquentSince ?? new Date().toISOString(),
    });
    return;
  }

  const recoveredStatus = existing?.status === "trialing" ? "trialing" : "active";

  await upsertSubscriptionState({
    ...baseUpdate,
    status: recoveredStatus,
    latestPaymentError: null,
    invoiceTimelineEvent: event.id
      ? {
          eventId: event.id,
          eventType: "invoice.paid",
          occurredAt: new Date().toISOString(),
          invoiceId: typeof record.id === "string" ? record.id : undefined,
          invoiceStatus,
          amountDue: toAmountInCurrencyUnits(record.amount_due),
          amountPaid: toAmountInCurrencyUnits(record.amount_paid),
          currency: typeof record.currency === "string" ? record.currency.toUpperCase() : undefined,
          dueDate: dueDateIso,
          hostedInvoiceUrl: typeof record.hosted_invoice_url === "string" ? record.hosted_invoice_url : undefined,
          resultingSubscriptionStatus: recoveredStatus,
        }
      : null,
    delinquentSince: null,
  });
}

export async function POST(req: Request) {
  const env = getEnv();

  if (!env.billing.stripeEnabled) {
    return NextResponse.json({ received: true, skipped: "stripe_disabled" });
  }

  if (!env.billing.stripeWebhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook is enabled but STRIPE_WEBHOOK_SECRET is missing" },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const verification = verifyStripeWebhookSignature({
    payload: rawBody,
    signatureHeader: req.headers.get("stripe-signature"),
    webhookSecret: env.billing.stripeWebhookSecret,
    toleranceSeconds: env.billing.webhookToleranceSeconds,
  });

  if (!verification.ok) {
    return NextResponse.json(
      { error: "Invalid Stripe signature", reason: verification.reason },
      { status: 400 },
    );
  }

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(rawBody) as StripeWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (event.id && (await hasProcessedWebhookEvent(event.id))) {
    return NextResponse.json({ received: true, deduplicated: true, type: event.type ?? "unknown" });
  }

  if (event.type === "checkout.session.completed") {
    await applyStripeCheckoutCompletedEvent(event);
  }

  await applyStripeSubscriptionEvent(event);
  await applyStripeInvoiceEvent(event);

  if (event.id) {
    await markWebhookEventProcessed(event.id);
  }

  return NextResponse.json({ received: true, type: event.type ?? "unknown" });
}
