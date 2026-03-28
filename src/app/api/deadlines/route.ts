import { NextResponse } from "next/server";
import { addDeadline, deleteDeadline, readStore, toggleDeadlineStatus, updateDeadline } from "@/lib/store";

export async function GET() {
  const store = await readStore();
  return NextResponse.json({ deadlines: store.deadlines });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as {
    title?: string;
    dueDate?: string;
    recurring?: "none" | "monthly" | "quarterly";
    notes?: string;
    reminderOffsetsDays?: number[];
  } | null;

  if (!body || !body.title || !body.dueDate) {
    return NextResponse.json({ error: "title and dueDate are required" }, { status: 400 });
  }

  const reminderOffsetsDays = Array.isArray(body.reminderOffsetsDays)
    ? [...new Set(body.reminderOffsetsDays)]
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 120)
        .sort((a, b) => b - a)
    : undefined;

  const created = await addDeadline({
    title: body.title.trim(),
    dueDate: body.dueDate,
    recurring: body.recurring ?? "none",
    reminderOffsetsDays,
    notes: body.notes?.trim() || "",
    status: "open",
  });

  return NextResponse.json({ deadline: created }, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null) as {
    id?: string;
    title?: string;
    dueDate?: string;
    recurring?: "none" | "monthly" | "quarterly";
    status?: "open" | "done";
    notes?: string;
    toggleStatusOnly?: boolean;
  } | null;

  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (body.toggleStatusOnly) {
    const updated = await toggleDeadlineStatus(body.id);
    if (!updated) {
      return NextResponse.json({ error: "deadline not found" }, { status: 404 });
    }
    return NextResponse.json({ deadline: updated });
  }

  const updated = await updateDeadline({
    id: body.id,
    title: body.title?.trim(),
    dueDate: body.dueDate,
    recurring: body.recurring,
    status: body.status,
    notes: body.notes?.trim(),
  });

  if (!updated) {
    return NextResponse.json({ error: "deadline not found" }, { status: 404 });
  }

  return NextResponse.json({ deadline: updated });
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const success = await deleteDeadline(body.id);
  if (!success) {
    return NextResponse.json({ error: "deadline not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
