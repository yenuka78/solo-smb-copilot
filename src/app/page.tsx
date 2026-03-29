"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AICopilotInline from "@/components/AICopilotInline";
import BottomNav, { type TabId } from "@/components/BottomNav";
import CollapsibleSection from "@/components/CollapsibleSection";
import { formatIsoDateForDisplay, getRelativeDateLabel } from "@/lib/dateDisplay";
import { formatDeadlineDate, getDeadlineStatusLabel, sortDeadlinesForDisplay } from "@/lib/deadlineStatus";
import { matchesTransactionSearch } from "@/lib/transactionSearch";
import { buildTransactionListCsv } from "@/lib/transactionsCsv";
import { OnboardingStepKey } from "@/lib/types";

type ReceivableQueueItem = {
  id: string;
  customerName: string;
  amount: number;
  amountPaid: number;
  dueDate: string;
  status: "pending" | "partial" | "paid" | "overdue";
  description?: string;
  notes?: string;
  promiseDate?: string;
  nextFollowUpDate?: string;
  reminderCount: number;
  lastReminderAt?: string;
  lastReminderChannel?: "email" | "sms" | "whatsapp" | "phone" | "other";
  lastActionAt?: string;
  lastActionType?:
    | "update"
    | "mark_paid"
    | "mark_partial"
    | "snooze"
    | "set_promise_date"
    | "bulk_mark_paid"
    | "bulk_snooze"
    | "log_reminder"
    | "bulk_log_reminder";
  amountRemaining: number;
  daysOverdue: number;
  daysSinceLastTouch: number;
  daysUntilNextFollowUp: number | null;
  followUpStale: boolean;
  followUpSnoozed: boolean;
  riskScore: number;
  priority: "low" | "medium" | "high";
  suggestedAction: string;
  recommendedReminderChannel: "email" | "sms" | "whatsapp" | "phone" | "other";
  recommendedReminderReason: string;
  recommendedReminderConfidence: "low" | "medium" | "high";
  recommendedReminderTags: string[];
};

type ReceivableAnalyticsSlice = {
  actionCounts: {
    update: number;
    mark_paid: number;
    mark_partial: number;
    snooze: number;
    set_promise_date: number;
    bulk_mark_paid: number;
    bulk_snooze: number;
    log_reminder: number;
    bulk_log_reminder: number;
  };
  reminderChannelCounts: {
    email: number;
    sms: number;
    whatsapp: number;
    phone: number;
    other: number;
  };
  reminderChannelPerformance: {
    email: {
      remindersSent: number;
      convertedCount: number;
      convertedAmount: number;
      conversionRate: number;
    };
    sms: {
      remindersSent: number;
      convertedCount: number;
      convertedAmount: number;
      conversionRate: number;
    };
    whatsapp: {
      remindersSent: number;
      convertedCount: number;
      convertedAmount: number;
      conversionRate: number;
    };
    phone: {
      remindersSent: number;
      convertedCount: number;
      convertedAmount: number;
      conversionRate: number;
    };
    other: {
      remindersSent: number;
      convertedCount: number;
      convertedAmount: number;
      conversionRate: number;
    };
  };
  recommendationBacktest: {
    remindersEvaluated: number;
    remindersWithRecommendation: number;
    matchedRecommendationCount: number;
    recommendationMatchRate: number;
    predictedConversions: number;
    realizedConversions: number;
    predictedCollectedAmount: number;
    realizedCollectedAmount: number;
    byChannel: {
      email: {
        remindersEvaluated: number;
        matchedRecommendationCount: number;
        predictedConversions: number;
        realizedConversions: number;
        predictedCollectedAmount: number;
        realizedCollectedAmount: number;
      };
      sms: {
        remindersEvaluated: number;
        matchedRecommendationCount: number;
        predictedConversions: number;
        realizedConversions: number;
        predictedCollectedAmount: number;
        realizedCollectedAmount: number;
      };
      whatsapp: {
        remindersEvaluated: number;
        matchedRecommendationCount: number;
        predictedConversions: number;
        realizedConversions: number;
        predictedCollectedAmount: number;
        realizedCollectedAmount: number;
      };
      phone: {
        remindersEvaluated: number;
        matchedRecommendationCount: number;
        predictedConversions: number;
        realizedConversions: number;
        predictedCollectedAmount: number;
        realizedCollectedAmount: number;
      };
      other: {
        remindersEvaluated: number;
        matchedRecommendationCount: number;
        predictedConversions: number;
        realizedConversions: number;
        predictedCollectedAmount: number;
        realizedCollectedAmount: number;
      };
    };
    bySegment: Array<{
      segmentKey: string;
      amountBucket: "micro" | "small" | "mid" | "large";
      overdueBucket: "upcoming" | "due_now" | "overdue_1_14" | "overdue_15_plus";
      remindersEvaluated: number;
      predictedConversions: number;
      realizedConversions: number;
      predictedCollectedAmount: number;
      realizedCollectedAmount: number;
    }>;
  };
  totalLoggedActions: number;
  remindersSent: number;
  paymentsCollectedCount: number;
  paymentsCollectedAmount: number;
  reminderToPaidCount: number;
  reminderToPaidAmount: number;
  reminderToPaidRate: number;
};

type ReceivablesPayload = {
  items: ReceivableQueueItem[];
  totals: {
    openCount: number;
    openAmount: number;
    overdueCount: number;
    overdueAmount: number;
    highRiskCount: number;
    highRiskAmount: number;
    staleCount: number;
    snoozedCount: number;
  };
  analytics: {
    lifetime: ReceivableAnalyticsSlice;
    windows: {
      "7d": ReceivableAnalyticsSlice;
      "30d": ReceivableAnalyticsSlice;
    };
  };
  recommendationCalibration: {
    windowDays: 30;
    evaluatedAt: string;
    remindersEvaluated: number;
    conversionErrorPerReminder: number;
    cashErrorRate: number;
    maxRecommendedConfidence: "low" | "medium" | "high";
    status: "stable" | "watch" | "degraded";
  } | null;
};

type CashRunwayPayload = {
  summary: {
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
    projection14d: Array<{
      day: number;
      date: string;
      projectedBalance: number;
      baselineNetChange: number;
      expectedReceivableInflow: number;
    }>;
    projectionBands14d: Array<{
      day: number;
      date: string;
      worstCaseBalance: number;
      baseCaseBalance: number;
      bestCaseBalance: number;
    }>;
    riskLevel: "low" | "medium" | "high";
    riskReasons: string[];
    suggestedActions: string[];
  };
};

type OwnerActionsPayload = {
  brief: {
    generatedAt: string;
    windowDays: number;
    projectedStartingCash: number;
    riskLevel: "low" | "medium" | "high";
    totalExpectedImpact14d: number;
    topActions: Array<{
      id: string;
      category: "collections" | "cost_control" | "revenue_push" | "compliance";
      title: string;
      description: string;
      rationale: string;
      expectedCashImpact14d: number;
      confidence: "low" | "medium" | "high";
      priorityScore: number;
    }>;
  };
};

type BillingStatusPayload = {
  accountId: string;
  billing: {
    enabled: boolean;
    checkoutReady: boolean;
    portalReady: boolean;
    webhooksReady: boolean;
    reconciliationReady: boolean;
    runnerTokenConfigured: boolean;
    configured: boolean;
    publishableKeyPresent: boolean;
  };
  reconciliation: {
    lastRunAt?: string;
    lastSuccessAt?: string;
    lastReport?: {
      runId: string;
      mode: "live" | "dry_run";
      status: "success" | "partial" | "failed";
      startedAt: string;
      completedAt: string;
      inspectedCount: number;
      driftCount: number;
      healedCount: number;
      unresolvedCount: number;
      error?: string;
      drifts: Array<{
        accountId: string;
        subscriptionId?: string;
        field: string;
        localValue?: string;
        remoteValue?: string;
        action: "healed" | "needs_review";
        message: string;
      }>;
    };
  };
  subscription: {
    accountId: string;
    status:
      | "incomplete"
      | "incomplete_expired"
      | "trialing"
      | "active"
      | "past_due"
      | "canceled"
      | "unpaid"
      | "paused";
    currentPeriodEnd?: string;
    latestInvoiceId?: string;
    latestInvoiceStatus?: "draft" | "open" | "paid" | "uncollectible" | "void";
    latestInvoiceAmountDue?: number;
    latestInvoiceAmountPaid?: number;
    latestInvoiceCurrency?: string;
    latestInvoiceDueDate?: string;
    latestInvoiceHostedUrl?: string;
    latestPaymentError?: string;
    delinquentSince?: string;
    invoiceTimeline: Array<{
      eventId: string;
      eventType: "invoice.payment_failed" | "invoice.paid";
      occurredAt: string;
      invoiceId?: string;
      invoiceStatus?: "draft" | "open" | "paid" | "uncollectible" | "void";
      amountDue?: number;
      amountPaid?: number;
      currency?: string;
      dueDate?: string;
      hostedInvoiceUrl?: string;
      paymentError?: string;
      resultingSubscriptionStatus:
        | "incomplete"
        | "incomplete_expired"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "paused";
    }>;
    cancelAtPeriodEnd: boolean;
    customerId?: string;
    checkoutSessionUrl?: string;
    checkoutSessionId?: string;
  } | null;
};

type DashboardPayload = {
  summary: {
    monthRevenue: number;
    monthExpense: number;
    monthProfit: number;
    monthProfitMargin: number;
    taxReserveSuggestion: number;
    prevMonthRevenue: number;
    prevMonthExpense: number;
    overdueDeadlines: number;
    dueSoonDeadlines: number;
    overdueReceivablesCount: number;
    overdueReceivablesAmount: number;
    riskFlags: string[];
    expenseCategories: {
      category: string;
      amount: number;
      percentage: number;
    }[];
    revenueCategories: {
      category: string;
      amount: number;
      percentage: number;
    }[];
    monthlyRevenueGoal?: number;
    monthlyRevenueProgress?: number;
    monthlyExpenseLimit?: number;
    monthlyExpenseProgress?: number;
  };
  alerts: {
    id: string;
    type: string;
    severity: "low" | "medium" | "high";
    message: string;
  }[];
  settings: {
    taxReserveRate: number;
    currency: string;
    currentCashBalance?: number;
    cashBurnRateMultiplier?: number;
    receivableCollectionConfidence?: number;
  };
  recentTransactions: {
    id: string;
    type: "revenue" | "expense";
    amount: number;
    date: string;
    category: string;
    description: string;
    receiptName?: string;
    ocr?: {
      extractionConfidence: number;
      reviewNeeded: boolean;
      reviewReasons: string[];
    };
  }[];
  deadlines: {
    id: string;
    title: string;
    dueDate: string;
    recurring: "none" | "monthly" | "quarterly";
    status: "open" | "done";
  }[];
  reviewQueue: {
    pendingCount: number;
    highConfidenceAutoParsedCount: number;
  };
  onboarding: {
    totalSteps: number;
    completedSteps: number;
    percent: number;
    allCompleted: boolean;
    dismissed: boolean;
    steps: {
      key: OnboardingStepKey;
      label: string;
      description: string;
      completed: boolean;
      completedAt?: string;
    }[];
  };
  categories: string[];
};

