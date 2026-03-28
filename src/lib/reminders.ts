import { buildDeadlineStatusLabel, dayDiffFromNow } from "@/lib/deadlineStatus";
import type { Deadline, Store } from "@/lib/types";

const DEFAULT_REMINDER_OFFSETS_DAYS = [14, 7, 1, 0] as const;

export type ReminderProviderName = "preview" | "email";

export type ReminderProviderPayload = {
  deadline: Deadline;
  daysLeft: number;
  statusLabel: string;
  message: string;
};

export type ReminderProviderResult = {
  ok: boolean;
  provider: ReminderProviderName;
  transportId?: string;
  error?: string;
};

export type ReminderProvider = {
  name: ReminderProviderName;
  send: (payload: ReminderProviderPayload) => Promise<ReminderProviderResult>;
};

export type ReminderDispatchItem = {
  key: string;
  deadlineId: string;
  deadlineTitle: string;
  dueDate: string;
  daysLeft: number;
  reason: string;
  statusLabel: string;
  message: string;
  deadline: Deadline;
};

export type RunReminderDispatchOptions = {
  now?: Date;
  shouldSend?: boolean;
};

export type RunReminderDispatchResult = {
  dateKey: string;
  provider: ReminderProviderName;
  shouldSend: boolean;
  eligible: ReminderDispatchItem[];
  suppressed: ReminderDispatchItem[];
  attempted: number;
  dispatched: number;
  failed: { item: ReminderDispatchItem; error: string }[];
  preview: string[];
  persistedKeys: string[];
};

function normalizeOffsets(offsets: number[] | undefined): number[] {
  const source = offsets && offsets.length > 0 ? offsets : [...DEFAULT_REMINDER_OFFSETS_DAYS];
  const unique = new Set<number>();

  for (const value of source) {
    if (!Number.isInteger(value)) continue;
    if (value < 0 || value > 120) continue;
    unique.add(value);
  }

  return [...unique].sort((a, b) => b - a);
}

function buildReminderMessage(deadline: Deadline, statusLabel: string): string {
  return `Reminder: ${deadline.title} is due on ${deadline.dueDate} (${statusLabel})`;
}

function reminderReason(daysLeft: number, offsets: number[]): string | null {
  if (daysLeft < 0) return "overdue";
  if (offsets.includes(daysLeft)) return `offset:${daysLeft}`;
  return null;
}

function buildSuppressionKey(provider: ReminderProviderName, item: ReminderDispatchItem): string {
  return `${provider}|${item.deadlineId}|${item.reason}`;
}

function readNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function truncate(value: string, maxChars = 300): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}…`;
}

async function readResponseErrorDetail(response: Response): Promise<string> {
  const text = (await response.text().catch(() => "")).trim();
  if (!text) return "";

  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    const detail = parsed.message ?? parsed.error;
    if (detail) return truncate(detail);
  } catch {
    // best-effort fallback to raw body text
  }

  return truncate(text);
}

export function createPreviewProvider(): ReminderProvider {
  return {
    name: "preview",
    async send() {
      return {
        ok: true,
        provider: "preview",
        transportId: `preview-${Date.now()}`,
      };
    },
  };
}

export function createEmailProvider(params?: {
  apiKey?: string;
  from?: string;
  to?: string;
}): ReminderProvider {
  const apiKey = readNonEmpty(params?.apiKey ?? process.env.RESEND_API_KEY);
  const from = readNonEmpty(params?.from ?? process.env.RESEND_FROM);
  const to = readNonEmpty(params?.to ?? process.env.RESEND_TO);

  return {
    name: "email",
    async send(payload) {
      const missing: string[] = [];
      if (!apiKey) missing.push("RESEND_API_KEY");
      if (!from) missing.push("RESEND_FROM");
      if (!to) missing.push("RESEND_TO");

      if (missing.length > 0) {
        return {
          ok: false,
          provider: "email",
          error: `Email provider is not configured for send mode. Missing: ${missing.join(", ")}`,
        };
      }

      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to,
            subject: `Deadline reminder: ${payload.deadline.title} (${payload.statusLabel})`,
            text: payload.message,
          }),
        });
      } catch (error) {
        return {
          ok: false,
          provider: "email",
          error: `Resend request failed (network): ${errorMessage(error)}`,
        };
      }

      if (!response.ok) {
        const detail = await readResponseErrorDetail(response);
        return {
          ok: false,
          provider: "email",
          error: `Resend request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""})${detail ? `: ${detail}` : ""}`,
        };
      }

      const body = (await response.json().catch(() => null)) as { id?: string } | null;
      return {
        ok: true,
        provider: "email",
        transportId: body?.id,
      };
    },
  };
}

export function collectEligibleReminders(deadlines: Deadline[], now: Date): ReminderDispatchItem[] {
  return deadlines
    .filter((deadline) => deadline.status === "open")
    .map((deadline) => {
      const daysLeft = dayDiffFromNow(deadline.dueDate, now);
      const offsets = normalizeOffsets(deadline.reminderOffsetsDays);
      const reason = reminderReason(daysLeft, offsets);

      if (!reason) return null;

      const statusLabel = buildDeadlineStatusLabel(daysLeft);
      return {
        key: `${deadline.id}|${reason}`,
        deadlineId: deadline.id,
        deadlineTitle: deadline.title,
        dueDate: deadline.dueDate,
        daysLeft,
        reason,
        statusLabel,
        message: buildReminderMessage(deadline, statusLabel),
        deadline,
      } satisfies ReminderDispatchItem;
    })
    .filter((item): item is ReminderDispatchItem => item !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export async function runReminderDispatch(
  store: Store,
  provider: ReminderProvider,
  options?: RunReminderDispatchOptions,
): Promise<RunReminderDispatchResult> {
  const now = options?.now ?? new Date();
  const shouldSend = options?.shouldSend ?? false;
  const dateKey = now.toISOString().slice(0, 10);
  const alreadySent = new Set(store.reminderDispatches[dateKey] ?? []);

  const eligible = collectEligibleReminders(store.deadlines, now);
  const suppressed: ReminderDispatchItem[] = [];
  const toDispatch: ReminderDispatchItem[] = [];

  for (const item of eligible) {
    const suppressionKey = buildSuppressionKey(provider.name, item);
    if (alreadySent.has(suppressionKey)) {
      suppressed.push(item);
      continue;
    }
    toDispatch.push(item);
  }

  const failed: { item: ReminderDispatchItem; error: string }[] = [];
  const persistedKeys: string[] = [];
  let dispatched = 0;

  for (const item of toDispatch) {
    if (!shouldSend) continue;

    let result: ReminderProviderResult;
    try {
      result = await provider.send({
        deadline: item.deadline,
        daysLeft: item.daysLeft,
        statusLabel: item.statusLabel,
        message: item.message,
      });
    } catch (error) {
      failed.push({ item, error: `Unexpected reminder provider exception: ${errorMessage(error)}` });
      continue;
    }

    if (!result.ok) {
      failed.push({ item, error: result.error ?? "unknown reminder provider error" });
      continue;
    }

    dispatched += 1;
    persistedKeys.push(buildSuppressionKey(provider.name, item));
  }

  return {
    dateKey,
    provider: provider.name,
    shouldSend,
    eligible,
    suppressed,
    attempted: shouldSend ? toDispatch.length : 0,
    dispatched,
    failed,
    preview: toDispatch.map((item) => item.message),
    persistedKeys,
  };
}
