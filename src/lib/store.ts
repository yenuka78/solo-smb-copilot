import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { markOnboardingStepComplete as markStepCompleteInState, normalizeOnboardingState } from "./onboarding";
import type {
  BillingReconciliationReport,
  BillingState,
  Deadline,
  OnboardingState,
  OnboardingStepKey,
  Receivable,
  ReceivableActionEvent,
  ReceivableStatus,
  Settings,
  Store,
  SubscriptionState,
  SubscriptionStatus,
  Transaction,
} from "./types";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "store.json");

const defaultSettings: Settings = {
  taxReserveRate: 0.25,
  currency: "USD",
};

const defaultOnboarding: OnboardingState = {
  completedSteps: {},
};

const defaultBilling: BillingState = {
  subscriptionsByAccount: {},
  accountByStripeCustomerId: {},
  processedWebhookEventIds: [],
  reconciliation: {
    recentReports: [],
  },
  updatedAt: new Date(0).toISOString(),
};

const defaultStore: Store = {
  transactions: [],
  deadlines: [],
  receivables: [],
  settings: defaultSettings,
  onboarding: defaultOnboarding,
  billing: defaultBilling,
  reminderDispatches: {},
  receivableActionCounters: {},
  receivableActionEvents: [],
};

async function ensureStore(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, JSON.stringify(defaultStore, null, 2), "utf8");
  }
}

export async function readStore(): Promise<Store> {
  await ensureStore();
  const content = await readFile(dataFile, "utf8");
  const parsed = JSON.parse(content) as Partial<Store>;

  return {
    transactions: parsed.transactions ?? [],
    deadlines: parsed.deadlines ?? [],
    receivables: (parsed.receivables ?? []).map((receivable) => ({
      ...receivable,
      reminderCount: receivable.reminderCount ?? 0,
      promiseDate: receivable.promiseDate,
      nextFollowUpDate: receivable.nextFollowUpDate,
      notes: receivable.notes,
      lastReminderAt: receivable.lastReminderAt,
      lastReminderChannel: receivable.lastReminderChannel,
      lastActionAt: receivable.lastActionAt,
      lastActionType: receivable.lastActionType,
    })),
    settings: {
      taxReserveRate: parsed.settings?.taxReserveRate ?? defaultSettings.taxReserveRate,
      currency: parsed.settings?.currency ?? defaultSettings.currency,
      monthlyRevenueGoal: parsed.settings?.monthlyRevenueGoal,
      monthlyExpenseLimit: parsed.settings?.monthlyExpenseLimit,
      currentCashBalance: parsed.settings?.currentCashBalance,
      cashBurnRateMultiplier: parsed.settings?.cashBurnRateMultiplier,
      receivableCollectionConfidence: parsed.settings?.receivableCollectionConfidence,
      receivableRecommendationCalibration: parsed.settings?.receivableRecommendationCalibration,
    },
    onboarding: normalizeOnboardingState(parsed.onboarding),
    billing: {
      subscriptionsByAccount: Object.fromEntries(
        Object.entries(parsed.billing?.subscriptionsByAccount ?? {}).map(([accountId, subscription]) => {
          const timeline = Array.isArray(subscription?.invoiceTimeline)
            ? subscription.invoiceTimeline.filter((event): event is SubscriptionState["invoiceTimeline"][number] => {
                if (!event || typeof event !== "object") return false;
                if (typeof event.eventId !== "string" || typeof event.eventType !== "string") return false;
                if (typeof event.occurredAt !== "string" || typeof event.resultingSubscriptionStatus !== "string") return false;
                return true;
              })
            : [];

          return [
            accountId,
            {
              ...subscription,
              invoiceTimeline: timeline,
            },
          ];
        }),
      ),
      accountByStripeCustomerId: parsed.billing?.accountByStripeCustomerId ?? {},
      processedWebhookEventIds: parsed.billing?.processedWebhookEventIds ?? [],
      reconciliation: {
        lastRunAt: parsed.billing?.reconciliation?.lastRunAt,
        lastSuccessAt: parsed.billing?.reconciliation?.lastSuccessAt,
        lastReport: parsed.billing?.reconciliation?.lastReport,
        recentReports: parsed.billing?.reconciliation?.recentReports ?? [],
      },
      updatedAt: parsed.billing?.updatedAt ?? defaultBilling.updatedAt,
    },
    reminderDispatches: parsed.reminderDispatches ?? {},
    receivableActionCounters: parsed.receivableActionCounters ?? {},
    receivableActionEvents: (parsed.receivableActionEvents ?? []).filter((event): event is ReceivableActionEvent => {
      if (!event || typeof event !== "object") return false;
      if (typeof event.id !== "string" || typeof event.receivableId !== "string") return false;
      if (typeof event.actionType !== "string" || typeof event.createdAt !== "string") return false;
      if (event.channel !== undefined && typeof event.channel !== "string") return false;
      if (event.amountCollected !== undefined && (!Number.isFinite(event.amountCollected) || event.amountCollected < 0)) {
        return false;
      }
      return true;
    }),
  };
}

