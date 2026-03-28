import type {
  OnboardingProgress,
  OnboardingState,
  OnboardingStepKey,
  OnboardingStepStatus,
} from "@/lib/types";

const STEP_DEFINITIONS: Array<Pick<OnboardingStepStatus, "key" | "label" | "description">> = [
  {
    key: "set_tax_rate",
    label: "Set your tax rate",
    description: "Save your preferred tax reserve rate in settings.",
  },
  {
    key: "set_revenue_goal",
    label: "Set a revenue goal",
    description: "Define a monthly revenue target to track progress.",
  },
  {
    key: "set_expense_limit",
    label: "Set an expense limit",
    description: "Define a monthly spending limit to keep overhead low.",
  },
  {
    key: "add_first_transaction",
    label: "Add your first transaction",
    description: "Log one revenue or expense item.",
  },
  {
    key: "add_first_deadline",
    label: "Add your first deadline",
    description: "Track a tax or compliance due date.",
  },
  {
    key: "upload_first_receipt",
    label: "Upload your first receipt",
    description: "Upload a receipt/invoice to create a transaction.",
  },
  {
    key: "check_tax_reserve",
    label: "Check your tax reserve",
    description: "Review the suggested tax reserve on the dashboard.",
  },
  {
    key: "check_expense_limit",
    label: "Check your expense limit",
    description: "Review your monthly spending progress on the dashboard.",
  },
];

const STEP_KEY_SET = new Set<OnboardingStepKey>(STEP_DEFINITIONS.map((step) => step.key));

export function normalizeOnboardingState(input?: Partial<OnboardingState>): OnboardingState {
  const completedSteps: OnboardingState["completedSteps"] = {};

  for (const [key, value] of Object.entries(input?.completedSteps ?? {})) {
    if (typeof value === "string" && STEP_KEY_SET.has(key as OnboardingStepKey)) {
      completedSteps[key as OnboardingStepKey] = value;
    }
  }

  return {
    completedSteps,
    dismissed: Boolean(input?.dismissed),
  };
}

export function markOnboardingStepComplete(state: OnboardingState, step: OnboardingStepKey): OnboardingState {
  if (state.completedSteps[step]) {
    return state;
  }

  return {
    ...state,
    completedSteps: {
      ...state.completedSteps,
      [step]: new Date().toISOString(),
    },
    // Auto-undismiss if we just completed a step but not all
    dismissed: false,
  };
}

export function dismissOnboarding(state: OnboardingState): OnboardingState {
  return {
    ...state,
    dismissed: true,
  };
}

export function buildOnboardingProgress(state: OnboardingState): OnboardingProgress {
  const steps = STEP_DEFINITIONS.map((step): OnboardingStepStatus => {
    const completedAt = state.completedSteps[step.key];

    return {
      ...step,
      completed: Boolean(completedAt),
      completedAt,
    };
  });

  const completedSteps = steps.filter((step) => step.completed).length;
  const totalSteps = steps.length;

  return {
    totalSteps,
    completedSteps,
    percent: totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100),
    allCompleted: completedSteps === totalSteps,
    dismissed: Boolean(state.dismissed),
    steps,
  };
}
