import type { OcrProvider } from "./env";

export type TransactionType = "revenue" | "expense";

export type TransactionOcrData = {
  provider: OcrProvider;
  extractionConfidence: number;
  reviewNeeded: boolean;
  reviewReasons: string[];
  extractedFields?: {
    amount?: number;
    date?: string;
    type?: TransactionType;
    category?: string;
    description?: string;
  };
};

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  date: string; // ISO date
  category: string;
  description: string;
  source: "manual" | "import";
  receiptName?: string;
  ocr?: TransactionOcrData;
  createdAt: string;
};

export type Deadline = {
  id: string;
  title: string;
  dueDate: string; // ISO date
  recurring: "none" | "monthly" | "quarterly";
  status: "open" | "done";
  reminderOffsetsDays?: number[]; // notify when daysLeft matches an offset (defaults to [14,7,1,0])
  notes?: string;
  createdAt: string;
};

export type ReceivableStatus = "pending" | "partial" | "paid" | "overdue";

export type RecommendationConfidence = "low" | "medium" | "high";

export type ReceivableRecommendationCalibration = {
  windowDays: 30;
  evaluatedAt: string;
  remindersEvaluated: number;
  conversionErrorPerReminder: number;
  cashErrorRate: number;
  maxRecommendedConfidence: RecommendationConfidence;
  status: "stable" | "watch" | "degraded";
};

export type Receivable = {
  id: string;
  customerName: string;
  amount: number;
  amountPaid: number;
  dueDate: string; // ISO date
  status: ReceivableStatus;
  description?: string;
  notes?: string;
  promiseDate?: string; // customer-promised pay date
  nextFollowUpDate?: string; // owner snooze target
  reminderCount: number;
  lastReminderAt?: string;
  lastReminderChannel?: "email" | "sms" | "whatsapp" | "phone" | "other";
  lastActionAt?: string;
  lastActionType?: ReceivableActionType;
  createdAt: string;
  updatedAt: string;
};

export type Settings = {
  taxReserveRate: number; // 0-1
  currency: string;
  monthlyRevenueGoal?: number;
  monthlyExpenseLimit?: number;
  currentCashBalance?: number;
  cashBurnRateMultiplier?: number; // forecast sensitivity: 0.5-2.0
  receivableCollectionConfidence?: number; // forecast confidence: 0-1.5
  receivableRecommendationCalibration?: ReceivableRecommendationCalibration;
};

export type OnboardingStepKey =
  | "set_tax_rate"
  | "set_revenue_goal"
  | "set_expense_limit"
  | "add_first_transaction"
  | "add_first_deadline"
  | "upload_first_receipt"
  | "check_tax_reserve"
  | "check_expense_limit";

export type OnboardingState = {
  completedSteps: Partial<Record<OnboardingStepKey, string>>; // step -> ISO completion timestamp
  dismissed?: boolean;
};

export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export type InvoicePaymentStatus =
  | "draft"
  | "open"
  | "paid"
  | "uncollectible"
  | "void";

export type SubscriptionInvoiceEvent = {
  eventId: string;
  eventType: "invoice.payment_failed" | "invoice.paid";
  occurredAt: string;
  invoiceId?: string;
  invoiceStatus?: InvoicePaymentStatus;
  amountDue?: number;
  amountPaid?: number;
  currency?: string;
  dueDate?: string;
  hostedInvoiceUrl?: string;
  paymentError?: string;
  resultingSubscriptionStatus: SubscriptionStatus;
};

export type SubscriptionState = {
  accountId: string;
  provider: "stripe";
  status: SubscriptionStatus;
  subscriptionId?: string;
  customerId?: string;
  priceId?: string;
  checkoutSessionId?: string;
  checkoutSessionUrl?: string;
  currentPeriodEnd?: string;
  latestInvoiceId?: string;
  latestInvoiceStatus?: InvoicePaymentStatus;
  latestInvoiceAmountDue?: number;
  latestInvoiceAmountPaid?: number;
  latestInvoiceCurrency?: string;
  latestInvoiceDueDate?: string;
  latestInvoiceHostedUrl?: string;
  latestPaymentError?: string;
  invoiceTimeline: SubscriptionInvoiceEvent[];
  delinquentSince?: string;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
};

export type BillingState = {
  subscriptionsByAccount: Record<string, SubscriptionState>;
  accountByStripeCustomerId: Record<string, string>;
  processedWebhookEventIds: string[];
  reconciliation: BillingReconciliationState;
  updatedAt: string;
};

export type BillingReconciliationDrift = {
  accountId: string;
  subscriptionId?: string;
  field:
    | "subscription_id"
    | "status"
    | "current_period_end"
    | "cancel_at_period_end"
    | "price_id"
    | "customer_id"
    | "missing_remote_subscription"
    | "fetch_error";
  localValue?: string;
  remoteValue?: string;
  action: "healed" | "needs_review";
  message: string;
};

