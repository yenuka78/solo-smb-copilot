import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReceivableAnalytics, buildRecommendationConfidenceCalibration } from "../receivableAnalytics";
import { Receivable, ReceivableActionEvent } from "../types";

const now = new Date("2026-02-25T12:00:00Z");

const receivables: Receivable[] = [
  {
    id: "r1",
    customerName: "Alpha",
    amount: 500,
    amountPaid: 500,
    dueDate: "2026-02-20",
    status: "paid",
    reminderCount: 1,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-22T12:00:00Z",
  },
  {
    id: "r2",
    customerName: "Beta",
    amount: 300,
    amountPaid: 150,
    dueDate: "2026-02-21",
    status: "partial",
    reminderCount: 1,
    createdAt: "2026-02-02T00:00:00Z",
    updatedAt: "2026-02-24T08:30:00Z",
  },
  {
    id: "r3",
    customerName: "Gamma",
    amount: 1200,
    amountPaid: 0,
    dueDate: "2026-01-12",
    status: "overdue",
    reminderCount: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-10T11:00:00Z",
  },
  {
    id: "r9",
    customerName: "Delta",
    amount: 90,
    amountPaid: 90,
    dueDate: "2026-02-20",
    status: "paid",
    reminderCount: 1,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-21T08:00:00Z",
  },
  {
    id: "r10",
    customerName: "Epsilon",
    amount: 200,
    amountPaid: 200,
    dueDate: "2026-02-20",
    status: "paid",
    reminderCount: 2,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-22T08:00:00Z",
  },
];

const events: ReceivableActionEvent[] = [
  {
    id: "evt-1",
    receivableId: "r1",
    actionType: "log_reminder",
    channel: "email",
    createdAt: "2026-02-20T09:00:00Z",
  },
  {
    id: "evt-2",
    receivableId: "r1",
    actionType: "mark_paid",
    amountCollected: 500,
    createdAt: "2026-02-22T12:00:00Z",
  },
  {
    id: "evt-3",
    receivableId: "r2",
    actionType: "bulk_log_reminder",
    channel: "sms",
    createdAt: "2026-02-23T10:00:00Z",
  },
  {
    id: "evt-4",
    receivableId: "r2",
    actionType: "mark_partial",
    amountCollected: 150,
    createdAt: "2026-02-24T08:30:00Z",
  },
  {
    id: "evt-5",
    receivableId: "r3",
    actionType: "bulk_log_reminder",
    channel: "whatsapp",
    createdAt: "2026-01-10T11:00:00Z",
  },
];

test("buildReceivableAnalytics returns windowed action and conversion metrics", () => {
  const analytics = buildReceivableAnalytics({
    counters: {
      log_reminder: 1,
      bulk_log_reminder: 2,
      mark_paid: 1,
      mark_partial: 1,
      reminder_email: 1,
      reminder_sms: 1,
      reminder_whatsapp: 1,
    },
    events,
    receivables,
    now,
  });

  assert.equal(analytics.lifetime.remindersSent, 3);
  assert.equal(analytics.lifetime.paymentsCollectedCount, 2);
  assert.equal(analytics.lifetime.paymentsCollectedAmount, 650);
  assert.equal(analytics.lifetime.reminderToPaidCount, 2);
  assert.equal(analytics.lifetime.reminderToPaidAmount, 650);
  assert.equal(analytics.lifetime.reminderToPaidRate, 2 / 3);
  assert.equal(analytics.lifetime.reminderChannelPerformance.email.remindersSent, 1);
  assert.equal(analytics.lifetime.reminderChannelPerformance.email.convertedCount, 1);
  assert.equal(analytics.lifetime.reminderChannelPerformance.email.convertedAmount, 500);
  assert.equal(analytics.lifetime.reminderChannelPerformance.email.conversionRate, 1);
  assert.equal(analytics.lifetime.reminderChannelPerformance.whatsapp.remindersSent, 1);
  assert.equal(analytics.lifetime.reminderChannelPerformance.whatsapp.convertedCount, 0);
  assert.equal(analytics.lifetime.recommendationBacktest.remindersEvaluated, 3);
  assert.equal(analytics.lifetime.recommendationBacktest.realizedConversions, 2);
  assert.ok(analytics.lifetime.recommendationBacktest.predictedConversions >= 0);
  assert.equal(analytics.lifetime.recommendationBacktest.byChannel.email.remindersEvaluated, 1);
  assert.equal(analytics.lifetime.recommendationBacktest.byChannel.sms.realizedConversions, 1);
  assert.ok(analytics.lifetime.recommendationBacktest.bySegment.length >= 1);

  assert.equal(analytics.windows["7d"].remindersSent, 2);
  assert.equal(analytics.windows["7d"].paymentsCollectedCount, 2);
  assert.equal(analytics.windows["7d"].reminderToPaidCount, 2);
  assert.equal(analytics.windows["7d"].reminderToPaidRate, 1);
  assert.equal(analytics.windows["7d"].reminderChannelPerformance.sms.convertedAmount, 150);

  assert.equal(analytics.windows["30d"].remindersSent, 2);
  assert.equal(analytics.windows["30d"].paymentsCollectedAmount, 650);
});

