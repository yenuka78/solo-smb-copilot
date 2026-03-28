import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requirePremiumAccess } from "@/lib/billing/guard";
import { buildMonthlyExportArtifacts } from "@/lib/export";
import { buildSummary } from "@/lib/finance";
import { readStore } from "@/lib/store";

export async function POST(req: Request) {
  const gate = await requirePremiumAccess(req, { feature: "monthly export" });
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as { month?: string };
  const monthInput = body.month ?? new Date().toISOString().slice(0, 7); // YYYY-MM

  if (!/^\d{4}-\d{2}$/.test(monthInput)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }

  const [yearStr, monthStr] = monthInput.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const store = await readStore();
  const monthTransactions = store.transactions.filter((tx) => {
    const d = new Date(tx.date);
    return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month;
  });

  const monthDeadlines = store.deadlines.filter((d) => d.dueDate.startsWith(monthInput));
  const monthReceivables = store.receivables.filter((r) => r.dueDate.startsWith(monthInput));

  const summary = buildSummary(monthTransactions, monthDeadlines, monthReceivables, store.settings);
  const artifacts = buildMonthlyExportArtifacts({
    month: monthInput,
    currency: store.settings.currency,
    transactions: monthTransactions,
    deadlines: monthDeadlines,
    receivables: monthReceivables,
    summary,
  });

  const exportDir = path.join(process.cwd(), "data", "exports");
  await mkdir(exportDir, { recursive: true });

  const baseName = `${monthInput}-${Date.now()}`;
  const csvPath = path.join(exportDir, `${baseName}.csv`);
  const jsonPath = path.join(exportDir, `${baseName}.json`);
  const markdownPath = path.join(exportDir, `${baseName}.md`);

  await Promise.all([
    writeFile(csvPath, artifacts.csv, "utf8"),
    writeFile(jsonPath, JSON.stringify(artifacts.json, null, 2), "utf8"),
    writeFile(markdownPath, artifacts.markdown, "utf8"),
  ]);

  const files = [csvPath, jsonPath, markdownPath].map((fullPath) => path.basename(fullPath));

  return NextResponse.json({
    export: {
      month: monthInput,
      transactionCount: monthTransactions.length,
      csvFile: path.basename(csvPath),
      summaryFile: path.basename(jsonPath),
      markdownFile: path.basename(markdownPath),
      files,
    },
    summary: artifacts.json.summary,
  });
}
