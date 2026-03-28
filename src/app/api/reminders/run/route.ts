import { NextResponse } from "next/server";
import { requirePremiumAccess } from "@/lib/billing/guard";
import {
  createEmailProvider,
  createPreviewProvider,
  runReminderDispatch,
  type ReminderProviderName,
} from "@/lib/reminders";
import { readStore, recordReminderDispatches } from "@/lib/store";

type ReminderRunMode = "dry-run" | "send";

type RunRemindersPayload = {
  provider?: ReminderProviderName;
  mode?: ReminderRunMode;
  send?: boolean; // backwards-compatible alias for mode=send
  to?: string;
};

function resolveMode(body: RunRemindersPayload | null): ReminderRunMode {
  if (body?.mode) return body.mode;
  return body?.send ? "send" : "dry-run";
}

export async function POST(req: Request) {
  const gate = await requirePremiumAccess(req, { feature: "reminder dispatch" });
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => null)) as RunRemindersPayload | null;

  const providerName = body?.provider ?? "preview";
  if (!(["preview", "email"] as const).includes(providerName)) {
    return NextResponse.json({ error: "provider must be preview or email" }, { status: 400 });
  }

  const mode = resolveMode(body);
  if (!(["dry-run", "send"] as const).includes(mode)) {
    return NextResponse.json({ error: "mode must be dry-run or send" }, { status: 400 });
  }

  if (mode === "send" && providerName === "preview") {
    return NextResponse.json(
      { error: "provider=preview only supports dry-run mode. Use provider=email to send." },
      { status: 400 },
    );
  }

  const shouldSend = mode === "send";
  const store = await readStore();

  const provider =
    providerName === "email"
      ? createEmailProvider({ to: body?.to })
      : createPreviewProvider();

  const result = await runReminderDispatch(store, provider, { shouldSend });

  if (result.persistedKeys.length > 0) {
    await recordReminderDispatches(result.dateKey, result.persistedKeys);
  }

  return NextResponse.json({
    provider: result.provider,
    mode,
    dryRun: !result.shouldSend,
    send: result.shouldSend,
    eligible: result.eligible.length,
    suppressed: result.suppressed.length,
    attempted: result.attempted,
    sent: result.dispatched,
    failed: result.failed.map((item) => ({
      deadlineId: item.item.deadlineId,
      deadlineTitle: item.item.deadlineTitle,
      error: item.error,
    })),
    preview: result.preview,
  });
}
