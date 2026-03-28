import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeOnboardingState,
  markOnboardingStepComplete,
  buildOnboardingProgress,
  dismissOnboarding,
} from "../onboarding";
import type { OnboardingState } from "../types";

describe("onboarding lib", () => {
  it("normalizes empty state", () => {
    const state = normalizeOnboardingState();
    assert.deepEqual(state.completedSteps, {});
    assert.strictEqual(state.dismissed, false);
  });

  it("filters invalid step keys during normalization", () => {
    const state = normalizeOnboardingState({
      completedSteps: {
        set_tax_rate: "2026-02-23",
        // @ts-expect-error - testing invalid step key filter
        invalid_step: "garbage",
      },
    });
    assert.ok(state.completedSteps.hasOwnProperty("set_tax_rate"));
    assert.ok(!state.completedSteps.hasOwnProperty("invalid_step"));
  });

  it("marks steps as complete and auto-undismisses", () => {
    let state: OnboardingState = {
      completedSteps: {},
      dismissed: true,
    };

    state = markOnboardingStepComplete(state, "set_tax_rate");
    assert.ok(state.completedSteps.set_tax_rate);
    assert.strictEqual(state.dismissed, false);
  });

  it("does not overwrite existing completion timestamp", () => {
    const originalTime = "2025-01-01T00:00:00.000Z";
    let state: OnboardingState = {
      completedSteps: { set_tax_rate: originalTime },
      dismissed: false,
    };

    state = markOnboardingStepComplete(state, "set_tax_rate");
    assert.strictEqual(state.completedSteps.set_tax_rate, originalTime);
  });

  it("dismisses onboarding", () => {
    const state = dismissOnboarding({ completedSteps: {}, dismissed: false });
    assert.strictEqual(state.dismissed, true);
  });

  it("builds progress summary", () => {
    const state: OnboardingState = {
      completedSteps: {
        set_tax_rate: "2026-02-23",
        add_first_transaction: "2026-02-23",
      },
      dismissed: false,
    };

    const progress = buildOnboardingProgress(state);
    assert.strictEqual(progress.totalSteps, 8);
    assert.strictEqual(progress.completedSteps, 2);
    assert.strictEqual(progress.percent, 25);
    assert.strictEqual(progress.allCompleted, false);

    const taxStep = progress.steps.find((s) => s.key === "set_tax_rate");
    assert.strictEqual(taxStep?.completed, true);
    assert.strictEqual(taxStep?.completedAt, "2026-02-23");

    const receiptStep = progress.steps.find((s) => s.key === "upload_first_receipt");
    assert.strictEqual(receiptStep?.completed, false);
  });

  it("sets allCompleted when finished", () => {
    const state: OnboardingState = {
      completedSteps: {
        set_tax_rate: "t",
        set_revenue_goal: "t",
        set_expense_limit: "t",
        add_first_transaction: "t",
        add_first_deadline: "t",
        upload_first_receipt: "t",
        check_tax_reserve: "t",
        check_expense_limit: "t",
      },
      dismissed: false,
    };

    const progress = buildOnboardingProgress(state);
    assert.strictEqual(progress.allCompleted, true);
    assert.strictEqual(progress.percent, 100);
  });
});