test("buildReceivableAnalytics does not count payments before reminders as conversions", () => {
  const invertedEvents: ReceivableActionEvent[] = [
    {
      id: "a",
      receivableId: "r9",
      actionType: "mark_partial",
      amountCollected: 90,
      createdAt: "2026-02-20T08:00:00Z",
    },
    {
      id: "b",
      receivableId: "r9",
      actionType: "log_reminder",
      channel: "email",
      createdAt: "2026-02-21T08:00:00Z",
    },
  ];

  const analytics = buildReceivableAnalytics({ counters: {}, events: invertedEvents, receivables, now });

  assert.equal(analytics.windows["7d"].paymentsCollectedCount, 1);
  assert.equal(analytics.windows["7d"].remindersSent, 1);
  assert.equal(analytics.windows["7d"].reminderToPaidCount, 0);
  assert.equal(analytics.windows["7d"].reminderToPaidRate, 0);
  assert.equal(analytics.windows["7d"].reminderChannelPerformance.email.convertedCount, 0);
});

test("buildReceivableAnalytics attributes conversion to the most recent reminder channel", () => {
  const sequencedEvents: ReceivableActionEvent[] = [
    {
      id: "c1",
      receivableId: "r10",
      actionType: "log_reminder",
      channel: "email",
      createdAt: "2026-02-20T08:00:00Z",
    },
    {
      id: "c2",
      receivableId: "r10",
      actionType: "log_reminder",
      channel: "sms",
      createdAt: "2026-02-21T08:00:00Z",
    },
    {
      id: "c3",
      receivableId: "r10",
      actionType: "mark_paid",
      amountCollected: 200,
      createdAt: "2026-02-22T08:00:00Z",
    },
  ];

  const analytics = buildReceivableAnalytics({ counters: {}, events: sequencedEvents, receivables, now });

  assert.equal(analytics.windows["7d"].reminderChannelPerformance.email.convertedCount, 0);
  assert.equal(analytics.windows["7d"].reminderChannelPerformance.sms.convertedCount, 1);
  assert.equal(analytics.windows["7d"].reminderChannelPerformance.sms.convertedAmount, 200);
});

test("buildRecommendationConfidenceCalibration caps confidence when error is high", () => {
  const calibration = buildRecommendationConfidenceCalibration({
    now,
    slice: {
      recommendationBacktest: {
        remindersEvaluated: 12,
        remindersWithRecommendation: 12,
        matchedRecommendationCount: 5,
        recommendationMatchRate: 5 / 12,
        predictedConversions: 10,
        realizedConversions: 4,
        predictedCollectedAmount: 10000,
        realizedCollectedAmount: 4000,
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
    },
  });

  assert.equal(calibration.maxRecommendedConfidence, "low");
  assert.equal(calibration.status, "degraded");
  assert.equal(calibration.windowDays, 30);
});

test("buildRecommendationConfidenceCalibration limits to low confidence on sparse samples", () => {
  const calibration = buildRecommendationConfidenceCalibration({
    now,
    slice: {
      recommendationBacktest: {
        remindersEvaluated: 3,
        remindersWithRecommendation: 3,
        matchedRecommendationCount: 3,
        recommendationMatchRate: 1,
        predictedConversions: 2,
        realizedConversions: 2,
        predictedCollectedAmount: 800,
        realizedCollectedAmount: 820,
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
    },
  });

  assert.equal(calibration.maxRecommendedConfidence, "low");
  assert.equal(calibration.status, "watch");
});