export async function writeStore(store: Store): Promise<void> {
  await ensureStore();
  await writeFile(dataFile, JSON.stringify(store, null, 2), "utf8");
}

export async function markOnboardingStepComplete(step: OnboardingStepKey): Promise<void> {
  const store = await readStore();
  const next = markStepCompleteInState(store.onboarding, step);

  if (next !== store.onboarding) {
    store.onboarding = next;
    await writeStore(store);
  }
}

export async function addTransaction(
  input: Omit<Transaction, "id" | "createdAt">,
): Promise<Transaction> {
  const store = await readStore();

  const tx: Transaction = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  store.transactions.unshift(tx);
  store.onboarding = markStepCompleteInState(store.onboarding, "add_first_transaction");
  await writeStore(store);
  return tx;
}

export async function deleteTransaction(id: string): Promise<boolean> {
  const store = await readStore();
  const initialLength = store.transactions.length;
  store.transactions = store.transactions.filter((t) => t.id !== id);

  if (store.transactions.length === initialLength) {
    return false;
  }

  await writeStore(store);
  return true;
}

export async function deleteDeadline(id: string): Promise<boolean> {
  const store = await readStore();
  const initialLength = store.deadlines.length;
  store.deadlines = store.deadlines.filter((d) => d.id !== id);

  if (store.deadlines.length === initialLength) {
    return false;
  }

  await writeStore(store);
  return true;
}

