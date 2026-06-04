import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  convertToModelMessages,
  UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { mistral } from "@ai-sdk/mistral";
import { groq } from "@ai-sdk/groq";
import { spawn } from "node:child_process";
import { readStore } from "@/lib/store";
import type { LanguageModel } from "ai";

export const maxDuration = 30;

const LITERT_LM_COMMAND = process.env.LITERT_LM_COMMAND || `${process.env.HOME || "/home/yenuka"}/.local/bin/litert-lm`;
const LITERT_GEMMA_MODEL_REFS: Record<string, string> = {
  "gemma4:e2b": process.env.LITERT_GEMMA4_E2B_REF || "gemma4-e2b-it",
  "gemma4:e4b": process.env.LITERT_GEMMA4_E4B_REF || process.env.LITERT_GEMMA4_E2B_REF || "gemma4-e2b-it",
};
const LOCAL_GEMMA_FALLBACK_MODEL = "gemma4:e2b";
const LOCAL_GEMMA_MODELS = ["gemma4:e2b", "gemma4:e4b"] as const;

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

const DEFAULT_MODEL = "gemma4:e2b";
const ALL_MODEL_IDS = new Set<string>([...Object.keys(MODEL_MAP), ...LOCAL_GEMMA_MODELS]);

function hasProviderKey(provider: "openai" | "anthropic" | "google" | "mistral" | "groq"): boolean {
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === "google") return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  if (provider === "mistral") return Boolean(process.env.MISTRAL_API_KEY);
  return Boolean(process.env.GROQ_API_KEY);
}

function providerForModel(modelId: string): "openai" | "anthropic" | "google" | "mistral" | "groq" | null {
  if (modelId.startsWith("gemma")) return null;
  if (modelId.startsWith("gpt-")) return "openai";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("mistral-")) return "mistral";
  if (modelId.startsWith("llama-")) return "groq";
  return null;
}

function isOllamaModel(modelId: string): boolean {
  return modelId.startsWith("gemma");
}

function normalizeModelId(requestedModelId: string): string {
  return ALL_MODEL_IDS.has(requestedModelId) ? requestedModelId : DEFAULT_MODEL;
}

function resolveRemoteModelId(requestedModelId: string): string {
  const requested = MODEL_MAP[requestedModelId] ? requestedModelId : "gpt-4o-mini";
  const provider = providerForModel(requested);

  if (provider && hasProviderKey(provider)) {
    return requested;
  }

  if (hasProviderKey("openai")) return "gpt-4o-mini";
  if (hasProviderKey("anthropic")) return "claude-haiku-4-5";
  if (hasProviderKey("google")) return "gemini-2.0-flash";
  if (hasProviderKey("mistral")) return "mistral-large";
  if (hasProviderKey("groq")) return "llama-3.3-70b";

  return "gpt-4o-mini";
}

function listLocalGemmaCandidates(requestedModelId: string): string[] {
  const ordered = [
    requestedModelId,
    LOCAL_GEMMA_FALLBACK_MODEL,
    ...LOCAL_GEMMA_MODELS,
  ];

  return ordered.filter((modelId, index) => isOllamaModel(modelId) && ordered.indexOf(modelId) === index);
}

function extractMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function buildLiteRtPrompt(messages: UIMessage[], systemPrompt: string): string {
  const conversation = messages
    .map((message) => {
      const text = extractMessageText(message);
      if (!text) return "";
      return `${message.role.toUpperCase()}: ${text}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return `${systemPrompt}\n\n${conversation}\n\nASSISTANT:`;
}

function createChatErrorResponse(message: string, messages: UIMessage[]) {
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: ({ writer }) => {
      writer.write({ type: "error", errorText: message });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

async function streamLocalGemma(messages: UIMessage[], requestedModelId: string, systemPrompt: string) {
  const prompt = buildLiteRtPrompt(messages, systemPrompt);
  let lastError: unknown = new Error("No local Gemma model candidates available");

  for (const modelId of listLocalGemmaCandidates(requestedModelId)) {
    try {
      const modelRef = LITERT_GEMMA_MODEL_REFS[modelId];

      if (!modelRef) {
        lastError = new Error(`LiteRT-LM model ref is not configured for ${modelId}`);
        continue;
      }

      const stream = createUIMessageStream({
        originalMessages: messages,
        execute: ({ writer }) =>
          new Promise<void>((resolve, reject) => {
            const child = spawn(
              LITERT_LM_COMMAND,
              ["run", modelRef, "--backend=cpu", `--prompt=${prompt}`],
              { env: process.env }
            );

            let stderr = "";
            const textPartId = crypto.randomUUID();
            writer.write({ type: "text-start", id: textPartId });

            child.stdout.on("data", (chunk: Buffer | string) => {
              const delta = chunk.toString();
              if (delta) {
                writer.write({ type: "text-delta", id: textPartId, delta });
              }
            });

            child.stderr.on("data", (chunk: Buffer | string) => {
              stderr += chunk.toString();
            });

            child.on("error", (error) => {
              reject(error);
            });

            child.on("close", (code) => {
              if (code === 0) {
                writer.write({ type: "text-end", id: textPartId });
                resolve();
                return;
              }

              reject(new Error(stderr.trim() || `LiteRT-LM exited with code ${code}`));
            });
          }),
      });

      return createUIMessageStreamResponse({ stream });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
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

  return `You are a helpful financial copilot for a solo small business owner. You have real-time access to their business data and should give practical, trustworthy advice without sounding robotic.

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
- Match the user's tone and level of detail
- Be concise by default, but expand when the user wants explanation, planning, or brainstorming
- Lead with the bottom line for urgent topics like cash, overdue invoices, taxes, deadlines, or risk
- For open-ended questions, be conversational and useful rather than rigid
- Flag important risks proactively, but do not over-dramatize
- Suggest specific next actions when helpful, but do not force action items into every answer
- If the request is ambiguous, ask one short clarifying question instead of guessing
- When the numbers support a clear conclusion, say so plainly
- When the data is incomplete, say what is missing and make a reasonable best-effort suggestion
- Use ${currency} for all amounts
- Today's date: ${now.toISOString().slice(0, 10)}`;
}

export async function POST(req: Request) {
  try {
    const { messages, model: modelId = DEFAULT_MODEL }: { messages: UIMessage[]; model?: string } =
      await req.json();

    const store = await readStore();
    const systemPrompt = buildSystemPrompt(store);
    const normalizedModelId = normalizeModelId(modelId);

    if (isOllamaModel(normalizedModelId)) {
      try {
        return await streamLocalGemma(messages, normalizedModelId, systemPrompt);
      } catch (error) {
        console.warn("[chat/route] local Gemma via LiteRT-LM failed:", error);
        const errorMessage =
          error instanceof Error && /ENOENT|not found/i.test(error.message)
            ? `LiteRT-LM is not installed on the server. Install the ${LITERT_LM_COMMAND} CLI first.`
            : error instanceof Error && /No such file|not configured/i.test(error.message)
              ? "Local Gemma is not imported into LiteRT-LM yet."
              : "Local Gemma request failed. Check the server logs and your LiteRT-LM setup.";

        return createChatErrorResponse(errorMessage, messages);
      }
    }

    const resolvedModelId = resolveRemoteModelId(normalizedModelId);
    const selectedModel = MODEL_MAP[resolvedModelId];

    if (!selectedModel) {
      return await streamLocalGemma(messages, LOCAL_GEMMA_FALLBACK_MODEL, systemPrompt);
    }

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
