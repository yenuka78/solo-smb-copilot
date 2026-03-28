import { streamText, convertToModelMessages, UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { mistral } from "@ai-sdk/mistral";
import { groq } from "@ai-sdk/groq";
import { readStore } from "@/lib/store";
import type { LanguageModel } from "ai";

export const maxDuration = 30;

const MODEL_MAP: Record<string, LanguageModel> = {
  "gpt-4o-mini": openai("gpt-4o-mini"),
  "gpt-4o": openai("gpt-4o"),
  "claude-haiku-4-5": anthropic("claude-haiku-4-5-20251001"),
  "claude-sonnet-4-5": anthropic("claude-sonnet-4-5"),
  "gemini-2.0-flash": google("gemini-2.0-flash"),
  "gemini-1.5-pro": google("gemini-1.5-pro"),
  "mistral-large": mistral("mistral-large-latest"),
  "llama-3.3-70b": groq("llama-3.3-70b-versatile"),
};

const DEFAULT_MODEL = "gpt-4o-mini";

function resolveModel(modelId: string): LanguageModel {
  return MODEL_MAP[modelId] ?? MODEL_MAP[DEFAULT_MODEL];
}

function buildSystemPrompt(store: Awaited<ReturnType<typeof readStore>>): string {
  const now = new Date();
  const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  // Current month financials
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthTx = store.transactions.filter((tx) => new Date(tx.date) >= startOfMonth);
  const revenue = monthTx.filter((tx) => tx.type === "revenue").reduce((s, tx) => s + tx.amount, 0);
  const expenses = monthTx.filter((tx) => tx.type === "expense").reduce((s, tx) => s + tx.amount, 0);
  const profit = revenue - expenses;
  const taxReserve = profit > 0 ? profit * (store.settings.taxReserveRate ?? 0.25) : 0;

  // Overdue / upcoming deadlines
  const overdueDeadlines = store.deadlines.filter(
    (d) => d.status === "open" && new Date(d.dueDate) < now
  );
  const upcomingDeadlines = store.deadlines.filter((d) => {
    if (d.status !== "open") return false;
    const diff = (new Date(d.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  });

  // Receivables
  const openReceivables = store.receivables.filter((r) => r.status !== "paid");
  const overdueReceivables = openReceivables.filter((r) => new Date(r.dueDate) < now);
  const totalOwed = openReceivables.reduce((s, r) => s + (r.amount - r.amountPaid), 0);

  const currency = store.settings.currency ?? "USD";
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 });

  return `You are an expert financial copilot for a solo small business owner. You have real-time access to their business data and give concise, actionable advice.

## Current Business Snapshot (${monthName})
- Revenue: ${fmt(revenue)}
- Expenses: ${fmt(expenses)}
- Profit: ${fmt(profit)} (${revenue > 0 ? Math.round((profit / revenue) * 100) : 0}% margin)
- Recommended tax reserve: ${fmt(taxReserve)} (${Math.round((store.settings.taxReserveRate ?? 0.25) * 100)}% rate)
- Cash balance: ${store.settings.currentCashBalance != null ? fmt(store.settings.currentCashBalance) : "not set"}
- Revenue goal: ${store.settings.monthlyRevenueGoal != null ? fmt(store.settings.monthlyRevenueGoal) : "not set"}
- Expense limit: ${store.settings.monthlyExpenseLimit != null ? fmt(store.settings.monthlyExpenseLimit) : "not set"}

## Receivables
- Open invoices: ${openReceivables.length} totaling ${fmt(totalOwed)}
- Overdue: ${overdueReceivables.length} invoices
${overdueReceivables.slice(0, 5).map((r) => `  - ${r.customerName}: ${fmt(r.amount - r.amountPaid)} (due ${r.dueDate.slice(0, 10)})`).join("\n")}

## Compliance Deadlines
- Overdue: ${overdueDeadlines.length}${overdueDeadlines.length > 0 ? ": " + overdueDeadlines.map((d) => d.title).join(", ") : ""}
- Due in next 30 days: ${upcomingDeadlines.length}${upcomingDeadlines.length > 0 ? ": " + upcomingDeadlines.map((d) => `${d.title} (${d.dueDate.slice(0, 10)})`).join(", ") : ""}

## Recent Transactions (last 5)
${store.transactions
  .slice()
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  .slice(0, 5)
  .map((tx) => `- ${tx.date.slice(0, 10)} | ${tx.type} | ${fmt(tx.amount)} | ${tx.category} | ${tx.description}`)
  .join("\n")}

## Guidelines
- Be concise and direct — this is a busy owner checking their phone
- Lead with the bottom line, then explain
- Flag risks proactively
- Suggest specific next actions
- Use ${currency} for all amounts
- Today's date: ${now.toISOString().slice(0, 10)}`;
}

export async function POST(req: Request) {
  try {
    const { messages, model: modelId = DEFAULT_MODEL }: { messages: UIMessage[]; model?: string } =
      await req.json();

    const store = await readStore();
    const systemPrompt = buildSystemPrompt(store);
    const selectedModel = resolveModel(modelId);

    const result = streamText({
      model: selectedModel,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error("[chat/route] error:", err);
    return new Response(JSON.stringify({ error: "Chat failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
