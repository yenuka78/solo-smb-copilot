import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatIsoDateForDisplay } from "@/lib/dateDisplay";

describe("date display helper", () => {
  test("formats ISO date strings to short readable labels", () => {
    assert.equal(formatIsoDateForDisplay("2026-02-21"), "Feb 21, 2026");
  });

  test("formats full ISO datetime strings to readable date labels", () => {
    assert.equal(formatIsoDateForDisplay("2026-02-21T19:45:00Z"), "Feb 21, 2026");
  });

  test("keeps original value for invalid date input", () => {
    assert.equal(formatIsoDateForDisplay("not-a-date"), "not-a-date");
  });

  test("keeps original value for impossible calendar dates", () => {
    assert.equal(formatIsoDateForDisplay("2026-02-30"), "2026-02-30");
    assert.equal(formatIsoDateForDisplay("2026-02-30T10:00:00Z"), "2026-02-30T10:00:00Z");
  });
});