const defaultAnalyticsSlice: ReceivableAnalyticsSlice = {
  actionCounts: {
    update: 0,
    mark_paid: 0,
    mark_partial: 0,
    snooze: 0,
    set_promise_date: 0,
    bulk_mark_paid: 0,
    bulk_snooze: 0,
    log_reminder: 0,
    bulk_log_reminder: 0,
  },
  reminderChannelCounts: {
    email: 0,
    sms: 0,
    whatsapp: 0,
    phone: 0,
    other: 0,
  },
  reminderChannelPerformance: {
    email: { remindersSent: 0, convertedCount: 0, convertedAmount: 0, conversionRate: 0 },
    sms: { remindersSent: 0, convertedCount: 0, convertedAmount: 0, conversionRate: 0 },
    whatsapp: { remindersSent: 0, convertedCount: 0, convertedAmount: 0, conversionRate: 0 },
    phone: { remindersSent: 0, convertedCount: 0, convertedAmount: 0, conversionRate: 0 },
    other: { remindersSent: 0, convertedCount: 0, convertedAmount: 0, conversionRate: 0 },
  },
  recommendationBacktest: {
    remindersEvaluated: 0,
    remindersWithRecommendation: 0,
    matchedRecommendationCount: 0,
    recommendationMatchRate: 0,
    predictedConversions: 0,
    realizedConversions: 0,
    predictedCollectedAmount: 0,
    realizedCollectedAmount: 0,
    byChannel: {
      email: {
        remindersEvaluated: 0,
        matchedRecommendationCount: 0,
        predictedConversions: 0,
        realizedConversions: 0,
        predictedCollectedAmount: 0,
        realizedCollectedAmount: 0,
      },
      sms: {
        remindersEvaluated: 0,
        matchedRecommendationCount: 0,
        predictedConversions: 0,
        realizedConversions: 0,
        predictedCollectedAmount: 0,
        realizedCollectedAmount: 0,
      },
      whatsapp: {
        remindersEvaluated: 0,
        matchedRecommendationCount: 0,
        predictedConversions: 0,
        realizedConversions: 0,
        predictedCollectedAmount: 0,
        realizedCollectedAmount: 0,
      },
      phone: {
        remindersEvaluated: 0,
        matchedRecommendationCount: 0,
        predictedConversions: 0,
        realizedConversions: 0,
        predictedCollectedAmount: 0,
        realizedCollectedAmount: 0,
      },
      other: {
        remindersEvaluated: 0,
        matchedRecommendationCount: 0,
        predictedConversions: 0,
        realizedConversions: 0,
        predictedCollectedAmount: 0,
        realizedCollectedAmount: 0,
      },
    },
    bySegment: [],
  },
  totalLoggedActions: 0,
  remindersSent: 0,
  paymentsCollectedCount: 0,
  paymentsCollectedAmount: 0,
  reminderToPaidCount: 0,
  reminderToPaidAmount: 0,
  reminderToPaidRate: 0,
};

const defaultReceivablesPayload: ReceivablesPayload = {
  items: [],
  totals: {
    openCount: 0,
    openAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    highRiskCount: 0,
    highRiskAmount: 0,
    staleCount: 0,
    snoozedCount: 0,
  },
  analytics: {
    lifetime: { ...defaultAnalyticsSlice },
    windows: {
      "7d": { ...defaultAnalyticsSlice },
      "30d": { ...defaultAnalyticsSlice },
    },
  },
  recommendationCalibration: null,
};

const defaultCashRunwayPayload: CashRunwayPayload = {
  summary: {
    currentBalance: 0,
    assumptions: {
      burnRateMultiplier: 1,
      collectionConfidence: 1,
    },
    averageDailyRevenue: 0,
    averageDailyExpense: 0,
    averageDailyNet: 0,
    runwayDays: null,
    daysUntilCashOut: null,
    lowestProjectedBalance: 0,
    lowestProjectedBalanceDay: null,
    expectedReceivableInflow14d: 0,
    projection14d: [],
    projectionBands14d: [],
    riskLevel: "low",
    riskReasons: [],
    suggestedActions: [],
  },
};

const defaultOwnerActionsPayload: OwnerActionsPayload = {
  brief: {
    generatedAt: "",
    windowDays: 14,
    projectedStartingCash: 0,
    riskLevel: "low",
    totalExpectedImpact14d: 0,
    topActions: [],
  },
};

const defaultBillingStatusPayload: BillingStatusPayload = {
  accountId: "solo-owner",
  billing: {
    enabled: false,
    checkoutReady: false,
    portalReady: false,
    webhooksReady: false,
    reconciliationReady: false,
    runnerTokenConfigured: false,
    configured: false,
    publishableKeyPresent: false,
  },
  reconciliation: {
    lastRunAt: undefined,
    lastSuccessAt: undefined,
    lastReport: undefined,
  },
  subscription: null,
};

const defaultPayload: DashboardPayload = {
  summary: {
    monthRevenue: 0,
    monthExpense: 0,
    monthProfit: 0,
    monthProfitMargin: 0,
    taxReserveSuggestion: 0,
    prevMonthRevenue: 0,
    prevMonthExpense: 0,
    overdueDeadlines: 0,
    dueSoonDeadlines: 0,
    overdueReceivablesCount: 0,
    overdueReceivablesAmount: 0,
    riskFlags: [],
    expenseCategories: [],
    revenueCategories: [],
    monthlyRevenueGoal: 0,
    monthlyRevenueProgress: 0,
    monthlyExpenseLimit: 0,
    monthlyExpenseProgress: 0,
  },
  alerts: [],
  settings: {
    taxReserveRate: 0.25,
    currency: "USD",
    currentCashBalance: 0,
    cashBurnRateMultiplier: 1,
    receivableCollectionConfidence: 1,
  },
  recentTransactions: [],
  deadlines: [],
  reviewQueue: {
    pendingCount: 0,
    highConfidenceAutoParsedCount: 0,
  },
  onboarding: {
    totalSteps: 7,
    completedSteps: 0,
    percent: 0,
    allCompleted: false,
    dismissed: false,
    steps: [
      {
        key: "set_tax_rate",
        label: "Set your tax rate",
        description: "Save your preferred tax reserve rate in settings.",
        completed: false,
      },
      {
        key: "set_revenue_goal",
        label: "Set a revenue goal",
        description: "Define a monthly revenue target to track progress.",
        completed: false,
      },
      {
        key: "set_expense_limit",
        label: "Set an expense limit",
        description: "Define a monthly spending limit to keep overhead low.",
        completed: false,
      },
      {
        key: "add_first_transaction",
        label: "Add your first transaction",
        description: "Log one revenue or expense item.",
        completed: false,
      },
      {
        key: "add_first_deadline",
        label: "Add your first deadline",
        description: "Track a tax or compliance due date.",
        completed: false,
      },
      {
        key: "upload_first_receipt",
        label: "Upload your first receipt",
        description: "Upload a receipt/invoice to create a transaction.",
        completed: false,
      },
      {
        key: "check_tax_reserve",
        label: "Check your tax reserve",
        description: "Review the suggested tax reserve on the dashboard.",
        completed: false,
      },
    ],
  },
  categories: [],
};

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function reminderChannelLabel(channel: ReceivableQueueItem["recommendedReminderChannel"]): string {
  if (channel === "sms") return "SMS";
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "phone") return "Phone";
  if (channel === "other") return "Other";
  return "Email";
}

