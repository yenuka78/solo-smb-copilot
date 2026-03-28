import { NextResponse } from "next/server";
import {
  readStore,
  addReceivable,
  updateReceivable,
  deleteReceivable,
  incrementReceivableActionCounters,
  recordReceivableActionEvents,
} from "@/lib/store";
import { buildReceivablesQueue } from "@/lib/receivables";
import { buildReceivableAnalytics } from "@/lib/receivableAnalytics";
import type { ReceivableStatus } from "@/lib/types";

type ReceivableAction =
  | "update"
  | "mark_paid"
  | "mark_partial"
  | "snooze"
  | "set_promise_date"
  | "bulk_mark_paid"
  | "bulk_snooze";

const allowedStatuses: ReceivableStatus[] = ["pending", "partial", "paid", "overdue"];

function isValidIsoDate(date: unknown): date is string {
  if (typeof date !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === date;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export async function GET() {
  const store = await readStore();
  const queue = buildReceivablesQueue(store.receivables, new Date(), store.receivableActionEvents, {
    maxRecommendedConfidence: store.settings.receivableRecommendationCalibration?.maxRecommendedConfidence,
  });
  const analytics = buildReceivableAnalytics({
    counters: store.receivableActionCounters,
    events: store.receivableActionEvents,
    receivables: store.receivables,
    now: new Date(),
  });

  return NextResponse.json({
    ...queue,
    analytics,
    recommendationCalibration: store.settings.receivableRecommendationCalibration ?? null,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      customerName?: unknown;
      amount?: unknown;
      amountPaid?: unknown;
      dueDate?: unknown;
      status?: unknown;
      description?: unknown;
      notes?: unknown;
      promiseDate?: unknown;
      nextFollowUpDate?: unknown;
    };

    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const amount = parseAmount(body.amount);
    const amountPaid = body.amountPaid === undefined ? 0 : parseAmount(body.amountPaid);

    if (!customerName || amount === null || amount < 0 || amountPaid === null || amountPaid < 0) {
      return NextResponse.json({ error: "Invalid customer/amount fields" }, { status: 400 });
    }

    if (!isValidIsoDate(body.dueDate)) {
      return NextResponse.json({ error: "Valid dueDate (YYYY-MM-DD) is required" }, { status: 400 });
    }

    if (body.promiseDate !== undefined && body.promiseDate !== null && !isValidIsoDate(body.promiseDate)) {
      return NextResponse.json({ error: "promiseDate must be YYYY-MM-DD" }, { status: 400 });
    }

    if (body.nextFollowUpDate !== undefined && body.nextFollowUpDate !== null && !isValidIsoDate(body.nextFollowUpDate)) {
      return NextResponse.json({ error: "nextFollowUpDate must be YYYY-MM-DD" }, { status: 400 });
    }

    let status: ReceivableStatus;
    if (typeof body.status === "string" && allowedStatuses.includes(body.status as ReceivableStatus)) {
      status = body.status as ReceivableStatus;
    } else if (amountPaid >= amount) {
      status = "paid";
    } else if (amountPaid > 0) {
      status = "partial";
    } else {
      status = "pending";
    }

    const receivable = await addReceivable({
      customerName,
      amount,
      amountPaid,
      dueDate: body.dueDate,
      status,
      description: typeof body.description === "string" ? body.description.trim() : undefined,
      notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
      promiseDate: body.promiseDate ?? undefined,
      nextFollowUpDate: body.nextFollowUpDate ?? undefined,
    });

    return NextResponse.json(receivable);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: unknown;
      ids?: unknown;
      action?: unknown;
      customerName?: unknown;
      amount?: unknown;
      amountPaid?: unknown;
      dueDate?: unknown;
      status?: unknown;
      description?: unknown;
      notes?: unknown;
      promiseDate?: unknown;
      nextFollowUpDate?: unknown;
      paymentAmount?: unknown;
    };

    const action: ReceivableAction =
      typeof body.action === "string" ? (body.action as ReceivableAction) : "update";
    const actionAt = new Date().toISOString();
    const store = await readStore();

    if (action === "bulk_mark_paid" || action === "bulk_snooze") {
      const ids = Array.isArray(body.ids)
        ? body.ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];

      if (ids.length === 0) {
        return NextResponse.json({ error: "ids[] is required for bulk actions" }, { status: 400 });
      }

      if (action === "bulk_snooze" && !isValidIsoDate(body.nextFollowUpDate)) {
        return NextResponse.json({ error: "nextFollowUpDate (YYYY-MM-DD) is required" }, { status: 400 });
      }
      const bulkSnoozeDate = action === "bulk_snooze" ? (body.nextFollowUpDate as string) : undefined;

      const uniqueIds = [...new Set(ids)];
      const matching = store.receivables.filter((receivable) => uniqueIds.includes(receivable.id));
      if (matching.length === 0) {
        return NextResponse.json({ error: "No receivables found for provided ids" }, { status: 404 });
      }

      const updatedIds: string[] = [];

      for (const receivable of matching) {
        const updated =
          action === "bulk_mark_paid"
            ? await updateReceivable({
                id: receivable.id,
                amountPaid: receivable.amount,
                status: "paid",
                nextFollowUpDate: null,
                lastActionAt: actionAt,
                lastActionType: "bulk_mark_paid",
              })
            : await updateReceivable({
                id: receivable.id,
                nextFollowUpDate: bulkSnoozeDate,
                lastActionAt: actionAt,
                lastActionType: "bulk_snooze",
              });

        if (updated) {
          updatedIds.push(updated.id);
        }
      }

      await incrementReceivableActionCounters({
        keys: [action],
        amount: updatedIds.length,
      });

      await recordReceivableActionEvents(
        matching.map((receivable) => ({
          receivableId: receivable.id,
          actionType: action,
          createdAt: actionAt,
          amountCollected:
            action === "bulk_mark_paid"
              ? Math.max(0, receivable.amount - receivable.amountPaid)
              : undefined,
        })),
      );

      return NextResponse.json({
        action,
        updatedCount: updatedIds.length,
        updatedIds,
      });
    }

    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const current = store.receivables.find((receivable) => receivable.id === id);

    if (!current) {
      return NextResponse.json({ error: "Receivable not found" }, { status: 404 });
    }

    if (action === "mark_paid") {
      const updated = await updateReceivable({
        id,
        amountPaid: current.amount,
        status: "paid",
        nextFollowUpDate: null,
        lastActionAt: actionAt,
        lastActionType: "mark_paid",
      });

      if (updated) {
        await incrementReceivableActionCounters({ keys: ["mark_paid"] });
        await recordReceivableActionEvents([
          {
            receivableId: id,
            actionType: "mark_paid",
            createdAt: actionAt,
            amountCollected: Math.max(0, current.amount - current.amountPaid),
          },
        ]);
      }

      return NextResponse.json(updated);
    }

    if (action === "mark_partial") {
      const paymentAmount = parseAmount(body.paymentAmount);
      if (paymentAmount === null || paymentAmount <= 0) {
        return NextResponse.json({ error: "paymentAmount must be greater than 0" }, { status: 400 });
      }

      const nextPaid = Math.min(current.amount, current.amountPaid + paymentAmount);
      const nextStatus: ReceivableStatus = nextPaid >= current.amount ? "paid" : "partial";

      const updated = await updateReceivable({
        id,
        amountPaid: nextPaid,
        status: nextStatus,
        nextFollowUpDate: nextStatus === "paid" ? null : current.nextFollowUpDate ?? null,
        lastActionAt: actionAt,
        lastActionType: "mark_partial",
      });

      if (updated) {
        await incrementReceivableActionCounters({ keys: ["mark_partial"] });
        await recordReceivableActionEvents([
          {
            receivableId: id,
            actionType: "mark_partial",
            createdAt: actionAt,
            amountCollected: paymentAmount,
          },
        ]);
      }

      return NextResponse.json(updated);
    }

    if (action === "snooze") {
      if (!isValidIsoDate(body.nextFollowUpDate)) {
        return NextResponse.json({ error: "nextFollowUpDate (YYYY-MM-DD) is required" }, { status: 400 });
      }

      const updated = await updateReceivable({
        id,
        nextFollowUpDate: body.nextFollowUpDate,
        lastActionAt: actionAt,
        lastActionType: "snooze",
      });

      if (updated) {
        await incrementReceivableActionCounters({ keys: ["snooze"] });
        await recordReceivableActionEvents([
          {
            receivableId: id,
            actionType: "snooze",
            createdAt: actionAt,
          },
        ]);
      }

      return NextResponse.json(updated);
    }

    if (action === "set_promise_date") {
      if (body.promiseDate !== null && !isValidIsoDate(body.promiseDate)) {
        return NextResponse.json({ error: "promiseDate must be YYYY-MM-DD or null" }, { status: 400 });
      }

      const updated = await updateReceivable({
        id,
        promiseDate: body.promiseDate ?? null,
        lastActionAt: actionAt,
        lastActionType: "set_promise_date",
      });

      if (updated) {
        await incrementReceivableActionCounters({ keys: ["set_promise_date"] });
        await recordReceivableActionEvents([
          {
            receivableId: id,
            actionType: "set_promise_date",
            createdAt: actionAt,
          },
        ]);
      }

      return NextResponse.json(updated);
    }

    const patch: Parameters<typeof updateReceivable>[0] = {
      id,
      lastActionAt: actionAt,
      lastActionType: "update",
    };

    if (body.customerName !== undefined) {
      if (typeof body.customerName !== "string" || !body.customerName.trim()) {
        return NextResponse.json({ error: "customerName must be a non-empty string" }, { status: 400 });
      }
      patch.customerName = body.customerName.trim();
    }

    if (body.amount !== undefined) {
      const amount = parseAmount(body.amount);
      if (amount === null || amount < 0) {
        return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
      }
      patch.amount = amount;
    }

    if (body.amountPaid !== undefined) {
      const amountPaid = parseAmount(body.amountPaid);
      if (amountPaid === null || amountPaid < 0) {
        return NextResponse.json({ error: "amountPaid must be a non-negative number" }, { status: 400 });
      }
      patch.amountPaid = amountPaid;
    }

    if (body.dueDate !== undefined) {
      if (!isValidIsoDate(body.dueDate)) {
        return NextResponse.json({ error: "dueDate must be YYYY-MM-DD" }, { status: 400 });
      }
      patch.dueDate = body.dueDate;
    }

    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !allowedStatuses.includes(body.status as ReceivableStatus)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      patch.status = body.status as ReceivableStatus;
    }

    if (body.description !== undefined) {
      patch.description = body.description === null ? null : String(body.description);
    }

    if (body.notes !== undefined) {
      patch.notes = body.notes === null ? null : String(body.notes);
    }

    if (body.promiseDate !== undefined) {
      if (body.promiseDate !== null && !isValidIsoDate(body.promiseDate)) {
        return NextResponse.json({ error: "promiseDate must be YYYY-MM-DD or null" }, { status: 400 });
      }
      patch.promiseDate = body.promiseDate ?? null;
    }

    if (body.nextFollowUpDate !== undefined) {
      if (body.nextFollowUpDate !== null && !isValidIsoDate(body.nextFollowUpDate)) {
        return NextResponse.json({ error: "nextFollowUpDate must be YYYY-MM-DD or null" }, { status: 400 });
      }
      patch.nextFollowUpDate = body.nextFollowUpDate ?? null;
    }

    const effectiveAmount = patch.amount ?? current.amount;
    const effectiveAmountPaid = patch.amountPaid ?? current.amountPaid;
    if (effectiveAmountPaid > effectiveAmount) {
      return NextResponse.json({ error: "amountPaid cannot exceed amount" }, { status: 400 });
    }

    if (patch.status === undefined && (patch.amount !== undefined || patch.amountPaid !== undefined)) {
      if (effectiveAmountPaid >= effectiveAmount) patch.status = "paid";
      else if (effectiveAmountPaid > 0) patch.status = "partial";
      else patch.status = "pending";
    }

    const updated = await updateReceivable(patch);
    if (!updated) {
      return NextResponse.json({ error: "Receivable not found" }, { status: 404 });
    }

    await incrementReceivableActionCounters({ keys: ["update"] });
    await recordReceivableActionEvents([
      {
        receivableId: id,
        actionType: "update",
        createdAt: actionAt,
      },
    ]);

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const deleted = await deleteReceivable(id);
  if (!deleted) {
    return NextResponse.json({ error: "Receivable not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
