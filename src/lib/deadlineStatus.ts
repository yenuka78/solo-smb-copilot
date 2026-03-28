import { formatIsoDateForDisplay } from "@/lib/dateDisplay";
import type { Deadline } from "@/lib/types";

type DeadlineLike = Pick<Deadline, "id" | "title" | "dueDate" | "status">;

function startOfUtcDay(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export function dayDiffFromNow(dueDateIso: string, now: Date): number {
  const due = startOfUtcDay(new Date(dueDateIso));
  const current = startOfUtcDay(now);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((due.getTime() - current.getTime()) / msPerDay);
}

function formatDayUnit(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function buildDeadlineStatusLabel(daysLeft: number): string {
  if (daysLeft === 0) return "due today";
  if (daysLeft === 1) return "due tomorrow";
  if (daysLeft === -1) return "due yesterday";
  if (daysLeft < 0) return `${formatDayUnit(Math.abs(daysLeft))} overdue`;
  return `${formatDayUnit(daysLeft)} left`;
}

export function getDeadlineStatusLabel(dueDateIso: string, now: Date): string {
  return buildDeadlineStatusLabel(dayDiffFromNow(dueDateIso, now));
}

export function formatDeadlineDate(dueDateIso: string): string {
  return formatIsoDateForDisplay(dueDateIso);
}

export function sortDeadlinesForDisplay<T extends DeadlineLike>(deadlines: T[], now: Date): T[] {
  return [...deadlines].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "open" ? -1 : 1;
    }

    const aDays = dayDiffFromNow(a.dueDate, now);
    const bDays = dayDiffFromNow(b.dueDate, now);
    if (aDays !== bDays) {
      return aDays - bDays;
    }

    return a.title.localeCompare(b.title);
  });
}
