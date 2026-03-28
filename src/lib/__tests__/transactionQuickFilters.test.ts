import { matchesTransactionSearch } from "../transactionSearch";

import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("Transaction Quick Filters (via matchesTransactionSearch)", () => {
  const referenceDate = new Date("2026-02-21T12:00:00Z"); // a Saturday

  const todayTx = {
    amount: 100,
    date: "2026-02-21",
    category: "test",
    description: "today",
    type: "revenue" as const,
  };

  const yesterdayTx = {
    amount: 100,
    date: "2026-02-20",
    category: "test",
    description: "yesterday",
    type: "revenue" as const,
  };

  const earlierThisMonthTx = {
    amount: 100,
    date: "2026-02-05",
    category: "test",
    description: "earlier this month",
    type: "revenue" as const,
  };

  const lastMonthTx = {
    amount: 100,
    date: "2026-01-20",
    category: "test",
    description: "last month",
    type: "revenue" as const,
  };

  const last30DaysTx = {
    amount: 100,
    date: "2026-01-25",
    category: "test",
    description: "last 30 days",
    type: "revenue" as const,
  };

  const yearToDateTx = {
    amount: 100,
    date: "2026-01-01",
    category: "test",
    description: "ytd",
    type: "revenue" as const,
  };

  test("matches 'this month'", () => {
    assert.equal(matchesTransactionSearch(todayTx, "this month", referenceDate), true);
    assert.equal(matchesTransactionSearch(yesterdayTx, "this month", referenceDate), true);
    assert.equal(matchesTransactionSearch(earlierThisMonthTx, "this month", referenceDate), true);
    assert.equal(matchesTransactionSearch(lastMonthTx, "this month", referenceDate), false);
  });

  test("matches 'last 30 days'", () => {
    assert.equal(matchesTransactionSearch(todayTx, "last 30 days", referenceDate), true);
    assert.equal(matchesTransactionSearch(yesterdayTx, "last 30 days", referenceDate), true);
    assert.equal(matchesTransactionSearch(last30DaysTx, "last 30 days", referenceDate), true);
    
    const wayBackTx = { ...todayTx, date: "2025-12-01" };
    assert.equal(matchesTransactionSearch(wayBackTx, "last 30 days", referenceDate), false);
  });

  test("matches 'ytd'", () => {
    assert.equal(matchesTransactionSearch(todayTx, "ytd", referenceDate), true);
    assert.equal(matchesTransactionSearch(yearToDateTx, "ytd", referenceDate), true);
    
    const lastYearTx = { ...todayTx, date: "2025-12-31" };
    assert.equal(matchesTransactionSearch(lastYearTx, "ytd", referenceDate), false);
  });
});
