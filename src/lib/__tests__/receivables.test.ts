import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReceivablesQueue, calculateReceivableRiskScore, generateReminderDraft } from "../receivables";
import { Receivable } from "../types";

const mockReceivable: Receivable = {
  id: "1",
  customerName: "Acme Corp",
  amount: 1000,
  amountPaid: 0,
  dueDate: "2026-02-20",
  status: "pending",
  description: "Web development",
  reminderCount: 0,
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
};

test("calculateReceivableRiskScore returns 0 for paid", () => {
  const paid: Receivable = { ...mockReceivable, status: "paid" };
  assert.equal(calculateReceivableRiskScore(paid), 0);
});

test("calculateReceivableRiskScore returns 0 for far future due date", () => {
  const future: Receivable = { ...mockReceivable, dueDate: "2026-03-20" };
  const now = new Date("2026-02-25T12:00:00Z");
  assert.equal(calculateReceivableRiskScore(future, now), 10);
});

test("calculateReceivableRiskScore returns 20 for soon due date (within 7 days)", () => {
  const soon: Receivable = { ...mockReceivable, dueDate: "2026-02-28" };
  const now = new Date("2026-02-25T12:00:00Z");
  assert.equal(calculateReceivableRiskScore(soon, now), 20);
});

test("calculateReceivableRiskScore returns 40 for recently overdue (1-7 days)", () => {
  const overdue: Receivable = { ...mockReceivable, dueDate: "2026-02-24" };
  const now = new Date("2026-02-25T12:00:00Z");
  assert.equal(calculateReceivableRiskScore(overdue, now), 40);
});

test("calculateReceivableRiskScore returns 70 for overdue (8-30 days)", () => {
  const overdue: Receivable = { ...mockReceivable, dueDate: "2026-02-01" };
  const now = new Date("2026-02-25T12:00:00Z");
  assert.equal(calculateReceivableRiskScore(overdue, now), 70);
});

test("calculateReceivableRiskScore returns 90 for long overdue (31+ days)", () => {
  const overdue: Receivable = { ...mockReceivable, dueDate: "2026-01-01" };
  const now = new Date("2026-02-25T12:00:00Z");
  assert.equal(calculateReceivableRiskScore(overdue, now), 90);
});

test("buildReceivablesQueue sorts by highest risk first and computes totals", () => {
  const now = new Date("2026-02-25T12:00:00Z");

  const receivables: Receivable[] = [
    {
      ...mockReceivable,
      id: "high",
      customerName: "Big Overdue",
      amount: 12000,
      amountPaid: 0,
      dueDate: "2026-01-10",
      status: "overdue",
    },
    {
      ...mockReceivable,
      id: "medium",
      customerName: "Recent Overdue",
      amount: 1500,
      amountPaid: 500,
      dueDate: "2026-02-22",
      status: "partial",
    },
    {
      ...mockReceivable,
      id: "low",
      customerName: "Upcoming",
      amount: 300,
      amountPaid: 0,
      dueDate: "2026-03-02",
      status: "pending",
    },
    {
      ...mockReceivable,
      id: "paid",
      customerName: "Closed",
      amount: 900,
      amountPaid: 900,
      dueDate: "2026-02-01",
      status: "paid",
    },
  ];

  const result = buildReceivablesQueue(receivables, now);

  assert.deepEqual(
    result.items.map((item) => item.id),
    ["high", "medium", "low"],
  );

  assert.equal(result.totals.openCount, 3);
  assert.equal(result.totals.openAmount, 13300);
  assert.equal(result.totals.overdueCount, 2);
  assert.equal(result.totals.overdueAmount, 13000);
  assert.equal(result.totals.highRiskCount, 1);
  assert.equal(result.totals.highRiskAmount, 12000);
  assert.equal(result.totals.staleCount, 2);
  assert.equal(result.totals.snoozedCount, 0);
  assert.equal(result.items[0]?.priority, "high");
  assert.equal(result.items[2]?.priority, "low");
});

test("generateReminderDraft creates a human-readable draft", () => {
  const draft = generateReminderDraft(mockReceivable);
  assert.match(draft, /Hi Acme Corp/);
  assert.match(draft, /1000\.00/);
  assert.match(draft, /Web development/);
  assert.match(draft, /Feb 20, 2026/);
});

test("generateReminderDraft uses default description if missing", () => {
  const noDesc: Receivable = { ...mockReceivable, description: "" };
  const draft = generateReminderDraft(noDesc);
  assert.match(draft, /our services/);
});

