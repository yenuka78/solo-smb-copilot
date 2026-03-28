import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { matchesTransactionSearch } from "@/lib/transactionSearch";

describe("transaction search helper", () => {
  const sample = {
    amount: 145.2,
    date: "2026-02-21",
    type: "expense" as const,
    category: "software",
    description: "Monthly design tool",
    receiptName: "invoice-feb.pdf",
  };

  test("matches human-readable month/day date queries", () => {
    assert.equal(matchesTransactionSearch(sample, "feb 21"), true);
  });

  test("matches raw ISO date queries", () => {
    assert.equal(matchesTransactionSearch(sample, "2026-02"), true);
  });

  test("matches currency-formatted amount queries", () => {
    assert.equal(matchesTransactionSearch(sample, "$145.20"), true);
  });

  test("matches comma-formatted amount queries", () => {
    const largerAmount = {
      ...sample,
      amount: 1234.5,
    };

    assert.equal(matchesTransactionSearch(largerAmount, "1,234.50"), true);
  });

  test("matches receipt names even when query punctuation differs", () => {
    assert.equal(matchesTransactionSearch(sample, "invoice feb"), true);
  });

  test("matches transaction type aliases", () => {
    assert.equal(matchesTransactionSearch(sample, "cost"), true);
    assert.equal(matchesTransactionSearch({ ...sample, type: "revenue" }, "income"), true);
  });

  test("matches plural transaction type terms users commonly type", () => {
    assert.equal(matchesTransactionSearch(sample, "expenses"), true);
    assert.equal(matchesTransactionSearch({ ...sample, type: "revenue" }, "revenues"), true);
  });

  test("matches shorthand type abbreviations", () => {
    assert.equal(matchesTransactionSearch(sample, "exp"), true);
    assert.equal(matchesTransactionSearch({ ...sample, type: "revenue" }, "rev"), true);
  });

  test("matches relative date keywords for today/yesterday/tomorrow", () => {
    const referenceDate = new Date("2026-02-21T10:00:00.000Z");

    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-21" }, "today", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-20" }, "yesterday", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-22" }, "tomorrow", referenceDate), true);
  });

  test("matches relative month keywords for this/last/next month", () => {
    const referenceDate = new Date("2026-02-21T10:00:00.000Z");

    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-10" }, "this month", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-01-31" }, "last month", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-03-01" }, "next month", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-03-01" }, "current month", referenceDate), false);
  });

  test("matches relative week keywords for this/last/next week", () => {
    const referenceDate = new Date("2026-02-18T10:00:00.000Z"); // Wednesday

    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-16" }, "this week", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-09" }, "last week", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-23" }, "next week", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-23" }, "current week", referenceDate), false);
  });

  test("matches relative year keywords for this/last/next year", () => {
    const referenceDate = new Date("2026-02-18T10:00:00.000Z");

    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-01-02" }, "this year", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-01-02" }, "this yr", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-12-31" }, "last year", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-12-31" }, "last yr", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2027-01-01" }, "next year", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2027-01-01" }, "next yr", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2027-01-01" }, "current year", referenceDate), false);
  });

  test("matches relative quarter keywords for this/last/next quarter", () => {
    const referenceDate = new Date("2026-02-18T10:00:00.000Z");

    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-03-31" }, "this quarter", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-03-31" }, "this qtr", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-12-31" }, "last quarter", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-12-31" }, "last qtr", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-04-01" }, "next quarter", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-04-01" }, "next qtr", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-04-01" }, "current quarter", referenceDate), false);
  });

  test("matches fiscal year and quarter aliases", () => {
    const referenceDate = new Date("2026-02-18T10:00:00.000Z");

    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-01-02" }, "this fiscal year", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-01-02" }, "this fiscal yr", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-12-31" }, "last fiscal year", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-12-31" }, "last fiscal yr", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2027-01-01" }, "next fiscal year", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2027-01-01" }, "next fiscal yr", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-03-31" }, "this fiscal quarter", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-12-31" }, "previous fiscal quarter", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-04-01" }, "next fiscal quarter", referenceDate), true);
  });

  test("matches explicit quarter period queries like q1 and quarter 1 2026", () => {
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-01" }, "q1"), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-01" }, "quarter 1 2026"), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-05-01" }, "q1 2026"), false);
  });

  test("matches explicit fiscal year shorthand queries like fy2026 and fy26", () => {
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-01" }, "fy2026"), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-01" }, "fy 26"), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-12-31" }, "fy2026"), false);
  });

  test("matches rolling-range keywords for last/past 7/14/30/60/90 days and 2 weeks", () => {
    const referenceDate = new Date("2026-02-21T10:00:00.000Z");

    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-19" }, "last 7 days", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-10" }, "last 14 days", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-08" }, "past 2 weeks", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-10" }, "past 30 days", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-01-01" }, "last 60 days", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-12-01" }, "last 90 days", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-11-01" }, "last 90 days", referenceDate), false);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-12-22" }, "last 60 days", referenceDate), false);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-07" }, "last 14 days", referenceDate), false);
  });

  test("matches tokenized date-range keywords despite punctuation or extra spaces", () => {
    const referenceDate = new Date("2026-02-21T10:00:00.000Z");

    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-10" }, "last-30-days", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-01" }, "month   to   date", referenceDate), true);
  });

  test("does not match rolling-range keywords for future dates", () => {
    const referenceDate = new Date("2026-02-21T10:00:00.000Z");

    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-22" }, "last 7 days", referenceDate), false);
  });

  test("matches upcoming-range keywords for next 7/14/30/60/90 days and 2 weeks", () => {
    const referenceDate = new Date("2026-02-21T10:00:00.000Z");

    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-22" }, "next 7 days", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-03-06" }, "next 2 weeks", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-03-10" }, "next 14 days", referenceDate), false);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-03-20" }, "upcoming 30 days", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-04-15" }, "next 60 days", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-05-15" }, "next 90 days", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-04-23" }, "next 60 days", referenceDate), false);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-05-22" }, "next 90 days", referenceDate), false);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-21" }, "next 7 days", referenceDate), false);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-20" }, "upcoming 7 days", referenceDate), false);
  });

  test("matches period-to-date keywords and shorthands", () => {
    const referenceDate = new Date("2026-02-21T10:00:00.000Z");

    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-16" }, "week to date", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-16" }, "week-to-date", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-01" }, "month-to-date", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-01-10" }, "quarter-to-date", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-01-10" }, "year-to-date", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-01" }, "mtd", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-01-10" }, "qtd", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-01-10" }, "ytd", referenceDate), true);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2025-12-31" }, "ytd", referenceDate), false);
    assert.equal(matchesTransactionSearch({ ...sample, date: "2026-02-22" }, "wtd", referenceDate), false);
  });

  test("returns false when query does not match any field", () => {
    assert.equal(matchesTransactionSearch(sample, "travel"), false);
  });
});
