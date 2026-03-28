"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";

const MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "claude-haiku-4-5", label: "Claude Haiku", provider: "Anthropic" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet", provider: "Anthropic" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "Google" },
  { id: "mistral-large", label: "Mistral Large", provider: "Mistral" },
  { id: "llama-3.3-70b", label: "Llama 3.3 70B", provider: "Groq" },
];

const SUGGESTED_PROMPTS = [
  "How am I doing this month?",
  "Which invoices are most at risk?",
  "Should I be worried about cash?",
  "What should I focus on this week?",
  "Am I on track for my revenue goal?",
];

export default function AICopilot() {
  const [open, setOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { model: selectedModel },
    }),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || status === "streaming" || status === "submitted") return;
    sendMessage({ text });
    setInputText("");
  };

  const handleSuggestion = (prompt: string) => {
    sendMessage({ text: prompt });
  };

  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-all hover:bg-indigo-700 hover:scale-105 active:scale-95"
        aria-label="Open AI Copilot"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path d="M16.5 7.5h-9v9h9v-9z" />
            <path fillRule="evenodd" d="M8.25 2.25A.75.75 0 019 3v.75h2.25V3a.75.75 0 011.5 0v.75H15V3a.75.75 0 011.5 0v.75h.75a3 3 0 013 3v.75H21A.75.75 0 0121 9h-.75v2.25H21a.75.75 0 010 1.5h-.75V15H21a.75.75 0 010 1.5h-.75v.75a3 3 0 01-3 3h-.75V21a.75.75 0 01-1.5 0v-.75h-2.25V21a.75.75 0 01-1.5 0v-.75H9V21a.75.75 0 01-1.5 0v-.75h-.75a3 3 0 01-3-3v-.75H3A.75.75 0 013 15h.75v-2.25H3a.75.75 0 010-1.5h.75V9H3a.75.75 0 010-1.5h.75v-.75a3 3 0 013-3h.75V3a.75.75 0 01.75-.75zM6 6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V6.75z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[520px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-indigo-600 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">AI Finance Copilot</h2>
              <p className="text-xs text-indigo-200">Powered by your live business data</p>
            </div>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="rounded-lg border border-indigo-500 bg-indigo-700 px-2 py-1 text-xs text-white focus:outline-none"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-center text-xs text-slate-400 pt-2">Ask anything about your business</p>
                <div className="grid gap-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => handleSuggestion(prompt)}
                      disabled={isStreaming}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-sm"
                      : "bg-slate-100 text-slate-800 rounded-bl-sm"
                  }`}
                >
                  {message.parts.map((part, i) =>
                    part.type === "text" ? (
                      <span key={i} className="whitespace-pre-wrap">{part.text}</span>
                    ) : null
                  )}
                </div>
              </div>
            ))}

            {isStreaming && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                Error: {error.message}. Check that your API key is set in .env.
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 px-3 py-3">
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Ask about your finances..."
                rows={1}
                className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500 text-white hover:bg-red-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                  </svg>
                </button>
              )}
            </form>
            <p className="mt-1.5 text-center text-[10px] text-slate-400">
              {MODELS.find((m) => m.id === selectedModel)?.provider} · Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </>
  );
}