test("buildReceivablesQueue flags stale follow-ups and prioritizes them when risk ties", () => {
  const now = new Date("2026-02-25T12:00:00Z");

  const stale: Receivable = {
    ...mockReceivable,
    id: "stale",
    customerName: "Stale Follow Up",
    dueDate: "2026-02-20",
    amount: 1000,
    amountPaid: 0,
    status: "pending",
    updatedAt: "2026-02-12T00:00:00Z",
  };

  const fresh: Receivable = {
    ...mockReceivable,
    id: "fresh",
    customerName: "Fresh Follow Up",
    dueDate: "2026-02-20",
    amount: 1000,
    amountPaid: 0,
    status: "pending",
    updatedAt: "2026-02-24T00:00:00Z",
  };

  const result = buildReceivablesQueue([fresh, stale], now);

  assert.equal(result.items[0]?.id, "stale");
  assert.equal(result.items[0]?.followUpStale, true);
  assert.equal(result.items[0]?.daysSinceLastTouch, 13);
  assert.match(result.items[0]?.suggestedAction ?? "", /Follow up again today/);

  assert.equal(result.items[1]?.id, "fresh");
  assert.equal(result.items[1]?.followUpStale, false);
});

test("buildReceivablesQueue uses last reminder as latest touch and escalates after repeated reminders", () => {
  const now = new Date("2026-02-25T12:00:00Z");

  const escalated: Receivable = {
    ...mockReceivable,
    id: "esc",
    dueDate: "2026-02-05",
    status: "overdue",
    reminderCount: 3,
    updatedAt: "2026-02-10T00:00:00Z",
    lastReminderAt: "2026-02-24T00:00:00Z",
  };

  const result = buildReceivablesQueue([escalated], now);

  assert.equal(result.items[0]?.daysSinceLastTouch, 1);
  assert.equal(result.items[0]?.followUpStale, false);
  assert.match(result.items[0]?.suggestedAction ?? "", /Escalate to phone follow-up today/);
});

test("generateReminderDraft includes timing context", () => {
  const now = new Date("2026-02-25T12:00:00Z");
  const draft = generateReminderDraft(mockReceivable, now);

  assert.match(draft, /5 days overdue/);
});

test("buildReceivablesQueue deprioritizes future-snoozed items and tracks snoozed totals", () => {
  const now = new Date("2026-02-25T12:00:00Z");

  const urgent: Receivable = {
    ...mockReceivable,
    id: "urgent",
    customerName: "Urgent Client",
    dueDate: "2026-02-20",
    status: "pending",
    updatedAt: "2026-02-20T00:00:00Z",
  };

  const snoozed: Receivable = {
    ...mockReceivable,
    id: "snoozed",
    customerName: "Snoozed Client",
    dueDate: "2026-02-20",
    status: "pending",
    nextFollowUpDate: "2026-03-01",
    updatedAt: "2026-02-20T00:00:00Z",
  };

  const result = buildReceivablesQueue([snoozed, urgent], now);

  assert.equal(result.items[0]?.id, "urgent");
  assert.equal(result.items[1]?.id, "snoozed");
  assert.equal(result.items[1]?.followUpSnoozed, true);
  assert.equal(result.items[1]?.daysUntilNextFollowUp, 4);
  assert.match(result.items[1]?.suggestedAction ?? "", /Snoozed until follow-up date/);
  assert.equal(result.totals.snoozedCount, 1);
});

test("buildReceivablesQueue surfaces promise-date action", () => {
  const now = new Date("2026-02-25T12:00:00Z");

  const promised: Receivable = {
    ...mockReceivable,
    id: "promised",
    promiseDate: "2026-02-27",
    updatedAt: "2026-02-24T00:00:00Z",
  };

  const result = buildReceivablesQueue([promised], now);

  assert.match(result.items[0]?.suggestedAction ?? "", /Customer promised payment by/);
});