export type BillingReconciliationReport = {
  runId: string;
  mode: "live" | "dry_run";
  status: "success" | "partial" | "failed";
  startedAt: string;
  completedAt: string;
  inspectedCount: number;
  driftCount: number;
  healedCount: number;
  unresolvedCount: number;
  drifts: BillingReconciliationDrift[];
  error?: string;
};

export type BillingReconciliationState = {
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastReport?: BillingReconciliationReport;
  recentReports: BillingReconciliationReport[];
};

export type ReceivableActionType =
  | "update"
  | "mark_paid"
  | "mark_partial"
  | "snooze"
  | "set_promise_date"
  | "bulk_mark_paid"
  | "bulk_snooze"
  | "log_reminder"
  | "bulk_log_reminder";

export type ReceivableActionEvent = {
  id: string;
  receivableId: string;
  actionType: ReceivableActionType;
  createdAt: string;
  channel?: Receivable["lastReminderChannel"];
  amountCollected?: number;
};

export type Store = {
  transactions: Transaction[];
  deadlines: Deadline[];
  receivables: Receivable[];
  settings: Settings;
  onboarding: OnboardingState;
  billing: BillingState;
  reminderDispatches: Record<string, string[]>; // YYYY-MM-DD -> suppression keys sent that day
  receivableActionCounters: Record<string, number>; // action key -> total count (owner analytics)
  receivableActionEvents: ReceivableActionEvent[];
};

export type CategoryBreakdown = {
  category: string;
  amount: number;
  percentage: number;
};

export type CashProjectionPoint = {
  day: number;
  date: string;
  projectedBalance: number;
  baselineNetChange: number;
  expectedReceivableInflow: number;
};

export type CashProjectionBandPoint = {
  day: number;
  date: string;
  worstCaseBalance: number;
  baseCaseBalance: number;
  bestCaseBalance: number;
};

export type CashRunwaySummary = {
  currentBalance: number;
  assumptions: {
    burnRateMultiplier: number;
    collectionConfidence: number;
  };
  averageDailyRevenue: number;
  averageDailyExpense: number;
  averageDailyNet: number;
  runwayDays: number | null;
  daysUntilCashOut: number | null;
  lowestProjectedBalance: number;
  lowestProjectedBalanceDay: number | null;
  expectedReceivableInflow14d: number;
  projection14d: CashProjectionPoint[];
  projectionBands14d: CashProjectionBandPoint[];
  riskLevel: "low" | "medium" | "high";
  riskReasons: string[];
  suggestedActions: string[];
};

export type OwnerActionCategory = "collections" | "cost_control" | "revenue_push" | "compliance";

export type OwnerActionItem = {
  id: string;
  category: OwnerActionCategory;
  title: string;
  description: string;
  rationale: string;
  expectedCashImpact14d: number;
  confidence: "low" | "medium" | "high";
  priorityScore: number;
};

export type OwnerActionBrief = {
  generatedAt: string;
  windowDays: number;
  projectedStartingCash: number;
  riskLevel: "low" | "medium" | "high";
  topActions: OwnerActionItem[];
  totalExpectedImpact14d: number;
};

export type DashboardSummary = {
  monthRevenue: number;
  monthExpense: number;
  monthProfit: number;
  monthProfitMargin: number; // 0-1
  taxReserveSuggestion: number;
  prevMonthRevenue: number;
  prevMonthExpense: number;
  overdueDeadlines: number;
  dueSoonDeadlines: number;
  overdueReceivablesCount: number;
  overdueReceivablesAmount: number;
  riskFlags: string[];
  expenseCategories: CategoryBreakdown[];
  revenueCategories: CategoryBreakdown[];
  monthlyRevenueGoal?: number;
  monthlyRevenueProgress?: number; // 0-1
  monthlyExpenseLimit?: number;
  monthlyExpenseProgress?: number; // 0-1
};

export type OnboardingStepStatus = {
  key: OnboardingStepKey;
  label: string;
  description: string;
  completed: boolean;
  completedAt?: string;
};

export type OnboardingProgress = {
  totalSteps: number;
  completedSteps: number;
  percent: number;
  allCompleted: boolean;
  dismissed: boolean;
  steps: OnboardingStepStatus[];
};

export type RiskAlert = {
  id: string;
  type:
    | "missing_receipt"
    | "spend_spike"
    | "revenue_drop"
    | "deadline_reserve_risk"
    | "overdue_deadline";
  severity: "low" | "medium" | "high";
  message: string;
};

export type ReviewQueueSummary = {
  pendingCount: number;
  highConfidenceAutoParsedCount: number;
};
