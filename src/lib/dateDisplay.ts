function isValidDateParts(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
  );
}

export function formatIsoDateForDisplay(dateIso: string): string {
  const leadingDateMatch = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);

  if (leadingDateMatch) {
    const [, yearRaw, monthRaw, dayRaw] = leadingDateMatch;
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);

    if (!isValidDateParts(year, month, day)) {
      return dateIso;
    }
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(dateIso)
    ? new Date(`${dateIso}T00:00:00Z`)
    : new Date(dateIso);

  if (Number.isNaN(parsed.getTime())) {
    return dateIso;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function getRelativeDateLabel(dateIso: string, referenceDate: Date = new Date()): string | null {
  const match = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const txDay = match[0];
  const refDay = referenceDate.toISOString().slice(0, 10);

  if (txDay === refDay) return "Today";

  const yesterday = new Date(referenceDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDay = yesterday.toISOString().slice(0, 10);
  if (txDay === yesterdayDay) return "Yesterday";

  const tomorrow = new Date(referenceDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDay = tomorrow.toISOString().slice(0, 10);
  if (txDay === tomorrowDay) return "Tomorrow";

  return null;
}