function recommendationConfidenceTone(confidence: ReceivableQueueItem["recommendedReminderConfidence"]): string {
  if (confidence === "high") return "bg-emerald-100 text-emerald-700";
  if (confidence === "medium") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function recommendationCalibrationTone(status: "stable" | "watch" | "degraded"): string {
  if (status === "stable") return "bg-emerald-100 text-emerald-700";
  if (status === "watch") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function amountBucketLabel(bucket: "micro" | "small" | "mid" | "large"): string {
  if (bucket === "large") return "$10k+";
  if (bucket === "mid") return "$3k-$9.9k";
  if (bucket === "small") return "$800-$2.9k";
  return "<$800";
}

function overdueBucketLabel(bucket: "upcoming" | "due_now" | "overdue_1_14" | "overdue_15_plus"): string {
  if (bucket === "due_now") return "Due today";
  if (bucket === "overdue_1_14") return "Overdue 1-14d";
  if (bucket === "overdue_15_plus") return "Overdue 15+d";
  return "Upcoming";
}

export default function Home() {
  const [data, setData] = useState<DashboardPayload>(defaultPayload);
  const [receivablesData, setReceivablesData] = useState<ReceivablesPayload>(defaultReceivablesPayload);
  const [cashRunwayData, setCashRunwayData] = useState<CashRunwayPayload>(defaultCashRunwayPayload);
  const [ownerActionsData, setOwnerActionsData] = useState<OwnerActionsPayload>(defaultOwnerActionsPayload);
  const [billingStatusData, setBillingStatusData] = useState<BillingStatusPayload>(defaultBillingStatusPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const [txForm, setTxForm] = useState({
    type: "revenue",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    category: "",
    description: "",
    receiptName: "",
  });

  const [deadlineForm, setDeadlineForm] = useState({
    title: "",
    dueDate: new Date().toISOString().slice(0, 10),
    recurring: "none",
  });

  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    type: "expense",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    category: "",
    description: "",
  });

  const [taxRatePercent, setTaxRatePercent] = useState(25);
  const [revenueGoal, setRevenueGoal] = useState("");
  const [expenseLimit, setExpenseLimit] = useState("");
  const [currentCashBalance, setCurrentCashBalance] = useState("");
  const [cashBurnRateMultiplier, setCashBurnRateMultiplier] = useState("1");
  const [receivableCollectionConfidence, setReceivableCollectionConfidence] = useState("1");
  const [exportMonth, setExportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [lastExportMessage, setLastExportMessage] = useState("");
  const [exportedFiles, setExportedFiles] = useState<string[]>([]);
  const [lastUploadMessage, setLastUploadMessage] = useState("");

  const [savingTaxRate, setSavingTaxRate] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [startingPortal, setStartingPortal] = useState(false);
  const [runningBillingReconciliation, setRunningBillingReconciliation] = useState(false);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [exportingMonth, setExportingMonth] = useState(false);
  const [runningReminderPreview, setRunningReminderPreview] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [togglingDeadlineId, setTogglingDeadlineId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingDeadlineId, setDeletingDeadlineId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftingReceivableId, setDraftingReceivableId] = useState<string | null>(null);
  const [selectedReminderDraft, setSelectedReminderDraft] = useState<{ customerName: string; draft: string } | null>(null);
  const [receivableForm, setReceivableForm] = useState({
    customerName: "",
    amount: "",
    amountPaid: "",
    dueDate: new Date().toISOString().slice(0, 10),
    description: "",
  });
  const [editingReceivableId, setEditingReceivableId] = useState<string | null>(null);
  const [savingReceivable, setSavingReceivable] = useState(false);
  const [receivableActionId, setReceivableActionId] = useState<string | null>(null);
  const [selectedReceivableIds, setSelectedReceivableIds] = useState<string[]>([]);
  const [bulkReceivableAction, setBulkReceivableAction] = useState<"mark_paid" | "snooze" | "draft" | null>(null);
  const [bulkReminderChannel, setBulkReminderChannel] = useState<"email" | "sms" | "whatsapp" | "phone" | "other">("email");
  const [bulkReminderDrafts, setBulkReminderDrafts] = useState<Array<{ id: string; customerName: string; draft: string }> | null>(null);
  const [analyticsWindowDays, setAnalyticsWindowDays] = useState<7 | 30>(7);
  const [runningRecommendationCalibration, setRunningRecommendationCalibration] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState<"all" | "revenue" | "expense" | "review">("all");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [addType, setAddType] = useState<"transaction" | "receipt" | "deadline">("transaction");
  const [arShowAll, setArShowAll] = useState(false);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const currency = useMemo(() => data.settings.currency || "USD", [data.settings.currency]);
  const billingInvoiceCurrency = billingStatusData.subscription?.latestInvoiceCurrency || currency;
  const billingIsDelinquent =
    Boolean(billingStatusData.subscription?.delinquentSince) ||
    billingStatusData.subscription?.status === "past_due" ||
    billingStatusData.subscription?.status === "unpaid";

  const selectedWindowAnalytics = useMemo(
    () => (analyticsWindowDays === 7 ? receivablesData.analytics.windows["7d"] : receivablesData.analytics.windows["30d"]),
    [analyticsWindowDays, receivablesData.analytics.windows],
  );

  const reminderChannelRows = useMemo(
    () =>
      ([
        ["email", "Email"],
        ["sms", "SMS"],
        ["whatsapp", "WhatsApp"],
        ["phone", "Phone"],
        ["other", "Other"],
      ] as const).map(([key, label]) => ({
        key,
        label,
        ...selectedWindowAnalytics.reminderChannelPerformance[key],
      })),
    [selectedWindowAnalytics.reminderChannelPerformance],
  );

  const recommendationBacktestRows = useMemo(
    () =>
      ([
        ["email", "Email"],
        ["sms", "SMS"],
        ["whatsapp", "WhatsApp"],
        ["phone", "Phone"],
        ["other", "Other"],
      ] as const)
        .map(([key, label]) => ({
          key,
          label,
          ...selectedWindowAnalytics.recommendationBacktest.byChannel[key],
        }))
        .filter((row) => row.remindersEvaluated > 0),
    [selectedWindowAnalytics.recommendationBacktest.byChannel],
  );

  const hasCashRunwayData = useMemo(
    () =>
      cashRunwayData.summary.currentBalance !== 0 ||
      cashRunwayData.summary.averageDailyNet !== 0 ||
      cashRunwayData.summary.expectedReceivableInflow14d !== 0 ||
      receivablesData.totals.openCount > 0,
    [cashRunwayData.summary.currentBalance, cashRunwayData.summary.averageDailyNet, cashRunwayData.summary.expectedReceivableInflow14d, receivablesData.totals.openCount],
  );

  const hasQueueAnalyticsData = useMemo(
    () =>
      selectedWindowAnalytics.totalLoggedActions > 0 ||
      selectedWindowAnalytics.remindersSent > 0 ||
      selectedWindowAnalytics.paymentsCollectedCount > 0 ||
      selectedWindowAnalytics.reminderToPaidCount > 0,
    [
      selectedWindowAnalytics.totalLoggedActions,
      selectedWindowAnalytics.remindersSent,
      selectedWindowAnalytics.paymentsCollectedCount,
      selectedWindowAnalytics.reminderToPaidCount,
    ],
  );

  const filteredTransactions = useMemo(() => {
    let list = data.recentTransactions;

    if (transactionFilter === "review") {
      list = list.filter((tx) => Boolean(tx.ocr?.reviewNeeded));
    } else if (transactionFilter !== "all") {
      list = list.filter((tx) => tx.type === transactionFilter);
    }

    if (transactionSearch.trim()) {
      list = list.filter((tx) => matchesTransactionSearch(tx, transactionSearch));
    }

    return list;
  }, [data.recentTransactions, transactionFilter, transactionSearch]);

  const filteredSummary = useMemo(() => {
    return filteredTransactions.reduce(
      (acc, tx) => {
        if (tx.type === "revenue") acc.revenue += tx.amount;
        else acc.expense += tx.amount;
        return acc;
      },
      { revenue: 0, expense: 0 }
    );
  }, [filteredTransactions]);

  const filteredNet = filteredSummary.revenue - filteredSummary.expense;

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [dashboardResponse, receivablesResponse, cashRunwayResponse, ownerActionsResponse, billingStatusResponse] = await Promise.all([
        fetch("/api/dashboard", { cache: "no-store" }),
        fetch("/api/receivables", { cache: "no-store" }),
        fetch("/api/cash-runway", { cache: "no-store" }),
        fetch("/api/owner-actions", { cache: "no-store" }),
        fetch("/api/billing/status", { cache: "no-store" }),
      ]);

      if (!dashboardResponse.ok) throw new Error("Could not load dashboard");
      if (!receivablesResponse.ok) throw new Error("Could not load receivables queue");
      if (!cashRunwayResponse.ok) throw new Error("Could not load cash runway");
      if (!ownerActionsResponse.ok) throw new Error("Could not load owner actions");
      if (!billingStatusResponse.ok) throw new Error("Could not load billing status");

      const payload = (await dashboardResponse.json()) as DashboardPayload;
      const receivablesPayload = (await receivablesResponse.json()) as ReceivablesPayload;
      const cashRunwayPayload = (await cashRunwayResponse.json()) as CashRunwayPayload;
      const ownerActionsPayload = (await ownerActionsResponse.json()) as OwnerActionsPayload;
      const billingPayload = (await billingStatusResponse.json()) as BillingStatusPayload;

      setData(payload);
      setReceivablesData(receivablesPayload);
      setCashRunwayData(cashRunwayPayload);
      setOwnerActionsData(ownerActionsPayload);
      setBillingStatusData(billingPayload);
      setOnboardingDismissed(payload.onboarding.dismissed);
      setTaxRatePercent(Math.round(payload.settings.taxReserveRate * 100));
      setRevenueGoal(payload.summary.monthlyRevenueGoal ? String(payload.summary.monthlyRevenueGoal) : "");
      setExpenseLimit(payload.summary.monthlyExpenseLimit ? String(payload.summary.monthlyExpenseLimit) : "");
      setCurrentCashBalance(payload.settings.currentCashBalance !== undefined ? String(payload.settings.currentCashBalance) : "");
      setCashBurnRateMultiplier(
        payload.settings.cashBurnRateMultiplier !== undefined
          ? String(payload.settings.cashBurnRateMultiplier)
          : String(cashRunwayPayload.summary.assumptions.burnRateMultiplier),
      );
      setReceivableCollectionConfidence(
        payload.settings.receivableCollectionConfidence !== undefined
          ? String(payload.settings.receivableCollectionConfidence)
          : String(cashRunwayPayload.summary.assumptions.collectionConfidence),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    setSelectedReceivableIds((prev) => prev.filter((id) => receivablesData.items.some((item) => item.id === id)));
  }, [receivablesData.items]);

  useEffect(() => {
    if (!data.onboarding.allCompleted && !data.onboarding.steps.find(s => s.key === "check_tax_reserve")?.completed) {
      const handleScroll = () => {
        const metrics = document.getElementById("dashboard-metrics");
        if (metrics) {
          const rect = metrics.getBoundingClientRect();
          if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
            fetch("/api/dashboard", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ step: "check_tax_reserve" }),
            }).then(() => refresh());
            window.removeEventListener("scroll", handleScroll);
          }
        }
      };
      window.addEventListener("scroll", handleScroll);
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, [data.onboarding.allCompleted, data.onboarding.steps]);

  async function submitTransaction(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage("");
    setSavingTransaction(true);

    try {
      const method = editingId ? "PATCH" : "POST";
      const body = {
        ...txForm,
        amount: Number(txForm.amount),
        source: "manual",
        ...(editingId ? { id: editingId } : {}),
      };

      const response = await fetch("/api/transactions", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Failed to save transaction");
        return;
      }

      setTxForm({
        type: "revenue",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        category: "",
        description: "",
        receiptName: "",
      });
      setEditingId(null);
      setStatusMessage(editingId ? "Transaction updated." : "Transaction added. Your dashboard totals are now updated.");
      await refresh();
    } finally {
      setSavingTransaction(false);
    }
  }

  function startEditing(tx: DashboardPayload["recentTransactions"][0]) {
    setEditingId(tx.id);
    setTxForm({
      type: tx.type,
      amount: String(tx.amount),
      date: tx.date,
      category: tx.category,
      description: tx.description,
      receiptName: tx.receiptName || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingId(null);
    setTxForm({
      type: "revenue",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      category: "",
      description: "",
      receiptName: "",
    });
  }

  function duplicateTransaction(tx: DashboardPayload["recentTransactions"][0]) {
    setEditingId(null);
    setTxForm({
      type: tx.type,
      amount: String(tx.amount),
      date: new Date().toISOString().slice(0, 10),
      category: tx.category,
      description: tx.description,
      receiptName: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    setStatusMessage("Transaction details copied to form.");
    setTimeout(() => setStatusMessage(""), 3000);
  }

  async function submitDeadline(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage("");
    setSavingDeadline(true);

    try {
      const response = await fetch("/api/deadlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deadlineForm),
      });

      if (!response.ok) {
        setError("Failed to add deadline");
        return;
      }

      setDeadlineForm({
        title: "",
        dueDate: new Date().toISOString().slice(0, 10),
        recurring: "none",
      });
      setStatusMessage("Deadline saved. You can mark it done anytime from the list.");
      await refresh();
    } finally {
      setSavingDeadline(false);
    }
  }

  async function submitUpload(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMessage("");

    if (!uploadForm.file) {
      setError("Please choose a receipt/invoice file first.");
      return;
    }

    setUploadingDocument(true);
    try {
      const formData = new FormData();
      formData.set("file", uploadForm.file);
      formData.set("type", uploadForm.type);
      formData.set("amount", uploadForm.amount);
      formData.set("date", uploadForm.date);
      formData.set("category", uploadForm.category);
      formData.set("description", uploadForm.description);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Upload failed");
        return;
      }

      const payload = (await response.json()) as {
        transaction: { ocr?: { extractionConfidence: number; reviewNeeded: boolean } };
      };

      const confidencePercent = Math.round((payload.transaction.ocr?.extractionConfidence ?? 0) * 100);
      const review = payload.transaction.ocr?.reviewNeeded;
      setLastUploadMessage(
        review
          ? `Uploaded. OCR confidence ${confidencePercent}%. Marked for manual review.`
          : `Uploaded. OCR confidence ${confidencePercent}%. No manual review needed.`,
      );
      setStatusMessage("Document uploaded and transaction logged.");

      setUploadForm({
        file: null,
        type: "expense",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        category: "",
        description: "",
      });
      await refresh();
    } finally {
      setUploadingDocument(false);
    }
  }

  async function toggleDeadline(id: string) {
    setError(null);
    setTogglingDeadlineId(id);
    try {
      const response = await fetch("/api/deadlines", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        setError("Failed to update deadline status");
        return;
      }

      await refresh();
    } finally {
      setTogglingDeadlineId(null);
    }
  }

  async function saveTaxRate() {
    setError(null);
    setStatusMessage("");
    setSavingTaxRate(true);

    try {
      const value = Math.max(0, Math.min(100, taxRatePercent)) / 100;
      const goalValue = revenueGoal === "" ? null : Number(revenueGoal);
      const limitValue = expenseLimit === "" ? null : Number(expenseLimit);
      const cashBalanceValue = currentCashBalance === "" ? null : Number(currentCashBalance);
      const burnRateMultiplierValue = cashBurnRateMultiplier === "" ? null : Number(cashBurnRateMultiplier);
      const collectionConfidenceValue =
        receivableCollectionConfidence === "" ? null : Number(receivableCollectionConfidence);

      const response = await fetch("/api/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxReserveRate: value,
          monthlyRevenueGoal: goalValue,
          monthlyExpenseLimit: limitValue,
          currentCashBalance: cashBalanceValue,
          cashBurnRateMultiplier: burnRateMultiplierValue,
          receivableCollectionConfidence: collectionConfidenceValue,
        }),
      });

      if (!response.ok) {
        setError("Failed to update settings");
        return;
      }

      setStatusMessage("Settings saved.");
      await refresh();
    } finally {
      setSavingTaxRate(false);
    }
  }

  async function beginStripeCheckout() {
    setError(null);
    setStartingCheckout(true);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        checkout?: { url?: string };
        alreadySubscribed?: boolean;
      } | null;

      if (!response.ok) {
        setError(payload?.error || "Failed to start Stripe checkout");
        return;
      }

      if (payload?.alreadySubscribed) {
        setStatusMessage("Your premium subscription is already active.");
        await refresh();
        return;
      }

      if (payload?.checkout?.url) {
        window.location.href = payload.checkout.url;
        return;
      }

      setError("Checkout session was created without a redirect URL.");
    } finally {
      setStartingCheckout(false);
    }
  }

  async function runBillingReconciliation(dryRun = false) {
    setError(null);
    setRunningBillingReconciliation(true);

    try {
      const response = await fetch("/api/billing/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        report?: {
          driftCount: number;
          healedCount: number;
          unresolvedCount: number;
          mode: "live" | "dry_run";
          status: "success" | "partial" | "failed";
        };
      } | null;

      if (!response.ok || !payload?.report) {
        setError(payload?.error || "Failed to run billing reconciliation");
        return;
      }

      const modeLabel = payload.report.mode === "dry_run" ? "Dry run" : "Live run";
      setStatusMessage(
        `${modeLabel}: ${payload.report.driftCount} drift(s), ${payload.report.healedCount} healed, ${payload.report.unresolvedCount} needs review.`,
      );
      await refresh();
    } finally {
      setRunningBillingReconciliation(false);
    }
  }

  async function openStripeBillingPortal() {
    setError(null);
    setStartingPortal(true);

    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        portal?: { url?: string };
      } | null;

      if (!response.ok) {
        setError(payload?.error || "Failed to open Stripe billing portal");
        return;
      }

      if (payload?.portal?.url) {
        window.location.href = payload.portal.url;
        return;
      }

      setError("Billing portal session was created without a redirect URL.");
    } finally {
      setStartingPortal(false);
    }
  }

  async function approveReview(id: string) {
    setError(null);
    setReviewingId(id);
    try {
      const response = await fetch("/api/review/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        setError("Failed to mark review as done");
        return;
      }

      setStatusMessage("Review item marked as done.");
      await refresh();
    } finally {
      setReviewingId(null);
    }
  }

  async function runReminderPreview() {
    setError(null);
    setRunningReminderPreview(true);
    try {
      const response = await fetch("/api/reminders/run", { method: "POST" });
      if (!response.ok) {
        setError("Failed to run reminder preview");
        return;
      }
      const payload = (await response.json()) as { sent: number };
      setLastExportMessage(`Reminder preview generated for ${payload.sent} item(s).`);
    } finally {
      setRunningReminderPreview(false);
    }
  }

  async function generateReceivableReminder(receivable: ReceivableQueueItem) {
    setError(null);
    setBulkReminderDrafts(null);
    setDraftingReceivableId(receivable.id);

    const channel = receivable.recommendedReminderChannel;

    try {
      const response = await fetch("/api/receivables/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: receivable.id, channel }),
      });

      if (!response.ok) {
        setError("Failed to generate reminder draft");
        return;
      }

      const payload = (await response.json()) as { draft: string };
      setSelectedReminderDraft({ customerName: receivable.customerName, draft: payload.draft });
      setStatusMessage(
        `Reminder drafted via ${reminderChannelLabel(channel)} and follow-up logged for ${receivable.customerName}.`,
      );
      await refresh();
    } finally {
      setDraftingReceivableId(null);
    }
  }

  async function copyReminderDraft() {
    if (!selectedReminderDraft) return;

    try {
      await navigator.clipboard.writeText(selectedReminderDraft.draft);
      setStatusMessage(`Reminder draft copied for ${selectedReminderDraft.customerName}.`);
    } catch {
      setError("Could not copy reminder draft. Please copy manually.");
    }
  }

  async function submitReceivable(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSavingReceivable(true);

    try {
      const response = await fetch("/api/receivables", {
        method: editingReceivableId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingReceivableId ? { id: editingReceivableId, action: "update" } : {}),
          customerName: receivableForm.customerName,
          amount: Number(receivableForm.amount),
          amountPaid: receivableForm.amountPaid.trim() ? Number(receivableForm.amountPaid) : 0,
          dueDate: receivableForm.dueDate,
          description: receivableForm.description,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Failed to save receivable");
        return;
      }

      setReceivableForm({
        customerName: "",
        amount: "",
        amountPaid: "",
        dueDate: new Date().toISOString().slice(0, 10),
        description: "",
      });
      setEditingReceivableId(null);
      setStatusMessage(editingReceivableId ? "Receivable updated." : "Receivable added to AR queue.");
      await refresh();
    } finally {
      setSavingReceivable(false);
    }
  }

  function startEditingReceivable(receivable: ReceivableQueueItem) {
    setEditingReceivableId(receivable.id);
    setReceivableForm({
      customerName: receivable.customerName,
      amount: String(receivable.amount),
      amountPaid: receivable.amountPaid > 0 ? String(receivable.amountPaid) : "",
      dueDate: receivable.dueDate,
      description: receivable.description ?? "",
    });
    setStatusMessage("Editing receivable. Save to apply changes.");
  }

  function cancelReceivableEdit() {
    setEditingReceivableId(null);
    setReceivableForm({
      customerName: "",
      amount: "",
      amountPaid: "",
      dueDate: new Date().toISOString().slice(0, 10),
      description: "",
    });
  }

  async function markReceivablePaid(id: string) {
    setError(null);
    setReceivableActionId(id);

    try {
      const response = await fetch("/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "mark_paid" }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Failed to mark receivable paid");
        return;
      }

      setStatusMessage("Receivable marked as paid.");
      await refresh();
    } finally {
      setReceivableActionId(null);
    }
  }

  async function markReceivablePartial(receivable: ReceivableQueueItem) {
    const input = prompt("How much was paid?", "0");
    if (input === null) return;

    const paymentAmount = Number(input);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }

    setError(null);
    setReceivableActionId(receivable.id);

    try {
      const response = await fetch("/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: receivable.id, action: "mark_partial", paymentAmount }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Failed to record partial payment");
        return;
      }

      setStatusMessage(`Partial payment logged for ${receivable.customerName}.`);
      await refresh();
    } finally {
      setReceivableActionId(null);
    }
  }

  async function snoozeReceivable(receivable: ReceivableQueueItem) {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    const input = prompt("Snooze follow-up until (YYYY-MM-DD)", defaultDate.toISOString().slice(0, 10));
    if (input === null) return;

    setError(null);
    setReceivableActionId(receivable.id);

    try {
      const response = await fetch("/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: receivable.id, action: "snooze", nextFollowUpDate: input }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Failed to snooze follow-up");
        return;
      }

      setStatusMessage(`Follow-up snoozed for ${receivable.customerName}.`);
      await refresh();
    } finally {
      setReceivableActionId(null);
    }
  }

  async function setReceivablePromiseDate(receivable: ReceivableQueueItem) {
    const defaultDate = receivable.promiseDate ?? receivable.dueDate;
    const input = prompt("Promise-to-pay date (YYYY-MM-DD). Leave blank to clear.", defaultDate);
    if (input === null) return;

    setError(null);
    setReceivableActionId(receivable.id);

    try {
      const response = await fetch("/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: receivable.id,
          action: "set_promise_date",
          promiseDate: input.trim() ? input.trim() : null,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Failed to save promise date");
        return;
      }

      setStatusMessage(`Promise date updated for ${receivable.customerName}.`);
      await refresh();
    } finally {
      setReceivableActionId(null);
    }
  }

  function toggleReceivableSelection(receivableId: string) {
    setSelectedReceivableIds((prev) =>
      prev.includes(receivableId) ? prev.filter((id) => id !== receivableId) : [...prev, receivableId],
    );
  }

  function toggleSelectAllVisibleReceivables() {
    setSelectedReceivableIds((prev) => {
      if (allVisibleReceivablesSelected) {
        return prev.filter((id) => !visibleReceivableIds.includes(id));
      }

      return [...new Set([...prev, ...visibleReceivableIds])];
    });
  }

  async function bulkMarkReceivablesPaid() {
    if (selectedReceivableIds.length === 0) {
      setError("Select at least one receivable first.");
      return;
    }

    if (!confirm(`Mark ${selectedReceivableIds.length} selected receivable(s) as paid?`)) return;

    setError(null);
    setBulkReceivableAction("mark_paid");

    try {
      const response = await fetch("/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_mark_paid",
          ids: selectedReceivableIds,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Failed to mark selected receivables as paid");
        return;
      }

      setSelectedReceivableIds([]);
      setStatusMessage(`Marked ${selectedReceivableIds.length} receivable(s) as paid.`);
      await refresh();
    } finally {
      setBulkReceivableAction(null);
    }
  }

  async function bulkSnoozeReceivables() {
    if (selectedReceivableIds.length === 0) {
      setError("Select at least one receivable first.");
      return;
    }

    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    const input = prompt("Snooze selected follow-ups until (YYYY-MM-DD)", defaultDate.toISOString().slice(0, 10));
    if (input === null) return;

    setError(null);
    setBulkReceivableAction("snooze");

    try {
      const response = await fetch("/api/receivables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_snooze",
          ids: selectedReceivableIds,
          nextFollowUpDate: input.trim(),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Failed to snooze selected receivables");
        return;
      }

      setStatusMessage(`Snoozed ${selectedReceivableIds.length} receivable(s).`);
      await refresh();
    } finally {
      setBulkReceivableAction(null);
    }
  }

  async function bulkDraftReceivableReminders() {
    if (selectedReceivableIds.length === 0) {
      setError("Select at least one receivable first.");
      return;
    }

    setError(null);
    setSelectedReminderDraft(null);
    setBulkReceivableAction("draft");

    try {
      const response = await fetch("/api/receivables/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedReceivableIds,
          channel: bulkReminderChannel,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Failed to generate reminder drafts");
        return;
      }

      const payload = (await response.json()) as {
        updatedCount: number;
        drafts: Array<{ id: string; customerName: string; draft: string }>;
      };

      setBulkReminderDrafts(payload.drafts);
      setStatusMessage(`Generated ${payload.updatedCount} reminder draft(s) via ${bulkReminderChannel}.`);
      await refresh();
    } finally {
      setBulkReceivableAction(null);
    }
  }

  async function runRecommendationCalibration() {
    setError(null);
    setRunningRecommendationCalibration(true);

    try {
      const response = await fetch("/api/receivables/recommendation-calibration", {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Failed to auto-tune confidence floors");
        return;
      }

      const payload = (await response.json()) as {
        recommendationCalibration: {
          maxRecommendedConfidence: "low" | "medium" | "high";
          status: "stable" | "watch" | "degraded";
        };
      };

      setStatusMessage(
        `Confidence auto-tune updated: cap ${payload.recommendationCalibration.maxRecommendedConfidence} (${payload.recommendationCalibration.status}).`,
      );
      await refresh();
    } finally {
      setRunningRecommendationCalibration(false);
    }
  }

  async function copyAllBulkReminderDrafts() {
    if (!bulkReminderDrafts || bulkReminderDrafts.length === 0) return;

    const merged = bulkReminderDrafts
      .map((entry) => `=== ${entry.customerName} ===\n${entry.draft}`)
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(merged);
      setStatusMessage(`Copied ${bulkReminderDrafts.length} bulk reminder draft(s).`);
    } catch {
      setError("Could not copy bulk drafts. Please copy manually.");
    }
  }

  async function createMonthlyExport() {
    setError(null);
    setExportingMonth(true);
    try {
      const response = await fetch("/api/export/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: exportMonth }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "Failed to generate export");
        return;
      }

      const payload = (await response.json()) as {
        export: {
          csvFile: string;
          summaryFile: string;
          markdownFile?: string;
          files?: string[];
          transactionCount: number;
          month: string;
        };
      };

      const files = payload.export.files ?? [
        payload.export.csvFile,
        payload.export.summaryFile,
        payload.export.markdownFile,
      ].filter((f): f is string => Boolean(f));

      setExportedFiles(files);
      setLastExportMessage(
        `Export created for ${payload.export.month}: ${payload.export.transactionCount} transactions.`
      );
    } finally {
      setExportingMonth(false);
    }
  }

  async function deleteTransaction(id: string) {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    setError(null);
    setDeletingId(id);
    try {
      const response = await fetch("/api/transactions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        setError("Failed to delete transaction");
        return;
      }

      if (editingId === id) {
        cancelEditing();
      }

      setStatusMessage("Transaction deleted.");
      await refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteDeadline(id: string) {
    if (!confirm("Are you sure you want to delete this deadline?")) return;

    setError(null);
    setDeletingDeadlineId(id);
    try {
      const response = await fetch("/api/deadlines", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        setError("Failed to delete deadline");
        return;
      }

      setStatusMessage("Deadline deleted.");
      await refresh();
    } finally {
      setDeletingDeadlineId(null);
    }
  }

  async function dismissOnboardingAction() {
    setError(null);
    try {
      const response = await fetch("/api/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissOnboarding: true }),
      });

      if (!response.ok) {
        setError("Failed to dismiss onboarding");
        return;
      }

      setOnboardingDismissed(true);
      await refresh();
    } catch {
      setError("Failed to dismiss onboarding");
    }
  }

  function downloadFilteredAsCsv() {
    if (filteredTransactions.length === 0) return;

    const csvContent = buildTransactionListCsv(filteredTransactions);
    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `transactions_export_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const revenueTrend = useMemo(() => {
    if (data.summary.prevMonthRevenue === 0) return undefined;
    const diff = (data.summary.monthRevenue - data.summary.prevMonthRevenue) / data.summary.prevMonthRevenue;
    const sign = diff >= 0 ? "+" : "";
    return `${sign}${Math.round(diff * 100)}% vs last month`;
  }, [data.summary.monthRevenue, data.summary.prevMonthRevenue]);

  const expenseTrend = useMemo(() => {
    if (data.summary.prevMonthExpense === 0) return undefined;
    const diff = (data.summary.monthExpense - data.summary.prevMonthExpense) / data.summary.prevMonthExpense;
    const sign = diff >= 0 ? "+" : "";
    return `${sign}${Math.round(diff * 100)}% vs last month`;
  }, [data.summary.monthExpense, data.summary.prevMonthExpense]);

  const sortedDeadlines = useMemo(() => {
    return sortDeadlinesForDisplay(data.deadlines, new Date());
  }, [data.deadlines]);

  const recurringLabelMap: Record<DashboardPayload["deadlines"][number]["recurring"], string> = {
    none: "one-time",
    monthly: "monthly",
    quarterly: "quarterly",
  };

  const visibleReceivableIds = receivablesData.items.slice(0, arShowAll ? receivablesData.items.length : 5).map((item) => item.id);
  const allVisibleReceivablesSelected =
    visibleReceivableIds.length > 0 && visibleReceivableIds.every((id) => selectedReceivableIds.includes(id));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
        <header className="rounded-2xl bg-indigo-600 px-5 py-4 shadow-sm text-white">
          {/* Mobile: compact title + current tab */}
          <div className="flex items-center justify-between md:hidden">
            <div>
              <h1 className="text-lg font-bold leading-tight">SMB Copilot</h1>
              <p className="text-xs text-indigo-200 mt-0.5">
                {activeTab === "home" && "Dashboard"}
                {activeTab === "add" && "Log transaction"}
                {activeTab === "copilot" && "AI Finance Copilot"}
                {activeTab === "ar" && "AR Follow-up Queue"}
                {activeTab === "more" && "Transactions & Settings"}
              </p>
            </div>
            {loading && <span className="text-xs text-indigo-200 animate-pulse">Refreshing…</span>}
          </div>
          {/* Desktop: full title + tab nav */}
          <div className="hidden md:flex md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-bold">Solo SMB Daily Finance Copilot</h1>
              <p className="text-xs text-indigo-200 mt-0.5">Log transactions · track tax reserve · stay ahead of deadlines</p>
            </div>
            <div className="flex items-center gap-1">
              {(["home","add","copilot","ar","more"] as const).map((tab) => {
                const labels: Record<string, string> = { home: "Dashboard", add: "Add", copilot: "Copilot", ar: "AR", more: "More" };
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === tab ? "bg-white text-indigo-700" : "text-indigo-100 hover:bg-indigo-500"}`}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
              {loading && <span className="ml-3 text-xs text-indigo-200 animate-pulse">Refreshing…</span>}
            </div>
          </div>
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {statusMessage && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{statusMessage}</div>}

        {/* ── HOME TAB ─────────────────────────────────── */}
        <div className={`flex flex-col gap-6 ${activeTab !== "home" ? "hidden" : ""}`}>

        {!onboardingDismissed && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">First-run checklist</h2>
                <p className="text-sm text-slate-600">
                  {data.onboarding.completedSteps}/{data.onboarding.totalSteps} steps complete ({data.onboarding.percent}%)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {data.onboarding.allCompleted && (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">All done</span>
                )}
                <button
                  onClick={dismissOnboardingAction}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  title="Hide checklist"
                >
                  Dismiss
                </button>
              </div>
            </div>

            <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${data.onboarding.percent}%` }} />
            </div>

            <ul className="mt-4 grid gap-2 md:grid-cols-2">
              {data.onboarding.steps.map((step) => (
                <li
                  key={step.key}
                  className={`flex flex-col justify-between rounded-lg border p-3 text-sm ${
                    step.completed ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div>
                    <p className="font-medium">{step.completed ? "✅" : "⬜"} {step.label}</p>
                    <p className="mt-1 text-xs text-slate-600">{step.description}</p>
                  </div>
                  {!step.completed && (
                    <button
                      onClick={() => {
                        const mapping: Record<string, string> = {
                          set_tax_rate: "settings-section",
                          set_revenue_goal: "settings-section",
                          set_expense_limit: "settings-section",
                          add_first_transaction: "transaction-form-section",
                          add_first_deadline: "deadline-form-section",
                          upload_first_receipt: "upload-section",
                          check_tax_reserve: "dashboard-metrics",
                        };
                        scrollToSection(mapping[step.key]);
                      }}
                      className="mt-3 w-fit rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                    >
                      Go to section →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {onboardingDismissed && (
          <div className="flex justify-end">
            <button
              onClick={async () => {
                setError(null);
                try {
                  const response = await fetch("/api/dashboard", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dismissOnboarding: false }),
                  });

                  if (!response.ok) {
                    setError("Failed to restore onboarding");
                    return;
                  }

                  setOnboardingDismissed(false);
                  await refresh();
                } catch {
                  setError("Failed to restore onboarding");
                }
              }}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
            >
              Show checklist
            </button>
          </div>
        )}

        <section id="dashboard-metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Revenue (this month)"
            value={money(data.summary.monthRevenue, currency)}
            subValue={revenueTrend}
            progress={data.summary.monthlyRevenueProgress}
            tone="good"
          />
          <MetricCard
            label="Outstanding AR"
            value={money(receivablesData.totals.openAmount, currency)}
            subValue={`${receivablesData.totals.openCount} open invoice${receivablesData.totals.openCount === 1 ? "" : "s"}`}
            tone={receivablesData.totals.overdueCount > 0 ? "warn" : "default"}
          />
          <MetricCard
            label="Overdue"
            value={`${receivablesData.totals.overdueCount} • ${money(receivablesData.totals.overdueAmount, currency)}`}
            subValue={receivablesData.totals.overdueCount > 0 ? "Follow up today" : "None overdue"}
            tone={receivablesData.totals.overdueCount > 0 ? "danger" : "good"}
          />
          <MetricCard
            label="Cash Runway"
            value={cashRunwayData.summary.runwayDays === null ? "Stable" : `${Math.max(0, Math.round(cashRunwayData.summary.runwayDays))} days`}
            subValue={cashRunwayData.summary.daysUntilCashOut !== null ? `Cash-out in ${cashRunwayData.summary.daysUntilCashOut}d` : undefined}
            tone={cashRunwayData.summary.riskLevel === "high" ? "danger" : cashRunwayData.summary.riskLevel === "medium" ? "warn" : "good"}
          />
        </section>
        <CollapsibleSection title="More metrics" defaultOpen={false}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 pt-2">
            <MetricCard
              label="This Month Expense"
              value={money(data.summary.monthExpense, currency)}
              subValue={expenseTrend}
              progress={data.summary.monthlyExpenseProgress}
              progressLabel="Limit usage"
              tone="warn"
            />
            <MetricCard
              label="This Month Profit"
              value={money(data.summary.monthProfit, currency)}
              subValue={data.summary.monthRevenue > 0 ? `${(data.summary.monthProfitMargin * 100).toFixed(1)}% margin` : undefined}
              tone={data.summary.monthProfit > 0 ? "good" : data.summary.monthProfit < 0 ? "danger" : "default"}
            />
            <MetricCard label="Tax Reserve Suggestion" value={money(data.summary.taxReserveSuggestion, currency)} tone="default" />
            <MetricCard label="Overdue Deadlines" value={String(data.summary.overdueDeadlines)} tone={data.summary.overdueDeadlines > 0 ? "danger" : "default"} />
            <MetricCard label="Due in 7 Days" value={String(data.summary.dueSoonDeadlines)} tone="default" />
            <MetricCard
              label="14-Day Lowest Cash"
              value={money(cashRunwayData.summary.lowestProjectedBalance, currency)}
              subValue={cashRunwayData.summary.lowestProjectedBalanceDay ? `Day ${cashRunwayData.summary.lowestProjectedBalanceDay}` : "No projected dip"}
              tone={cashRunwayData.summary.lowestProjectedBalance < 0 ? "danger" : "default"}
            />
            <MetricCard
              label="Top 5 Actions Impact (14d)"
              value={money(ownerActionsData.brief.totalExpectedImpact14d, currency)}
              subValue={`${ownerActionsData.brief.topActions.length} ranked action${ownerActionsData.brief.topActions.length === 1 ? "" : "s"}`}
              tone={ownerActionsData.brief.totalExpectedImpact14d > 0 ? "good" : "default"}
            />
          </div>
        </CollapsibleSection>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Cash runway + 14-day risk projection</h2>
              <p className="mt-1 text-xs text-slate-500">
                Uses last 30 days of net cash trend plus expected receivable collections.
              </p>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
              cashRunwayData.summary.riskLevel === "high"
                ? "bg-rose-100 text-rose-700"
                : cashRunwayData.summary.riskLevel === "medium"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
            }`}>
              {cashRunwayData.summary.riskLevel.toUpperCase()} RISK
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Current cash</p>
              <p className="mt-1 font-semibold">{money(cashRunwayData.summary.currentBalance, currency)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Avg daily net</p>
              <p className={`mt-1 font-semibold ${cashRunwayData.summary.averageDailyNet < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                {money(cashRunwayData.summary.averageDailyNet, currency)}
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">14d receivable inflow</p>
              <p className="mt-1 font-semibold">{money(cashRunwayData.summary.expectedReceivableInflow14d, currency)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Projected cash-out</p>
              <p className="mt-1 font-semibold">
                {cashRunwayData.summary.daysUntilCashOut === null ? "No cash-out in 14d" : `${cashRunwayData.summary.daysUntilCashOut} day(s)`}
              </p>
            </div>
          </div>

          <CollapsibleSection title="14-day projection table & risk details" defaultOpen={false}>
            {cashRunwayData.summary.projection14d.length > 0 && (
              hasCashRunwayData ? (
                <div className="mt-2 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-left text-slate-500">
                      <tr>
                        <th className="py-2">Day</th>
                        <th className="py-2">Date</th>
                        <th className="py-2">Baseline net</th>
                        <th className="py-2">Expected inflow</th>
                        <th className="py-2">Worst</th>
                        <th className="py-2">Base</th>
                        <th className="py-2">Best</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashRunwayData.summary.projection14d.map((point, index) => {
                        const band = cashRunwayData.summary.projectionBands14d[index];

                        return (
                          <tr key={point.day} className="border-t border-slate-100">
                            <td className="py-2">{point.day}</td>
                            <td className="py-2">{formatIsoDateForDisplay(point.date)}</td>
                            <td className={`py-2 ${point.baselineNetChange < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                              {money(point.baselineNetChange, currency)}
                            </td>
                            <td className="py-2 text-indigo-700">{money(point.expectedReceivableInflow, currency)}</td>
                            <td className={`py-2 ${band && band.worstCaseBalance < 0 ? "text-rose-700" : "text-slate-700"}`}>
                              {money(band?.worstCaseBalance ?? point.projectedBalance, currency)}
                            </td>
                            <td className={`py-2 font-medium ${point.projectedBalance < 0 ? "text-rose-700" : "text-slate-900"}`}>
                              {money(band?.baseCaseBalance ?? point.projectedBalance, currency)}
                            </td>
                            <td className={`py-2 ${band && band.bestCaseBalance < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                              {money(band?.bestCaseBalance ?? point.projectedBalance, currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Add current cash, transactions, or receivables to generate a meaningful 14-day runway projection.
                </div>
              )
            )}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk drivers</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Assumptions: burn x{cashRunwayData.summary.assumptions.burnRateMultiplier.toFixed(2)} · collection confidence {(cashRunwayData.summary.assumptions.collectionConfidence * 100).toFixed(0)}%</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                  {cashRunwayData.summary.riskReasons.length === 0 ? (
                    <li>No active cash runway risk drivers detected.</li>
                  ) : (
                    cashRunwayData.summary.riskReasons.map((reason) => <li key={reason}>{reason}</li>)
                  )}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested owner actions</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                  {cashRunwayData.summary.suggestedActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CollapsibleSection>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Weekly Top 5 owner actions</h2>
              <p className="mt-1 text-xs text-slate-500">
                Ranked by expected 14-day cash impact.
              </p>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
              ownerActionsData.brief.riskLevel === "high"
                ? "bg-rose-100 text-rose-700"
                : ownerActionsData.brief.riskLevel === "medium"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
            }`}>
              {ownerActionsData.brief.riskLevel.toUpperCase()} CASH RISK
            </div>
          </div>

          {ownerActionsData.brief.topActions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No owner actions available yet. Add transactions and receivables to generate weekly priorities.</p>
          ) : (
            <>
              {ownerActionsData.brief.topActions.slice(0, 1).map((action, index) => (
                <article key={action.id} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">#{index + 1} • {action.category.replaceAll("_", " ")}</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">{action.title}</h3>
                  <p className="mt-2 text-xs text-slate-600">{action.description}</p>
                  <p className="mt-3 text-xs text-slate-500">{action.rationale}</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                      {money(action.expectedCashImpact14d, currency)}
                    </span>
                    <span className="text-slate-500">{action.confidence} confidence</span>
                  </div>
                </article>
              ))}
              {ownerActionsData.brief.topActions.length > 1 && (
                <CollapsibleSection title={`${ownerActionsData.brief.topActions.length - 1} more actions`} defaultOpen={false} badge={ownerActionsData.brief.topActions.length - 1}>
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] pt-2">
                    {ownerActionsData.brief.topActions.slice(1).map((action, index) => (
                      <article key={action.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">#{index + 2} • {action.category.replaceAll("_", " ")}</p>
                        <h3 className="mt-1 text-sm font-semibold text-slate-900">{action.title}</h3>
                        <p className="mt-2 text-xs text-slate-600">{action.description}</p>
                        <p className="mt-3 text-xs text-slate-500">{action.rationale}</p>
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                            {money(action.expectedCashImpact14d, currency)}
                          </span>
                          <span className="text-slate-500">{action.confidence} confidence</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </CollapsibleSection>
              )}
            </>
          )}
        </section>

        {data.summary.revenueCategories.length > 0 && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-lg font-semibold">This month revenue breakdown</h2>
            <p className="mt-1 text-xs text-slate-500">See which streams are driving your growth.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.summary.revenueCategories.map((cat) => (
                <div key={cat.category} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-slate-600" title={cat.category}>
                      {cat.category}
                    </p>
                    <p className="text-xs font-bold text-slate-900">{(cat.percentage * 100).toFixed(0)}%</p>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{money(cat.amount, currency)}</p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500"
                      style={{ width: `${(cat.percentage * 100).toFixed(0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.summary.expenseCategories.length > 0 && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-lg font-semibold">This month expense breakdown</h2>
            <p className="mt-1 text-xs text-slate-500">See which categories are consuming your budget.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.summary.expenseCategories.map((cat) => (
                <div key={cat.category} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-slate-600" title={cat.category}>
                      {cat.category}
                    </p>
                    <p className="text-xs font-bold text-slate-900">{(cat.percentage * 100).toFixed(0)}%</p>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{money(cat.amount, currency)}</p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500"
                      style={{ width: `${(cat.percentage * 100).toFixed(0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        </div>

        {/* ── COPILOT TAB ──────────────────────────────── */}
        <div className={activeTab !== "copilot" ? "hidden md:hidden" : ""}>
          <AICopilotInline />
        </div>

        {/* ── MORE TAB — settings/billing/export ───────── */}
        <div className={`flex flex-col gap-6 ${activeTab !== "more" ? "hidden" : ""}`}>
        <section className="grid gap-6">
          <div id="settings-section" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 lg:col-span-2">
            <h2 className="text-lg font-semibold">Settings & assistant tools</h2>
            <p className="mt-1 text-xs text-slate-500">Use these controls to set safe defaults and automate monthly handoff work.</p>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Billing plan status</h3>
                {billingStatusData.subscription?.status ? (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    billingStatusData.subscription.status === "active" || billingStatusData.subscription.status === "trialing"
                      ? "bg-emerald-100 text-emerald-700"
                      : billingStatusData.subscription.status === "past_due" || billingStatusData.subscription.status === "unpaid"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"
                  }`}>
                    {billingStatusData.subscription.status}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">none</span>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {billingStatusData.billing.enabled
                  ? billingStatusData.billing.checkoutReady
                    ? billingStatusData.subscription && ["active", "trialing"].includes(billingStatusData.subscription.status)
                      ? "Your subscription is active. Use Stripe Billing Portal to manage payment method, invoices, and plan changes."
                      : "Stripe is enabled. Start checkout to unlock premium automation features (OCR upload, reminders, exports)."
                    : "Stripe is enabled, but checkout env vars are incomplete (secret key + price id required)."
                  : "Stripe billing is disabled. Premium features run in local bypass mode."}
              </p>
              {billingStatusData.subscription?.currentPeriodEnd && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Current period ends: {formatIsoDateForDisplay(billingStatusData.subscription.currentPeriodEnd.slice(0, 10))}
                </p>
              )}
              {billingStatusData.subscription?.latestInvoiceStatus && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Latest invoice: {billingStatusData.subscription.latestInvoiceStatus}
                  {billingStatusData.subscription.latestInvoiceDueDate
                    ? ` • due ${formatIsoDateForDisplay(billingStatusData.subscription.latestInvoiceDueDate.slice(0, 10))}`
                    : ""}
                </p>
              )}
              {billingIsDelinquent && billingStatusData.subscription && (
                <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                  <p className="font-semibold">Payment issue detected — action needed now.</p>
                  <p className="mt-1">
                    Amount due: {money(billingStatusData.subscription.latestInvoiceAmountDue ?? 0, billingInvoiceCurrency)}
                    {billingStatusData.subscription.delinquentSince
                      ? ` • delinquent since ${formatIsoDateForDisplay(billingStatusData.subscription.delinquentSince.slice(0, 10))}`
                      : ""}
                  </p>
                  {billingStatusData.subscription.latestPaymentError && (
                    <p className="mt-1 text-[11px]">{billingStatusData.subscription.latestPaymentError}</p>
                  )}
                </div>
              )}
              {billingStatusData.subscription?.invoiceTimeline?.length ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
                  <p className="font-semibold text-slate-700">Recent invoice/payment timeline</p>
                  <ul className="mt-1 space-y-1">
                    {billingStatusData.subscription.invoiceTimeline.slice(0, 5).map((event) => {
                      const eventCurrency = event.currency || billingInvoiceCurrency;
                      const amountLabel = event.eventType === "invoice.paid"
                        ? money(event.amountPaid ?? event.amountDue ?? 0, eventCurrency)
                        : money(event.amountDue ?? 0, eventCurrency);

                      return (
                        <li key={event.eventId} className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className={event.eventType === "invoice.payment_failed" ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>
                              {event.eventType === "invoice.payment_failed" ? "Payment failed" : "Invoice paid"}
                            </span>
                            <span>{formatIsoDateForDisplay(event.occurredAt.slice(0, 10))}</span>
                          </div>
                          <p className="mt-0.5">
                            {amountLabel}
                            {event.invoiceStatus ? ` • ${event.invoiceStatus}` : ""}
                            {event.invoiceId ? ` • ${event.invoiceId}` : ""}
                          </p>
                          {event.paymentError && <p className="mt-0.5 text-rose-700">{event.paymentError}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={beginStripeCheckout}
                  disabled={startingCheckout || !billingStatusData.billing.checkoutReady}
                  className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-violet-300"
                >
                  {startingCheckout ? "Starting checkout…" : "Start Stripe checkout"}
                </button>
                <button
                  onClick={openStripeBillingPortal}
                  disabled={
                    startingPortal ||
                    !billingStatusData.billing.portalReady ||
                    !billingStatusData.subscription?.customerId
                  }
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {startingPortal ? "Opening portal…" : "Manage plan in Stripe"}
                </button>
                {billingStatusData.subscription?.latestInvoiceHostedUrl && (
                  <a
                    href={billingStatusData.subscription.latestInvoiceHostedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    Open latest invoice
                  </a>
                )}
                <button
                  onClick={() => runBillingReconciliation(false)}
                  disabled={runningBillingReconciliation || !billingStatusData.billing.reconciliationReady}
                  className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  {runningBillingReconciliation ? "Reconciling…" : "Run billing reconcile"}
                </button>
                <button
                  onClick={() => runBillingReconciliation(true)}
                  disabled={runningBillingReconciliation || !billingStatusData.billing.reconciliationReady}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  Dry-run reconcile
                </button>
              </div>
              {billingStatusData.reconciliation.lastReport && (
                <div className="mt-3 rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
                  <p className="font-semibold text-slate-700">
                    Reconcile {billingStatusData.reconciliation.lastReport.mode === "dry_run" ? "dry-run" : "live"} • {billingStatusData.reconciliation.lastReport.status}
                  </p>
                  <p className="mt-1">
                    Last run: {formatIsoDateForDisplay(billingStatusData.reconciliation.lastReport.completedAt.slice(0, 10))} • inspected {billingStatusData.reconciliation.lastReport.inspectedCount} • drift {billingStatusData.reconciliation.lastReport.driftCount} • healed {billingStatusData.reconciliation.lastReport.healedCount}
                  </p>
                  {billingStatusData.reconciliation.lastReport.unresolvedCount > 0 && (
                    <p className="mt-1 text-amber-700">Needs review: {billingStatusData.reconciliation.lastReport.unresolvedCount}</p>
                  )}
                  {billingStatusData.reconciliation.lastReport.error && (
                    <p className="mt-1 text-rose-700">{billingStatusData.reconciliation.lastReport.error}</p>
                  )}
                  {billingStatusData.reconciliation.lastReport.drifts.length > 0 && (
                    <ul className="mt-1 list-disc pl-4">
                      {billingStatusData.reconciliation.lastReport.drifts.slice(0, 3).map((drift) => (
                        <li key={`${drift.accountId}-${drift.field}-${drift.subscriptionId ?? "none"}`}>
                          {drift.accountId}: {drift.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <CollapsibleSection title="Business info" defaultOpen={true}>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="tax-rate">Tax reserve rate (%)</label>
                  <input
                    id="tax-rate"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    min={0}
                    max={100}
                    value={taxRatePercent}
                    onChange={(e) => setTaxRatePercent(Number(e.target.value))}
                  />
                  <p className="text-xs text-slate-500">Tip: many solo businesses keep 20–35% reserved based on local tax rules.</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="revenue-goal">Monthly revenue goal ({currency})</label>
                  <input
                    id="revenue-goal"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    min={0}
                    placeholder="e.g. 5000"
                    value={revenueGoal}
                    onChange={(e) => setRevenueGoal(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="expense-limit">Monthly expense limit ({currency})</label>
                  <input
                    id="expense-limit"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    min={0}
                    placeholder="e.g. 2000"
                    value={expenseLimit}
                    onChange={(e) => setExpenseLimit(e.target.value)}
                  />
                </div>
                <button
                  onClick={saveTaxRate}
                  disabled={savingTaxRate}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {savingTaxRate ? "Saving…" : "Save business info"}
                </button>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Financial settings" defaultOpen={false}>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="current-cash-balance">Current cash balance ({currency})</label>
                  <input
                    id="current-cash-balance"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    min={0}
                    placeholder="e.g. 3000"
                    value={currentCashBalance}
                    onChange={(e) => setCurrentCashBalance(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">Used to calculate runway and 14-day cash risk projection.</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="cash-burn-rate-multiplier">Burn sensitivity multiplier</label>
                  <input
                    id="cash-burn-rate-multiplier"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    min={0.5}
                    max={2}
                    step="0.05"
                    value={cashBurnRateMultiplier}
                    onChange={(e) => setCashBurnRateMultiplier(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">1.00 = baseline burn. Above 1.00 models higher spend, below 1.00 models tighter cost control.</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="receivable-collection-confidence">Collection confidence</label>
                  <input
                    id="receivable-collection-confidence"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    type="number"
                    min={0}
                    max={1.5}
                    step="0.05"
                    value={receivableCollectionConfidence}
                    onChange={(e) => setReceivableCollectionConfidence(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">1.00 = baseline collections. Lower values assume delayed collections; higher assumes stronger execution.</p>
                </div>
                <button
                  onClick={saveTaxRate}
                  disabled={savingTaxRate}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {savingTaxRate ? "Saving…" : "Save financial settings"}
                </button>
              </div>
            </CollapsibleSection>

            <h3 className="mt-6 text-sm font-semibold">Risk flags</h3>
            {data.summary.riskFlags.length === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Looking good. No active risk flags right now.
              </div>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                {data.summary.riskFlags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            )}

            <h3 className="mt-6 text-sm font-semibold">OCR review queue</h3>
            <p className="mt-2 text-sm text-slate-700">
              {data.reviewQueue.pendingCount} doc(s) need manual review • {data.reviewQueue.highConfidenceAutoParsedCount} auto-parsed with high confidence
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {data.recentTransactions
                .filter((tx) => tx.ocr?.reviewNeeded)
                .slice(0, 5)
                .map((tx) => (
                  <li key={`review-${tx.id}`} className="rounded border border-amber-200 bg-amber-50 p-2">
                    <p className="font-medium">{formatIsoDateForDisplay(tx.date)} • {money(tx.amount, currency)} • {tx.category}</p>
                    <p className="text-xs text-slate-600">{tx.ocr?.reviewReasons.join(", ") || "Needs review"}</p>
                    <button
                      onClick={() => approveReview(tx.id)}
                      disabled={reviewingId === tx.id}
                      className="mt-2 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300"
                    >
                      {reviewingId === tx.id ? "Saving…" : "Mark reviewed"}
                    </button>
                  </li>
                ))}
              {data.reviewQueue.pendingCount === 0 && (
                <li className="rounded border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                  No items waiting for review. New low-confidence uploads will appear here.
                </li>
              )}
            </ul>

            <h3 className="mt-6 text-sm font-semibold">Rule-based alerts</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {data.alerts.length === 0 && (
                <li className="rounded border border-dashed border-slate-200 p-3 text-xs text-slate-500">
                  No active alerts. Keep logging weekly so this section can catch anomalies early.
                </li>
              )}
              {data.alerts.map((alert) => (
                <li key={alert.id} className="rounded border border-slate-200 p-2">
                  <span className="mr-2 text-xs uppercase text-slate-500">{alert.severity}</span>
                  {alert.message}
                </li>
              ))}
            </ul>

            <h3 className="mt-6 text-sm font-semibold">Accountant export + reminders</h3>
            <div className="mt-2 space-y-2">
              <label className="block text-xs text-slate-500" htmlFor="export-month">Pick month to package</label>
              <input
                id="export-month"
                type="month"
                value={exportMonth}
                onChange={(e) => setExportMonth(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={createMonthlyExport}
                  disabled={exportingMonth}
                  className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-violet-300"
                >
                  {exportingMonth ? "Generating…" : "Generate monthly export"}
                </button>
                <button
                  onClick={runReminderPreview}
                  disabled={runningReminderPreview}
                  className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {runningReminderPreview ? "Running…" : "Run reminder preview"}
                </button>
              </div>
              {lastExportMessage && <p className="text-xs text-slate-600">{lastExportMessage}</p>}
              {exportedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {exportedFiles.map((file) => (
                    <a
                      key={file}
                      href={`/api/export/download?filename=${encodeURIComponent(file)}`}
                      className="text-xs font-medium text-violet-700 hover:underline"
                      download
                    >
                      {file.endsWith(".csv") ? "📊 CSV" : file.endsWith(".json") ? "📋 JSON" : "📄 Summary"}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

        </section>
        </div>

        {/* ── ADD TAB — log transaction / deadline / upload ── */}
        <div className={`flex flex-col gap-6 ${(activeTab !== "add" && !editingId) ? "hidden" : ""}`}>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
            {(["transaction", "receipt", "deadline"] as const).map(t => (
              <button key={t} onClick={() => setAddType(t)}
                className={`flex-1 rounded-lg py-2 text-xs font-medium capitalize transition-colors ${addType === t ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {t}
              </button>
            ))}
          </div>
          <form id="transaction-form-section" onSubmit={submitTransaction} className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 ${addType !== "transaction" && !editingId ? "hidden" : ""} ${editingId ? "ring-2 ring-emerald-500" : ""}`}>
            <h2 className="text-lg font-semibold">{editingId ? "Edit transaction" : "Log revenue / expense"}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {editingId ? "Update details for this record." : "Capture entries as you go. Short notes now save cleanup time later."}
            </p>
            <div className="mt-4 space-y-3">
              <label className="text-xs font-medium text-slate-600" htmlFor="tx-type">Type</label>
              <select
                id="tx-type"
                value={txForm.type}
                onChange={(e) => setTxForm((prev) => ({ ...prev, type: e.target.value as "revenue" | "expense" }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="revenue">Revenue</option>
                <option value="expense">Expense</option>
              </select>

              <label className="text-xs font-medium text-slate-600" htmlFor="tx-amount">Amount</label>
              <input
                id="tx-amount"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="0.00"
                type="number"
                step="0.01"
                min="0"
                required
                value={txForm.amount}
                onChange={(e) => setTxForm((prev) => ({ ...prev, amount: e.target.value }))}
              />

              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600" htmlFor="tx-date">Date</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTxForm(prev => ({ ...prev, date: new Date().toISOString().slice(0, 10) }))}
                    className="text-[10px] text-indigo-600 hover:underline"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      setTxForm(prev => ({ ...prev, date: d.toISOString().slice(0, 10) }));
                    }}
                    className="text-[10px] text-indigo-600 hover:underline"
                  >
                    Yesterday
                  </button>
                </div>
              </div>
              <input
                id="tx-date"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                type="date"
                required
                value={txForm.date}
                onChange={(e) => setTxForm((prev) => ({ ...prev, date: e.target.value }))}
              />

              <label className="text-xs font-medium text-slate-600" htmlFor="tx-category">Category</label>
              <input
                id="tx-category"
                list="category-list"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Examples: ads, software, consulting"
                value={txForm.category}
                onChange={(e) => setTxForm((prev) => ({ ...prev, category: e.target.value }))}
              />
              {data.categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="text-[10px] text-slate-400 mr-1 self-center">Quick:</span>
                  {data.categories.slice(0, 4).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setTxForm(prev => ({ ...prev, category: cat }))}
                      className="px-2 py-0.5 text-[10px] bg-slate-100 border border-slate-200 rounded-full hover:bg-slate-200 transition"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              <label className="text-xs font-medium text-slate-600" htmlFor="tx-description">Description (optional)</label>
              <input
                id="tx-description"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="What was this for?"
                value={txForm.description}
                onChange={(e) => setTxForm((prev) => ({ ...prev, description: e.target.value }))}
              />

              <label className="text-xs font-medium text-slate-600" htmlFor="tx-receipt">Receipt file name (optional)</label>
              <input
                id="tx-receipt"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="e.g. office-supplies-2026-02.pdf"
                value={txForm.receiptName}
                onChange={(e) => setTxForm((prev) => ({ ...prev, receiptName: e.target.value }))}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingTransaction}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  {savingTransaction ? (editingId ? "Updating…" : "Adding…") : (editingId ? "Update transaction" : "Add transaction")}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>

          <form id="deadline-form-section" onSubmit={submitDeadline} className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 lg:col-span-1 ${addType !== "deadline" ? "hidden" : ""}`}>
            <h2 className="text-lg font-semibold">Tax / compliance deadline</h2>
            <p className="mt-1 text-xs text-slate-500">Set it once and track it here so filings never sneak up on you.</p>
            <div className="mt-4 space-y-3">
              <label className="text-xs font-medium text-slate-600" htmlFor="deadline-title">Deadline title</label>
              <input
                id="deadline-title"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="e.g. Quarterly estimated tax payment"
                required
                value={deadlineForm.title}
                onChange={(e) => setDeadlineForm((prev) => ({ ...prev, title: e.target.value }))}
              />

              <label className="text-xs font-medium text-slate-600" htmlFor="deadline-date">Due date</label>
              <input
                id="deadline-date"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                type="date"
                required
                value={deadlineForm.dueDate}
                onChange={(e) => setDeadlineForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              />

              <label className="text-xs font-medium text-slate-600" htmlFor="deadline-recurring">Repeat</label>
              <select
                id="deadline-recurring"
                value={deadlineForm.recurring}
                onChange={(e) =>
                  setDeadlineForm((prev) => ({ ...prev, recurring: e.target.value as "none" | "monthly" | "quarterly" }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="none">One-time</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
              <button
                type="submit"
                disabled={savingDeadline}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                {savingDeadline ? "Saving…" : "Add deadline"}
              </button>
            </div>
          </form>
          <section id="upload-section" className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 ${addType !== "receipt" ? "hidden" : ""}`}>
          <h2 className="text-lg font-semibold">Scan receipt / invoice (upload)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Upload a file and optionally prefill details. If OCR confidence is low, it will be flagged for manual review.
          </p>
          <form onSubmit={submitUpload} className="mt-4 grid gap-3 md:grid-cols-6">
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 md:col-span-2"
              type="file"
              accept="image/*,.pdf"
              onChange={(e) =>
                setUploadForm((prev) => ({ ...prev, file: e.target.files?.[0] ?? null }))
              }
            />
            <select
              value={uploadForm.type}
              onChange={(e) =>
                setUploadForm((prev) => ({ ...prev, type: e.target.value as "revenue" | "expense" }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="expense">Expense</option>
              <option value="revenue">Revenue</option>
            </select>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Amount (optional)"
              type="number"
              step="0.01"
              value={uploadForm.amount}
              onChange={(e) => setUploadForm((prev) => ({ ...prev, amount: e.target.value }))}
            />
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              type="date"
              value={uploadForm.date}
              onChange={(e) => setUploadForm((prev) => ({ ...prev, date: e.target.value }))}
            />
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Category"
              list="category-list"
              value={uploadForm.category}
              onChange={(e) => setUploadForm((prev) => ({ ...prev, category: e.target.value }))}
            />
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 md:col-span-5"
              placeholder="Description"
              value={uploadForm.description}
              onChange={(e) => setUploadForm((prev) => ({ ...prev, description: e.target.value }))}
            />
            <button
              type="submit"
              disabled={uploadingDocument}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {uploadingDocument ? "Uploading…" : "Upload + log transaction"}
            </button>
          </form>
          {lastUploadMessage && <p className="mt-2 text-xs text-slate-600">{lastUploadMessage}</p>}
          </section>
        </div>

        {/* ── AR TAB ───────────────────────────────────── */}
        <section className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 ${activeTab !== "ar" ? "hidden" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">AR follow-up queue</h2>
              <p className="mt-1 text-xs text-slate-500">
                Prioritized invoices to follow up on first, with in-app queue management (add/edit/paid/partial/snooze/promise date).
              </p>
            </div>
            <div className="text-right text-xs text-slate-600">
              <p>Open: <span className="font-semibold">{receivablesData.totals.openCount}</span> ({money(receivablesData.totals.openAmount, currency)})</p>
              <p>Overdue: <span className="font-semibold text-rose-700">{receivablesData.totals.overdueCount}</span> ({money(receivablesData.totals.overdueAmount, currency)})</p>
              <p>High risk: <span className="font-semibold text-rose-700">{receivablesData.totals.highRiskCount}</span> ({money(receivablesData.totals.highRiskAmount, currency)})</p>
              <p>Stale follow-ups: <span className="font-semibold text-amber-700">{receivablesData.totals.staleCount}</span></p>
              <p>Snoozed: <span className="font-semibold text-indigo-700">{receivablesData.totals.snoozedCount}</span></p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs">
            <button
              type="button"
              onClick={toggleSelectAllVisibleReceivables}
              className="rounded bg-white px-2 py-1 font-medium text-indigo-700 hover:bg-indigo-100"
            >
              {allVisibleReceivablesSelected ? "Unselect visible" : "Select visible"}
            </button>
            <button
              type="button"
              onClick={bulkMarkReceivablesPaid}
              disabled={bulkReceivableAction !== null || selectedReceivableIds.length === 0}
              className="rounded bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {bulkReceivableAction === "mark_paid" ? "Saving…" : `Mark paid (${selectedReceivableIds.length})`}
            </button>
            <button
              type="button"
              onClick={bulkSnoozeReceivables}
              disabled={bulkReceivableAction !== null || selectedReceivableIds.length === 0}
              className="rounded bg-slate-700 px-2 py-1 font-medium text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {bulkReceivableAction === "snooze" ? "Saving…" : "Snooze selected"}
            </button>
            <select
              value={bulkReminderChannel}
              onChange={(e) => setBulkReminderChannel(e.target.value as "email" | "sms" | "whatsapp" | "phone" | "other")}
              disabled={bulkReceivableAction !== null}
              className="rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100"
              aria-label="Bulk reminder channel"
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Phone</option>
              <option value="other">Other</option>
            </select>
            <button
              type="button"
              onClick={bulkDraftReceivableReminders}
              disabled={bulkReceivableAction !== null || selectedReceivableIds.length === 0}
              className="rounded bg-indigo-600 px-2 py-1 font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {bulkReceivableAction === "draft" ? "Drafting…" : `Draft + log (${selectedReceivableIds.length})`}
            </button>
            {selectedReceivableIds.length > 0 && (
              <span className="text-slate-600">{selectedReceivableIds.length} selected</span>
            )}
          </div>


          <form onSubmit={submitReceivable} className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-6">
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="Customer"
              required
              value={receivableForm.customerName}
              onChange={(e) => setReceivableForm((prev) => ({ ...prev, customerName: e.target.value }))}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Amount"
              type="number"
              step="0.01"
              min="0"
              required
              value={receivableForm.amount}
              onChange={(e) => setReceivableForm((prev) => ({ ...prev, amount: e.target.value }))}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Paid"
              type="number"
              step="0.01"
              min="0"
              value={receivableForm.amountPaid}
              onChange={(e) => setReceivableForm((prev) => ({ ...prev, amountPaid: e.target.value }))}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="date"
              required
              value={receivableForm.dueDate}
              onChange={(e) => setReceivableForm((prev) => ({ ...prev, dueDate: e.target.value }))}
            />
            <button
              type="submit"
              disabled={savingReceivable}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {savingReceivable ? "Saving…" : editingReceivableId ? "Update receivable" : "Add receivable"}
            </button>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-5"
              placeholder="Description (optional)"
              value={receivableForm.description}
              onChange={(e) => setReceivableForm((prev) => ({ ...prev, description: e.target.value }))}
            />
            {editingReceivableId && (
              <button
                type="button"
                onClick={cancelReceivableEdit}
                className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-300"
              >
                Cancel edit
              </button>
            )}
          </form>

          {receivablesData.items.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No open receivables in the queue yet.
            </div>
          ) : (
            <div className="mt-4 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2 pr-2">
                      <input
                        type="checkbox"
                        aria-label="Select all visible receivables"
                        checked={allVisibleReceivablesSelected}
                        onChange={toggleSelectAllVisibleReceivables}
                      />
                    </th>
                    <th className="py-2">Customer</th>
                    <th className="py-2">Due</th>
                    <th className="py-2">Remaining</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {receivablesData.items.slice(0, arShowAll ? receivablesData.items.length : 5).map((item) => {
                    const dueLabel = item.daysOverdue > 0
                      ? `${item.daysOverdue} day${item.daysOverdue === 1 ? "" : "s"} overdue`
                      : item.daysOverdue === 0
                        ? "Due today"
                        : `Due in ${Math.abs(item.daysOverdue)} day${Math.abs(item.daysOverdue) === 1 ? "" : "s"}`;

                    return (
                      <tr key={item.id} className="border-t border-slate-100 align-top">
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            aria-label={`Select receivable ${item.customerName}`}
                            checked={selectedReceivableIds.includes(item.id)}
                            onChange={() => toggleReceivableSelection(item.id)}
                          />
                        </td>
                        <td className="py-2">
                          <div className="font-medium">{item.customerName}</div>
                          {item.description && <div className="text-xs text-slate-500">{item.description}</div>}
                          {item.promiseDate && (
                            <div className="mt-1 text-[11px] text-indigo-700">Promise: {formatIsoDateForDisplay(item.promiseDate)}</div>
                          )}
                        </td>
                        <td className="py-2">
                          <div>{formatIsoDateForDisplay(item.dueDate)}</div>
                          <div className={`text-xs ${item.daysOverdue > 0 ? "text-rose-600" : "text-slate-500"}`}>{dueLabel}</div>
                        </td>
                        <td className="py-2">
                          <div className="font-medium">{money(item.amountRemaining, currency)}</div>
                          <div className="text-xs text-slate-500">of {money(item.amount, currency)}</div>
                        </td>
                        <td className="py-2">
                          <span
                            className={`rounded px-2 py-1 text-xs font-medium capitalize ${
                              item.priority === "high"
                                ? "bg-rose-100 text-rose-700"
                                : item.priority === "medium"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {item.status}
                          </span>
                          <div className="text-xs text-slate-500 mt-1">
                            {item.reminderCount} reminder{item.reminderCount === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              onClick={() => generateReceivableReminder(item)}
                              disabled={draftingReceivableId === item.id || receivableActionId === item.id}
                              className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                            >
                              {draftingReceivableId === item.id
                                ? "Generating…"
                                : `Draft (${reminderChannelLabel(item.recommendedReminderChannel)})`}
                            </button>
                            <button
                              onClick={() => markReceivablePaid(item.id)}
                              disabled={receivableActionId === item.id}
                              className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                            >
                              Paid
                            </button>
                            <button
                              onClick={() => markReceivablePartial(item)}
                              disabled={receivableActionId === item.id}
                              className="rounded bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300"
                            >
                              Partial
                            </button>
                            <button
                              onClick={() => snoozeReceivable(item)}
                              disabled={receivableActionId === item.id}
                              className="rounded bg-slate-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                              Snooze
                            </button>
                            <button
                              onClick={() => setReceivablePromiseDate(item)}
                              disabled={receivableActionId === item.id}
                              className="rounded bg-violet-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-violet-300"
                            >
                              Promise
                            </button>
                            <button
                              onClick={() => startEditingReceivable(item)}
                              disabled={receivableActionId === item.id || savingReceivable}
                              className="rounded bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {receivablesData.items.length > 5 && (
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() => setArShowAll(!arShowAll)}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    {arShowAll ? "Show less" : `Show ${receivablesData.items.length - 5} more`}
                  </button>
                </div>
              )}
            </div>
          )}

          {selectedReminderDraft && (
            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-indigo-900">Reminder draft for {selectedReminderDraft.customerName}</p>
                <button
                  onClick={copyReminderDraft}
                  className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  Copy draft
                </button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{selectedReminderDraft.draft}</pre>
            </div>
          )}

          {bulkReminderDrafts && bulkReminderDrafts.length > 0 && (
            <div className="mt-4 rounded-xl border border-indigo-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">Bulk reminder drafts ({bulkReminderDrafts.length})</p>
                <button
                  onClick={copyAllBulkReminderDrafts}
                  className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  Copy all drafts
                </button>
              </div>
              <div className="mt-2 space-y-3">
                {bulkReminderDrafts.map((entry) => (
                  <div key={entry.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                    <p className="text-xs font-semibold text-slate-700">{entry.customerName}</p>
                    <pre className="mt-1 whitespace-pre-wrap text-[11px] text-slate-700">{entry.draft}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section> {/* end ar tab */}

        {/* ── MORE TAB — transactions list ─────────────── */}
        <section className={`grid gap-6 ${activeTab !== "more" ? "hidden" : ""}`}>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Recent transactions</h2>
              <div className="flex gap-4">
                {filteredTransactions.length > 0 && (
                  <button
                    onClick={downloadFilteredAsCsv}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    Download CSV ({filteredTransactions.length})
                  </button>
                )}
                {(transactionFilter !== "all" || transactionSearch.trim()) && (
                  <button
                    onClick={() => {
                      setTransactionFilter("all");
                      setTransactionSearch("");
                    }}
                    className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">Newest entries appear first. Filter quickly to review specific subsets.</p>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  { key: "all", label: "All" },
                  { key: "revenue", label: "Revenue" },
                  { key: "expense", label: "Expense" },
                  { key: "review", label: "Needs review" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTransactionFilter(item.key as "all" | "revenue" | "expense" | "review")}
                    className={`rounded-full px-3 py-1 font-medium transition ${
                      transactionFilter === item.key
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] mt-2 md:mt-0">
                {[
                  { label: "This Month", query: "this month" },
                  { label: "Last 30 Days", query: "last 30 days" },
                  { label: "Year to Date", query: "ytd" },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setTransactionSearch(item.query)}
                    className={`rounded-lg px-2 py-1 font-medium border transition ${
                      transactionSearch === item.query
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="relative w-full md:w-64">
                <input
                  type="text"
                  placeholder="Search date, amount, category, type, ‘today’, ‘this week’, ‘mtd’, ‘ytd’, ‘last 14 days’, ‘last 60 days’, ‘next 7 days’, ‘next 60 days’, ‘last 2 weeks’, ‘q1 2026’, ‘fy2026’, ‘this year’/‘this yr’, ‘this quarter’/‘this qtr’, or ‘this fiscal year’..."
                  value={transactionSearch}
                  onChange={(e) => setTransactionSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
                {transactionSearch && (
                  <button
                    onClick={() => setTransactionSearch("")}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {(transactionFilter !== "all" || transactionSearch.trim()) && filteredTransactions.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Filtered Count</span>
                  <span className="text-sm font-semibold text-slate-900">{filteredTransactions.length}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Filtered Revenue</span>
                  <span className="text-sm font-semibold text-emerald-700">{money(filteredSummary.revenue, currency)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Filtered Expense</span>
                  <span className="text-sm font-semibold text-rose-700">{money(filteredSummary.expense, currency)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Filtered Net</span>
                  <span className={`text-sm font-semibold ${filteredNet >= 0 ? "text-slate-900" : "text-rose-700"}`}>
                    {money(filteredNet, currency)}
                  </span>
                </div>
              </div>
            )}

            {loading ? (
              <p className="mt-4 text-sm text-slate-500">Loading…</p>
            ) : data.recentTransactions.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No transactions yet. Start by adding your first revenue or expense above.
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No transactions match this filter.
              </div>
            ) : (
              <div className="mt-4 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Date</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Category</th>
                      <th className="py-2">Description</th>
                      <th className="py-2">Amount</th>
                      <th className="py-2">OCR</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx) => {
                      const relativeLabel = getRelativeDateLabel(tx.date);

                      return (
                        <tr key={tx.id} className="border-t border-slate-100">
                          <td className="py-2">
                            <div>{formatIsoDateForDisplay(tx.date)}</div>
                            {relativeLabel && (
                              <div className="text-[10px] font-bold uppercase text-indigo-500">
                                {relativeLabel}
                              </div>
                            )}
                          </td>
                          <td className="py-2 capitalize">{tx.type}</td>
                        <td className="py-2">{tx.category}</td>
                        <td className="py-2 text-slate-500 truncate max-w-[200px]" title={tx.description}>
                          {tx.description}
                        </td>
                        <td className={`py-2 font-medium ${tx.type === "revenue" ? "text-emerald-700" : "text-rose-700"}`}>
                          {tx.type === "revenue" ? "+" : "-"}
                          {money(tx.amount, currency)}
                        </td>
                        <td className="py-2 text-xs">
                          {tx.ocr ? (
                            tx.ocr.reviewNeeded ? (
                              <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">Needs review</span>
                            ) : (
                              <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-700">
                                {Math.round(tx.ocr.extractionConfidence * 100)}% confidence
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400">Manual</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => startEditing(tx)}
                            disabled={Boolean(editingId)}
                            className="mr-3 text-xs text-blue-600 hover:text-blue-800 hover:underline disabled:text-slate-400 disabled:no-underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => duplicateTransaction(tx)}
                            disabled={Boolean(editingId)}
                            className="mr-3 text-xs text-indigo-600 hover:text-indigo-800 hover:underline disabled:text-slate-400 disabled:no-underline"
                          >
                            Duplicate
                          </button>
                          <button
                            onClick={() => deleteTransaction(tx.id)}
                            disabled={deletingId === tx.id}
                            className="text-xs text-red-600 hover:text-red-800 hover:underline disabled:text-slate-400 disabled:no-underline"
                          >
                            {deletingId === tx.id ? "Deleting…" : "Delete"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-lg font-semibold">Deadlines</h2>
            <p className="mt-1 text-xs text-slate-500">Mark items done as soon as you file to keep your queue clean.</p>
            {loading ? (
              <p className="mt-4 text-sm text-slate-500">Loading…</p>
            ) : data.deadlines.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No deadlines yet. Add your next tax or filing due date to avoid late fees.
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {sortedDeadlines.map((deadline) => {
                  const timingLabel = getDeadlineStatusLabel(deadline.dueDate, new Date());

                  return (
                    <li key={deadline.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                    <div>
                      <p className="font-medium">{deadline.title}</p>
                      <p className="text-xs text-slate-500">
                        Due {formatDeadlineDate(deadline.dueDate)} • {timingLabel} • {recurringLabelMap[deadline.recurring]}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className={`rounded-md px-3 py-1 text-xs font-medium ${
                          deadline.status === "done"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                        onClick={() => toggleDeadline(deadline.id)}
                        disabled={togglingDeadlineId === deadline.id || deletingDeadlineId === deadline.id}
                      >
                        {togglingDeadlineId === deadline.id ? "Saving…" : deadline.status === "done" ? "Done" : "Open"}
                      </button>
                      <button
                        className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => deleteDeadline(deadline.id)}
                        disabled={togglingDeadlineId === deadline.id || deletingDeadlineId === deadline.id}
                      >
                        {deletingDeadlineId === deadline.id ? "…" : "✕"}
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section> {/* end more tab transactions */}

        <datalist id="category-list">
          {data.categories.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>
      </main>
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  subValue,
  progress,
  progressLabel = "Goal progress",
  tone = "default",
}: {
  label: string;
  value: string;
  subValue?: string;
  progress?: number;
  progressLabel?: string;
  tone?: "default" | "good" | "warn" | "danger";
}) {
  const toneClasses: Record<string, string> = {
    default: "border-slate-100",
    good: "border-emerald-100",
    warn: "border-amber-100",
    danger: "border-red-100",
  };

  const progressColors: Record<string, string> = {
    default: "bg-slate-400",
    good: "bg-emerald-500",
    warn: "bg-amber-500",
    danger: "bg-rose-500",
  };

  const activeProgressColor = progress !== undefined && progress >= 0.9 && tone === "warn" 
    ? progressColors.danger 
    : progressColors[tone];

  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-xl font-semibold">{value}</p>
        {subValue && <p className="text-xs font-medium text-slate-500">{subValue}</p>}
      </div>
      {progress !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] font-medium text-slate-500 mb-1">
            <span>{progressLabel}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${activeProgressColor}`}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </article>
  );
}