test("buildReceivablesQueue recommends the best-performing channel for a customer", () => {
  const now = new Date("2026-02-25T12:00:00Z");

  const open: Receivable = {
    ...mockReceivable,
    id: "open",
    customerName: "Acme Corp",
    status: "pending",
    dueDate: "2026-02-21",
  };

  const closedOne: Receivable = {
    ...mockReceivable,
    id: "closed-1",
    customerName: "Acme Corp",
    status: "paid",
    amountPaid: 1000,
    dueDate: "2026-02-15",
  };

  const closedTwo: Receivable = {
    ...mockReceivable,
    id: "closed-2",
    customerName: "Acme Corp",
    status: "paid",
    amountPaid: 1000,
    dueDate: "2026-02-16",
  };

  const queue = buildReceivablesQueue(
    [open, closedOne, closedTwo],
    now,
    [
      {
        id: "e-1",
        receivableId: "closed-1",
        actionType: "log_reminder",
        createdAt: "2026-02-17T09:00:00Z",
        channel: "sms",
      },
      {
        id: "e-2",
        receivableId: "closed-1",
        actionType: "mark_paid",
        createdAt: "2026-02-18T10:00:00Z",
      },
      {
        id: "e-3",
        receivableId: "closed-2",
        actionType: "log_reminder",
        createdAt: "2026-02-19T09:00:00Z",
        channel: "sms",
      },
      {
        id: "e-4",
        receivableId: "closed-2",
        actionType: "mark_paid",
        createdAt: "2026-02-20T11:00:00Z",
      },
    ],
  );

  assert.equal(queue.items[0]?.recommendedReminderChannel, "sms");
  assert.equal(queue.items[0]?.recommendedReminderConfidence, "low");
  assert.match(queue.items[0]?.recommendedReminderReason ?? "", /Best for this customer in similar invoices/);
  assert.ok(queue.items[0]?.recommendedReminderTags.includes("source:customer_segment"));
});

test("buildReceivablesQueue falls back to segment best channel when customer history is thin", () => {
  const now = new Date("2026-02-25T12:00:00Z");

  const open: Receivable = {
    ...mockReceivable,
    id: "open-segment",
    customerName: "New Buyer",
    status: "pending",
    dueDate: "2026-02-22",
  };

  const closed: Receivable[] = [
    {
      ...mockReceivable,
      id: "c1",
      customerName: "Alpha",
      status: "paid",
      amountPaid: 1000,
      dueDate: "2026-02-10",
    },
    {
      ...mockReceivable,
      id: "c2",
      customerName: "Beta",
      status: "paid",
      amountPaid: 1000,
      dueDate: "2026-02-11",
    },
    {
      ...mockReceivable,
      id: "c3",
      customerName: "Gamma",
      status: "paid",
      amountPaid: 1000,
      dueDate: "2026-02-12",
    },
  ];

  const queue = buildReceivablesQueue(
    [open, ...closed],
    now,
    [
      {
        id: "g-1",
        receivableId: "c1",
        actionType: "log_reminder",
        createdAt: "2026-02-13T09:00:00Z",
        channel: "whatsapp",
      },
      {
        id: "g-2",
        receivableId: "c1",
        actionType: "mark_paid",
        createdAt: "2026-02-14T10:00:00Z",
      },
      {
        id: "g-3",
        receivableId: "c2",
        actionType: "log_reminder",
        createdAt: "2026-02-14T09:00:00Z",
        channel: "whatsapp",
      },
      {
        id: "g-4",
        receivableId: "c2",
        actionType: "mark_paid",
        createdAt: "2026-02-15T10:00:00Z",
      },
      {
        id: "g-5",
        receivableId: "c3",
        actionType: "log_reminder",
        createdAt: "2026-02-15T09:00:00Z",
        channel: "whatsapp",
      },
      {
        id: "g-6",
        receivableId: "c3",
        actionType: "mark_paid",
        createdAt: "2026-02-16T10:00:00Z",
      },
    ],
  );

  assert.equal(queue.items[0]?.recommendedReminderChannel, "whatsapp");
  assert.equal(queue.items[0]?.recommendedReminderConfidence, "medium");
  assert.match(queue.items[0]?.recommendedReminderReason ?? "", /Best for similar invoice profile/);
  assert.ok(queue.items[0]?.recommendedReminderTags.includes("source:segment"));
  assert.ok(queue.items[0]?.recommendedReminderTags.includes("amount:small"));
  assert.ok(queue.items[0]?.recommendedReminderTags.includes("timing:overdue_1_14"));
});

