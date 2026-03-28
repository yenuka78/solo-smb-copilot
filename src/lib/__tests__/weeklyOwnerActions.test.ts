import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWeeklyOwnerActionBrief } from "@/lib/weeklyOwnerActions";

describe("buildWeeklyOwnerActionBrief", () => {
  it("returns top 5 owner actions ranked by expected 14-day cash impact", () => {
    const brief = buildWeeklyOwnerActionBrief(
      [
        {
          id: "tx-exp-1",
          type: "expense",
          amount: 2400,
          date: "2026-02-20",
          category: "ads",
          description: "Campaign spend",
          source: "manual",
          createdAt: "2026-02-20T00:00:00.000Z",
        },
        {
          id: "tx-rev-1",
          type: "revenue",
          amount: 1800,
          date: "2026-02-19",
          category: "consulting",
          description: "Client work",
          source: "manual",
          createdAt: "2026-02-19T00:00:00.000Z",
        },
      ],
      [
        {
          id: "r-1",
          customerName: "Acme",
          amount: 2200,
          amountPaid: 0,
          dueDate: "2026-02-10",
          status: "overdue",
          reminderCount: 2,
          lastReminderAt: "2026-02-15T00:00:00.000Z",
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-15T00:00:00.000Z",
        },
        {
          id: "r-2",
          customerName: "Beta",
          amount: 900,
          amountPaid: 0,
          dueDate: "2026-02-25",
          status: "pending",
          reminderCount: 0,
          createdAt: "2026-02-15T00:00:00.000Z",
          updatedAt: "2026-02-15T00:00:00.000Z",
        },
      ],
      [
        {
          id: "d-1",
          title: "VAT filing",
          dueDate: "2026-02-28",
          recurring: "monthly",
          status: "open",
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
      {
        taxReserveRate: 0.25,
        currency: "USD",
        currentCashBalance: 500,
      },
      new Date("2026-02-26T00:00:00.000Z"),
    );

    assert.equal(brief.windowDays, 14);
    assert.equal(brief.topActions.length, 5);
    assert.ok(brief.totalExpectedImpact14d > 0);
    assert.ok(brief.topActions.every((action) => action.expectedCashImpact14d >= 0));

    for (let i = 1; i < brief.topActions.length; i += 1) {
      assert.ok(
        brief.topActions[i - 1].priorityScore >= brief.topActions[i].priorityScore,
        "actions should be sorted by descending priority score",
      );
    }

    const hasCollectionsAction = brief.topActions.some((action) => action.category === "collections");
    assert.equal(hasCollectionsAction, true);
  });

  it("returns fallback action when no operational data exists", () => {
    const brief = buildWeeklyOwnerActionBrief(
      [],
      [],
      [],
      {
        taxReserveRate: 0.25,
        currency: "USD",
        currentCashBalance: 0,
      },
      new Date("2026-02-26T00:00:00.000Z"),
    );

    assert.equal(brief.topActions.length, 1);
    assert.equal(brief.topActions[0]?.id, "maintain-pace");
    assert.equal(brief.totalExpectedImpact14d, 0);
  });
});