export async function addReceivable(
  input: Omit<
    Receivable,
    "id" | "createdAt" | "updatedAt" | "reminderCount" | "lastReminderAt" | "lastReminderChannel"
  >,
): Promise<Receivable> {
  const store = await readStore();

  const now = new Date().toISOString();
  const receivable: Receivable = {
    ...input,
    reminderCount: 0,
    lastReminderAt: undefined,
    lastReminderChannel: undefined,
    lastActionAt: now,
    lastActionType: "update",
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  store.receivables.unshift(receivable);
  await writeStore(store);
  return receivable;
}

export async function updateReceivable(input: {
  id: string;
  customerName?: string;
  amount?: number;
  amountPaid?: number;
  dueDate?: string;
  status?: ReceivableStatus;
  description?: string | null;
  notes?: string | null;
  promiseDate?: string | null;
  nextFollowUpDate?: string | null;
  reminderCount?: number;
  lastReminderAt?: string;
  lastReminderChannel?: Receivable["lastReminderChannel"];
  lastActionAt?: string;
  lastActionType?: Receivable["lastActionType"];
}): Promise<Receivable | null> {
  const store = await readStore();
  const found = store.receivables.find((r) => r.id === input.id);
  if (!found) return null;

  if (input.customerName !== undefined) found.customerName = input.customerName;
  if (input.amount !== undefined) found.amount = input.amount;
  if (input.amountPaid !== undefined) found.amountPaid = input.amountPaid;
  if (input.dueDate !== undefined) found.dueDate = input.dueDate;
  if (input.status !== undefined) found.status = input.status;
  if (Object.prototype.hasOwnProperty.call(input, "description")) found.description = input.description ?? undefined;
  if (Object.prototype.hasOwnProperty.call(input, "notes")) found.notes = input.notes ?? undefined;
  if (Object.prototype.hasOwnProperty.call(input, "promiseDate")) found.promiseDate = input.promiseDate ?? undefined;
  if (Object.prototype.hasOwnProperty.call(input, "nextFollowUpDate")) found.nextFollowUpDate = input.nextFollowUpDate ?? undefined;
  if (input.reminderCount !== undefined) found.reminderCount = input.reminderCount;
  if (input.lastReminderAt !== undefined) found.lastReminderAt = input.lastReminderAt;
  if (input.lastReminderChannel !== undefined) found.lastReminderChannel = input.lastReminderChannel;
  if (input.lastActionAt !== undefined) found.lastActionAt = input.lastActionAt;
  if (input.lastActionType !== undefined) found.lastActionType = input.lastActionType;

  found.updatedAt = new Date().toISOString();

  await writeStore(store);
  return found;
}

export async function recordReceivableReminder(input: {
  id: string;
  channel?: Receivable["lastReminderChannel"];
  touchedAt?: string;
  actionType?: Receivable["lastActionType"];
}): Promise<Receivable | null> {
  const store = await readStore();
  const found = store.receivables.find((r) => r.id === input.id);
  if (!found) return null;

  const touchedAt = input.touchedAt ?? new Date().toISOString();
  found.reminderCount = (found.reminderCount ?? 0) + 1;
  found.lastReminderAt = touchedAt;
  if (input.channel) {
    found.lastReminderChannel = input.channel;
  }
  found.lastActionAt = touchedAt;
  found.lastActionType = input.actionType ?? "log_reminder";
  found.updatedAt = touchedAt;

  await writeStore(store);
  return found;
}

export async function deleteReceivable(id: string): Promise<boolean> {
  const store = await readStore();
  const initialLength = store.receivables.length;
  store.receivables = store.receivables.filter((r) => r.id !== id);

  if (store.receivables.length === initialLength) {
    return false;
  }

  await writeStore(store);
  return true;
}

export async function addDeadline(
  input: Omit<Deadline, "id" | "createdAt">,
): Promise<Deadline> {
  const store = await readStore();

  const deadline: Deadline = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  store.deadlines.unshift(deadline);
  store.onboarding = markStepCompleteInState(store.onboarding, "add_first_deadline");
  await writeStore(store);
  return deadline;
}

export async function updateDeadline(input: {
  id: string;
  title?: string;
  dueDate?: string;
  recurring?: Deadline["recurring"];
  status?: Deadline["status"];
  notes?: string;
}): Promise<Deadline | null> {
  const store = await readStore();
  const found = store.deadlines.find((d) => d.id === input.id);
  if (!found) return null;

  if (input.title !== undefined) found.title = input.title;
  if (input.dueDate !== undefined) found.dueDate = input.dueDate;
  if (input.recurring !== undefined) found.recurring = input.recurring;
  if (input.status !== undefined) found.status = input.status;
  if (input.notes !== undefined) found.notes = input.notes;

  await writeStore(store);
  return found;
}

export async function toggleDeadlineStatus(id: string): Promise<Deadline | null> {
  const store = await readStore();
  const found = store.deadlines.find((d) => d.id === id);
  if (!found) return null;

  found.status = found.status === "open" ? "done" : "open";
  await writeStore(store);
  return found;
}

export async function updateSettings(settings: Partial<Settings>): Promise<Settings> {
  const store = await readStore();
  const merged: Settings = {
    ...store.settings,
    ...settings,
  };

  store.settings = merged;
  if (settings.taxReserveRate !== undefined) {
    store.onboarding = markStepCompleteInState(store.onboarding, "set_tax_rate");
  }
  if (settings.monthlyRevenueGoal !== undefined) {
    store.onboarding = markStepCompleteInState(store.onboarding, "set_revenue_goal");
  }
  if (settings.monthlyExpenseLimit !== undefined) {
    store.onboarding = markStepCompleteInState(store.onboarding, "set_expense_limit");
  }

  await writeStore(store);
  return merged;
}

export async function recordReminderDispatches(dateKey: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const store = await readStore();
  const existing = new Set(store.reminderDispatches[dateKey] ?? []);
  for (const key of keys) {
    existing.add(key);
  }

  store.reminderDispatches[dateKey] = [...existing];
  await writeStore(store);
}

export async function incrementReceivableActionCounters(input: {
  keys: string[];
  amount?: number;
}): Promise<Record<string, number>> {
  const amount = input.amount ?? 1;
  if (!Number.isFinite(amount) || amount <= 0 || input.keys.length === 0) {
    const store = await readStore();
    return store.receivableActionCounters;
  }

  const store = await readStore();
  for (const key of input.keys) {
    if (!key) continue;
    store.receivableActionCounters[key] = (store.receivableActionCounters[key] ?? 0) + amount;
  }

  await writeStore(store);
  return store.receivableActionCounters;
}

export async function recordReceivableActionEvents(
  events: Array<Omit<ReceivableActionEvent, "id">>,
): Promise<ReceivableActionEvent[]> {
  if (events.length === 0) return [];

  const store = await readStore();
  const persistedEvents: ReceivableActionEvent[] = [];

  for (const event of events) {
    if (!event.receivableId || !event.actionType || !event.createdAt) continue;
    if (event.amountCollected !== undefined && (!Number.isFinite(event.amountCollected) || event.amountCollected < 0)) {
      continue;
    }

    const persisted: ReceivableActionEvent = {
      ...event,
      id: randomUUID(),
    };

    store.receivableActionEvents.push(persisted);
    persistedEvents.push(persisted);
  }

  if (persistedEvents.length > 0) {
    const maxEventsToKeep = 5000;
    if (store.receivableActionEvents.length > maxEventsToKeep) {
      store.receivableActionEvents = store.receivableActionEvents
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-maxEventsToKeep);
    }
    await writeStore(store);
  }

  return persistedEvents;
}

