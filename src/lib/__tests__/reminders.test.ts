import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  collectEligibleReminders,
  createEmailProvider,
  createPreviewProvider,
  runReminderDispatch,
  type ReminderProvider,
} from "@/lib/reminders";
import type { Store } from "@/lib/types";

function buildStore(overrides?: Partial<Store>): Store {
  return {
    transactions: [],
    deadlines: [],
    receivables: [],
    settings: {
      taxReserveRate: 0.25,
      currency: "USD",
    },
    onboarding: {
      completedSteps: {},
    },
    billing: {
      subscriptionsByAccount: {},
      updatedAt: new Date(0).toISOString(),
    },
    reminderDispatches: {},
    receivableActionCounters: {},
    receivableActionEvents: [],
    ...overrides,
  };
}

describe("collectEligibleReminders", () => {
  test("supports per-deadline offsets and overdue reminders", () => {
    const now = new Date("2026-02-20T10:00:00Z");
    const store = buildStore({
      deadlines: [
        {
          id: "d-offset",
          title: "Sales tax filing",
          dueDate: "2026-02-25",
          recurring: "monthly",
          status: "open",
          reminderOffsetsDays: [5, 2],
          notes: "",
          createdAt: now.toISOString(),
        },
        {
          id: "d-default",
          title: "Payroll filing",
          dueDate: "2026-02-25",
          recurring: "monthly",
          status: "open",
          notes: "",
          createdAt: now.toISOString(),
        },
        {
          id: "d-overdue",
          title: "Quarterly estimate",
          dueDate: "2026-02-18",
          recurring: "quarterly",
          status: "open",
          notes: "",
          createdAt: now.toISOString(),
        },
      ],
    });

    const eligible = collectEligibleReminders(store.deadlines, now);

    assert.equal(eligible.length, 2);
    assert.equal(eligible[0]?.deadlineId, "d-overdue");
    assert.equal(eligible[0]?.reason, "overdue");
    assert.equal(eligible[1]?.deadlineId, "d-offset");
    assert.equal(eligible[1]?.reason, "offset:5");
  });

  test("builds human-readable status labels and reminder copy", () => {
    const now = new Date("2026-02-20T10:00:00Z");
    const store = buildStore({
      deadlines: [
        {
          id: "d-today",
          title: "VAT return",
          dueDate: "2026-02-20",
          recurring: "none",
          status: "open",
          notes: "",
          createdAt: now.toISOString(),
        },
        {
          id: "d-tomorrow",
          title: "Payroll filing",
          dueDate: "2026-02-21",
          recurring: "none",
          status: "open",
          reminderOffsetsDays: [1],
          notes: "",
          createdAt: now.toISOString(),
        },
        {
          id: "d-overdue-copy",
          title: "Permit renewal",
          dueDate: "2026-02-19",
          recurring: "none",
          status: "open",
          notes: "",
          createdAt: now.toISOString(),
        },
      ],
    });

    const eligible = collectEligibleReminders(store.deadlines, now);

    assert.equal(eligible.find((item) => item.deadlineId === "d-today")?.statusLabel, "due today");
    assert.equal(eligible.find((item) => item.deadlineId === "d-tomorrow")?.statusLabel, "due tomorrow");
    assert.equal(eligible.find((item) => item.deadlineId === "d-overdue-copy")?.statusLabel, "due yesterday");
    assert.match(eligible[0]?.message ?? "", /is due on/);
  });
});

describe("runReminderDispatch", () => {
  test("suppresses already-sent same-day reminders and persists new sends", async () => {
    const now = new Date("2026-02-20T10:00:00Z");
    const store = buildStore({
      deadlines: [
        {
          id: "d-1",
          title: "VAT return",
          dueDate: "2026-02-21",
          recurring: "monthly",
          status: "open",
          reminderOffsetsDays: [1],
          notes: "",
          createdAt: now.toISOString(),
        },
        {
          id: "d-2",
          title: "Business permit renewal",
          dueDate: "2026-02-19",
          recurring: "none",
          status: "open",
          notes: "",
          createdAt: now.toISOString(),
        },
      ],
      reminderDispatches: {
        "2026-02-20": ["preview|d-1|offset:1"],
      },
    });

    const provider = createPreviewProvider();
    const result = await runReminderDispatch(store, provider, { now, shouldSend: true });

    assert.equal(result.eligible.length, 2);
    assert.equal(result.suppressed.length, 1);
    assert.equal(result.suppressed[0]?.deadlineId, "d-1");
    assert.equal(result.dispatched, 1);
    assert.deepEqual(result.persistedKeys, ["preview|d-2|overdue"]);
  });

  test("email provider returns clear configuration failures in send mode", async () => {
    const now = new Date("2026-02-20T10:00:00Z");
    const store = buildStore({
      deadlines: [
        {
          id: "d-3",
          title: "State filing",
          dueDate: "2026-02-20",
          recurring: "none",
          status: "open",
          notes: "",
          createdAt: now.toISOString(),
        },
      ],
    });

    const provider = createEmailProvider({ apiKey: "" });
    const result = await runReminderDispatch(store, provider, { now, shouldSend: true });

    assert.equal(result.attempted, 1);
    assert.equal(result.dispatched, 0);
    assert.equal(result.failed.length, 1);
    assert.match(result.failed[0]?.error ?? "", /Missing: RESEND_API_KEY, RESEND_FROM, RESEND_TO/);
    assert.equal(result.persistedKeys.length, 0);
  });

  test("email provider dry-run does not fail when RESEND env vars are missing", async () => {
    const now = new Date("2026-02-20T10:00:00Z");
    const store = buildStore({
      deadlines: [
        {
          id: "d-4",
          title: "Payroll",
          dueDate: "2026-02-20",
          recurring: "none",
          status: "open",
          notes: "",
          createdAt: now.toISOString(),
        },
      ],
    });

    const provider = createEmailProvider({ apiKey: "" });
    const result = await runReminderDispatch(store, provider, { now, shouldSend: false });

    assert.equal(result.attempted, 0);
    assert.equal(result.dispatched, 0);
    assert.equal(result.failed.length, 0);
    assert.equal(result.preview.length, 1);
  });

  test("captures unexpected provider exceptions as per-item failures", async () => {
    const now = new Date("2026-02-20T10:00:00Z");
    const store = buildStore({
      deadlines: [
        {
          id: "d-5",
          title: "License renewal",
          dueDate: "2026-02-20",
          recurring: "none",
          status: "open",
          notes: "",
          createdAt: now.toISOString(),
        },
      ],
    });

    const provider: ReminderProvider = {
      name: "email",
      async send() {
        throw new Error("socket timeout");
      },
    };

    const result = await runReminderDispatch(store, provider, { now, shouldSend: true });

    assert.equal(result.attempted, 1);
    assert.equal(result.dispatched, 0);
    assert.equal(result.failed.length, 1);
    assert.match(result.failed[0]?.error ?? "", /Unexpected reminder provider exception: socket timeout/);
  });
});