test("buildReceivablesQueue uses global best channel when segment history is missing", () => {
  const now = new Date("2026-02-25T12:00:00Z");

  const open: Receivable = {
    ...mockReceivable,
    id: "open-global",
    customerName: "First Time",
    amount: 16000,
    dueDate: "2026-03-08",
    status: "pending",
  };

  const closed: Receivable[] = [
    {
      ...mockReceivable,
      id: "g1",
      customerName: "R1",
      amount: 1200,
      amountPaid: 1200,
      dueDate: "2026-02-10",
      status: "paid",
    },
    {
      ...mockReceivable,
      id: "g2",
      customerName: "R2",
      amount: 1100,
      amountPaid: 1100,
      dueDate: "2026-02-11",
      status: "paid",
    },
    {
      ...mockReceivable,
      id: "g3",
      customerName: "R3",
      amount: 1000,
      amountPaid: 1000,
      dueDate: "2026-02-12",
      status: "paid",
    },
  ];

  const queue = buildReceivablesQueue(
    [open, ...closed],
    now,
    [
      {
        id: "gg-1",
        receivableId: "g1",
        actionType: "log_reminder",
        createdAt: "2026-02-13T09:00:00Z",
        channel: "sms",
      },
      {
        id: "gg-2",
        receivableId: "g1",
        actionType: "mark_paid",
        createdAt: "2026-02-14T09:30:00Z",
      },
      {
        id: "gg-3",
        receivableId: "g2",
        actionType: "log_reminder",
        createdAt: "2026-02-14T09:00:00Z",
        channel: "sms",
      },
      {
        id: "gg-4",
        receivableId: "g2",
        actionType: "mark_paid",
        createdAt: "2026-02-15T09:30:00Z",
      },
      {
        id: "gg-5",
        receivableId: "g3",
        actionType: "log_reminder",
        createdAt: "2026-02-15T09:00:00Z",
        channel: "sms",
      },
      {
        id: "gg-6",
        receivableId: "g3",
        actionType: "mark_paid",
        createdAt: "2026-02-16T09:30:00Z",
      },
    ],
  );

  assert.equal(queue.items[0]?.recommendedReminderChannel, "sms");
  assert.equal(queue.items[0]?.recommendedReminderConfidence, "medium");
  assert.match(queue.items[0]?.recommendedReminderReason ?? "", /Best overall channel/);
  assert.ok(queue.items[0]?.recommendedReminderTags.includes("source:global"));
  assert.ok(queue.items[0]?.recommendedReminderTags.includes("amount:large"));
  assert.ok(queue.items[0]?.recommendedReminderTags.includes("timing:upcoming"));
});

test("buildReceivablesQueue applies recommendation confidence cap", () => {
  const now = new Date("2026-02-25T12:00:00Z");

  const open: Receivable = {
    ...mockReceivable,
    id: "open-capped",
    customerName: "Cap Test",
    status: "pending",
    dueDate: "2026-02-21",
  };

  const closed: Receivable[] = [
    { ...mockReceivable, id: "cap-1", customerName: "Cap Test", status: "paid", amountPaid: 1000, dueDate: "2026-02-10" },
    { ...mockReceivable, id: "cap-2", customerName: "Cap Test", status: "paid", amountPaid: 1000, dueDate: "2026-02-11" },
    { ...mockReceivable, id: "cap-3", customerName: "Cap Test", status: "paid", amountPaid: 1000, dueDate: "2026-02-12" },
    { ...mockReceivable, id: "cap-4", customerName: "Cap Test", status: "paid", amountPaid: 1000, dueDate: "2026-02-13" },
    { ...mockReceivable, id: "cap-5", customerName: "Cap Test", status: "paid", amountPaid: 1000, dueDate: "2026-02-14" },
  ];

  const events = [
    { id: "cap-e1", receivableId: "cap-1", actionType: "log_reminder" as const, createdAt: "2026-02-15T09:00:00Z", channel: "email" as const },
    { id: "cap-e2", receivableId: "cap-1", actionType: "mark_paid" as const, createdAt: "2026-02-16T09:00:00Z" },
    { id: "cap-e3", receivableId: "cap-2", actionType: "log_reminder" as const, createdAt: "2026-02-15T10:00:00Z", channel: "email" as const },
    { id: "cap-e4", receivableId: "cap-2", actionType: "mark_paid" as const, createdAt: "2026-02-16T10:00:00Z" },
    { id: "cap-e5", receivableId: "cap-3", actionType: "log_reminder" as const, createdAt: "2026-02-15T11:00:00Z", channel: "email" as const },
    { id: "cap-e6", receivableId: "cap-3", actionType: "mark_paid" as const, createdAt: "2026-02-16T11:00:00Z" },
    { id: "cap-e7", receivableId: "cap-4", actionType: "log_reminder" as const, createdAt: "2026-02-15T12:00:00Z", channel: "email" as const },
    { id: "cap-e8", receivableId: "cap-4", actionType: "mark_paid" as const, createdAt: "2026-02-16T12:00:00Z" },
    { id: "cap-e9", receivableId: "cap-5", actionType: "log_reminder" as const, createdAt: "2026-02-15T13:00:00Z", channel: "email" as const },
    { id: "cap-e10", receivableId: "cap-5", actionType: "mark_paid" as const, createdAt: "2026-02-16T13:00:00Z" },
  ];

  const uncapped = buildReceivablesQueue([open, ...closed], now, events);
  const capped = buildReceivablesQueue([open, ...closed], now, events, { maxRecommendedConfidence: "medium" });

  assert.equal(uncapped.items[0]?.recommendedReminderConfidence, "high");
  assert.equal(capped.items[0]?.recommendedReminderConfidence, "medium");
});