export async function getSubscriptionState(accountId: string): Promise<SubscriptionState | null> {
  const store = await readStore();
  return store.billing.subscriptionsByAccount[accountId] ?? null;
}

export async function updateTransaction(input: {
  id: string;
  amount?: number;
  date?: string;
  category?: string;
  description?: string;
  receiptName?: string;
  type?: Transaction["type"];
}): Promise<Transaction | null> {
  const store = await readStore();
  const found = store.transactions.find((t) => t.id === input.id);
  if (!found) return null;

  if (input.amount !== undefined) found.amount = input.amount;
  if (input.date !== undefined) found.date = input.date;
  if (input.category !== undefined) found.category = input.category;
  if (input.description !== undefined) found.description = input.description;
  if (Object.prototype.hasOwnProperty.call(input, "receiptName")) found.receiptName = input.receiptName;
  if (input.type !== undefined) found.type = input.type;

  // Manual edit implies review/correction
  if (found.ocr) {
    found.ocr.reviewNeeded = false;
    found.ocr.reviewReasons = [];
  }

  await writeStore(store);
  return found;
}

export const resolveTransactionReview = updateTransaction;

function resolveOptional<T>(incoming: T | null | undefined, existing: T | undefined): T | undefined {
  if (incoming === null) return undefined;
  if (incoming === undefined) return existing;
  return incoming;
}

