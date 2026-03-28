import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { matchesTransactionSearch } from "../transactionSearch";

describe("transactionSearch category tokens", () => {
  const referenceDate = new Date("2026-02-23T07:18:00Z");

  const tx = {
    id: "1",
    amount: 100,
    date: "2026-02-23",
    type: "revenue" as const,
    category: "Consulting Services",
    description: "Project fee",
  };

  test("matches category by exact string (lowercase)", () => {
    assert.equal(matchesTransactionSearch(tx, "consulting services", referenceDate), true);
  });

  test("matches category by partial string", () => {
    assert.equal(matchesTransactionSearch(tx, "consult", referenceDate), true);
  });

  test("matches category with normalized punctuation/spacing in query", () => {
    // query "consulting-services" should be normalized to "consulting services" for comparison
    // if category is "Consulting Services"
    assert.equal(matchesTransactionSearch(tx, "consulting-services", referenceDate), true);
  });

  test("matches category with extra spaces in query", () => {
    assert.equal(matchesTransactionSearch(tx, "consulting    services", referenceDate), true);
  });
});
