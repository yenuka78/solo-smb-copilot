import { NextResponse } from "next/server";
import { readStore, recordReceivableReminder, incrementReceivableActionCounters, recordReceivableActionEvents } from "@/lib/store";
import { generateReminderDraft } from "@/lib/receivables";
import { Receivable } from "@/lib/types";

function findReceivable(receivables: Receivable[], id: string): Receivable | null {
  return receivables.find((r) => r.id === id) ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const store = await readStore();
  const receivable = findReceivable(store.receivables, id);

  if (!receivable) {
    return NextResponse.json({ error: "Receivable not found" }, { status: 404 });
  }

  const draft = generateReminderDraft(receivable);
  return NextResponse.json({ draft, receivable });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    ids?: string[];
    channel?: Receivable["lastReminderChannel"];
  } | null;

  const channel = body?.channel ?? "email";

  if (!body?.id && (!Array.isArray(body?.ids) || body.ids.length === 0)) {
    return NextResponse.json({ error: "id or ids[] is required" }, { status: 400 });
  }

  const store = await readStore();

  if (body?.id) {
    const receivable = findReceivable(store.receivables, body.id);

    if (!receivable) {
      return NextResponse.json({ error: "Receivable not found" }, { status: 404 });
    }

    const draft = generateReminderDraft(receivable);
    const updated = await recordReceivableReminder({
      id: receivable.id,
      channel,
      actionType: "log_reminder",
    });

    await incrementReceivableActionCounters({
      keys: ["log_reminder", `reminder_${channel}`],
    });
    await recordReceivableActionEvents([
      {
        receivableId: receivable.id,
        actionType: "log_reminder",
        createdAt: updated?.lastReminderAt ?? new Date().toISOString(),
        channel,
      },
    ]);

    return NextResponse.json({ draft, receivable: updated ?? receivable });
  }

  const ids = [...new Set((body?.ids ?? []).filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
  const matched = store.receivables.filter((receivable) => ids.includes(receivable.id));

  if (matched.length === 0) {
    return NextResponse.json({ error: "No receivables found for provided ids" }, { status: 404 });
  }

  const drafts: Array<{
    id: string;
    customerName: string;
    draft: string;
  }> = [];

  for (const receivable of matched) {
    drafts.push({
      id: receivable.id,
      customerName: receivable.customerName,
      draft: generateReminderDraft(receivable),
    });

    await recordReceivableReminder({
      id: receivable.id,
      channel,
      actionType: "bulk_log_reminder",
    });
  }

  await incrementReceivableActionCounters({
    keys: ["bulk_log_reminder", `reminder_${channel}`],
    amount: drafts.length,
  });
  await recordReceivableActionEvents(
    matched.map((receivable) => ({
      receivableId: receivable.id,
      actionType: "bulk_log_reminder",
      createdAt: new Date().toISOString(),
      channel,
    })),
  );

  return NextResponse.json({
    channel,
    updatedCount: drafts.length,
    drafts,
  });
}
