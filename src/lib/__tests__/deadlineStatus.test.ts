import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildDeadlineStatusLabel,
  dayDiffFromNow,
  formatDeadlineDate,
  getDeadlineStatusLabel,
  sortDeadlinesForDisplay,
} from "@/lib/deadlineStatus";

describe("deadline status helpers", () => {
  test("uses day-level UTC difference so due-today stays due today through the day", () => {
    const now = new Date("2026-02-21T23:59:59Z");

    assert.equal(dayDiffFromNow("2026-02-21", now), 0);
    assert.equal(getDeadlineStatusLabel("2026-02-21", now), "due today");
  });

  test("formats future and overdue labels", () => {
    assert.equal(buildDeadlineStatusLabel(3), "3 days left");
    assert.equal(buildDeadlineStatusLabel(1), "due tomorrow");
    assert.equal(buildDeadlineStatusLabel(-1), "due yesterday");
    assert.equal(buildDeadlineStatusLabel(-4), "4 days overdue");
  });

  test("formats deadline dates in a readable way with invalid fallback", () => {
    assert.equal(formatDeadlineDate("2026-02-21"), "Feb 21, 2026");
    assert.equal(formatDeadlineDate("not-a-date"), "not-a-date");
  });

  test("sorts deadlines for triage: open first, then nearest due date", () => {
    const now = new Date("2026-02-21T10:00:00Z");
    const sorted = sortDeadlinesForDisplay(
      [
        {
          id: "done-1",
          title: "Filed annual report",
          dueDate: "2026-02-10",
          recurring: "none",
          status: "done",
          createdAt: "2026-02-01T00:00:00Z",
        },
        {
          id: "open-2",
          title: "Sales tax payment",
          dueDate: "2026-02-25",
          recurring: "monthly",
          status: "open",
          createdAt: "2026-02-01T00:00:00Z",
        },
        {
          id: "open-1",
          title: "Quarterly estimate",
          dueDate: "2026-02-20",
          recurring: "quarterly",
          status: "open",
          createdAt: "2026-02-01T00:00:00Z",
        },
      ],
      now,
    );

    assert.deepEqual(
      sorted.map((item) => item.id),
      ["open-1", "open-2", "done-1"],
    );
  });
});