export async function upsertSubscriptionState(input: {
  accountId: string;
  status: SubscriptionStatus;
  subscriptionId?: string | null;
  customerId?: string | null;
  priceId?: string | null;
  checkoutSessionId?: string | null;
  checkoutSessionUrl?: string | null;
  currentPeriodEnd?: string | null;
  latestInvoiceId?: string | null;
  latestInvoiceStatus?: SubscriptionState["latestInvoiceStatus"] | null;
  latestInvoiceAmountDue?: number | null;
  latestInvoiceAmountPaid?: number | null;
  latestInvoiceCurrency?: string | null;
  latestInvoiceDueDate?: string | null;
  latestInvoiceHostedUrl?: string | null;
  latestPaymentError?: string | null;
  invoiceTimelineEvent?: SubscriptionState["invoiceTimeline"][number] | null;
  delinquentSince?: string | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<SubscriptionState> {
  const store = await readStore();
  const existing = store.billing.subscriptionsByAccount[input.accountId];

  const existingTimeline = existing?.invoiceTimeline ?? [];
  const mergedTimeline = input.invoiceTimelineEvent
    ? [input.invoiceTimelineEvent, ...existingTimeline.filter((event) => event.eventId !== input.invoiceTimelineEvent?.eventId)]
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, 25)
    : existingTimeline;

  const updated: SubscriptionState = {
    accountId: input.accountId,
    provider: "stripe",
    status: input.status,
    subscriptionId: resolveOptional(input.subscriptionId, existing?.subscriptionId),
    customerId: resolveOptional(input.customerId, existing?.customerId),
    priceId: resolveOptional(input.priceId, existing?.priceId),
    checkoutSessionId: resolveOptional(input.checkoutSessionId, existing?.checkoutSessionId),
    checkoutSessionUrl: resolveOptional(input.checkoutSessionUrl, existing?.checkoutSessionUrl),
    currentPeriodEnd: resolveOptional(input.currentPeriodEnd, existing?.currentPeriodEnd),
    latestInvoiceId: resolveOptional(input.latestInvoiceId, existing?.latestInvoiceId),
    latestInvoiceStatus: resolveOptional(input.latestInvoiceStatus, existing?.latestInvoiceStatus),
    latestInvoiceAmountDue: resolveOptional(input.latestInvoiceAmountDue, existing?.latestInvoiceAmountDue),
    latestInvoiceAmountPaid: resolveOptional(input.latestInvoiceAmountPaid, existing?.latestInvoiceAmountPaid),
    latestInvoiceCurrency: resolveOptional(input.latestInvoiceCurrency, existing?.latestInvoiceCurrency),
    latestInvoiceDueDate: resolveOptional(input.latestInvoiceDueDate, existing?.latestInvoiceDueDate),
    latestInvoiceHostedUrl: resolveOptional(input.latestInvoiceHostedUrl, existing?.latestInvoiceHostedUrl),
    latestPaymentError: resolveOptional(input.latestPaymentError, existing?.latestPaymentError),
    invoiceTimeline: mergedTimeline,
    delinquentSince: resolveOptional(input.delinquentSince, existing?.delinquentSince),
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? existing?.cancelAtPeriodEnd ?? false,
    updatedAt: new Date().toISOString(),
  };

  store.billing.subscriptionsByAccount[input.accountId] = updated;
  if (updated.customerId) {
    store.billing.accountByStripeCustomerId[updated.customerId] = input.accountId;
  }
  store.billing.updatedAt = updated.updatedAt;
  await writeStore(store);

  return updated;
}

export async function resolveAccountIdByStripeCustomerId(customerId: string): Promise<string | null> {
  const store = await readStore();
  return store.billing.accountByStripeCustomerId[customerId] ?? null;
}


export async function recordBillingReconciliationReport(report: BillingReconciliationReport): Promise<void> {
  const store = await readStore();

  const recentReports = [report, ...(store.billing.reconciliation.recentReports ?? [])].slice(0, 20);
  store.billing.reconciliation = {
    ...store.billing.reconciliation,
    lastRunAt: report.completedAt,
    lastSuccessAt: report.status === "success" ? report.completedAt : store.billing.reconciliation.lastSuccessAt,
    lastReport: report,
    recentReports,
  };
  store.billing.updatedAt = report.completedAt;

  await writeStore(store);
}

export async function resolveAccountIdBySubscriptionId(subscriptionId: string): Promise<string | null> {
  if (!subscriptionId) return null;

  const store = await readStore();
  for (const [accountId, subscription] of Object.entries(store.billing.subscriptionsByAccount)) {
    if (subscription.subscriptionId === subscriptionId) {
      return accountId;
    }
  }

  return null;
}

export async function markWebhookEventProcessed(eventId: string): Promise<boolean> {
  if (!eventId) return false;

  const store = await readStore();
  if (store.billing.processedWebhookEventIds.includes(eventId)) {
    return false;
  }

  store.billing.processedWebhookEventIds.push(eventId);
  if (store.billing.processedWebhookEventIds.length > 2000) {
    store.billing.processedWebhookEventIds = store.billing.processedWebhookEventIds.slice(-2000);
  }
  store.billing.updatedAt = new Date().toISOString();
  await writeStore(store);
  return true;
}

export async function hasProcessedWebhookEvent(eventId: string): Promise<boolean> {
  if (!eventId) return false;
  const store = await readStore();
  return store.billing.processedWebhookEventIds.includes(eventId);
}
