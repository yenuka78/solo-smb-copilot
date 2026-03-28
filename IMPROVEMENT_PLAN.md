# Solo SMB Copilot — Improvement Plan

## Phase 0: Documentation Discovery ✅ DONE

Discovered the following about the project state:

- **Location:** `/home/yenuka/workspace/projects/solo-smb-copilot`
- **Stack:** Next.js 16.1.6, React 19, TypeScript, Tailwind v4
- **Config:** `next.config.ts` (TypeScript, minimal — must be renamed for PWA)
- **Current deps:** next, react, react-dom, pdf-parse only
- **Persistence:** `data/store.json` (flat-file JSON, no DB)
- **API routes:** 19 routes in `src/app/api/*/route.ts`, all using `readStore()`/`writeStore()` from `src/lib/store.ts`
- **Types:** `src/lib/types.ts` has complete type definitions for Transaction, Deadline, Receivable, Settings
- **Store functions:** `src/lib/store.ts` exports ~20 async functions

---

## Phase 1: Multi-Provider AI Copilot

**Goal:** Add a real AI chat assistant that works with Claude, OpenAI, Gemini, Mistral, Groq, etc.

**Context for new session:** This is a Next.js 16 + React 19 + TypeScript app. There is no AI integration yet. The app has a `src/lib/store.ts` with functions for reading financial data. We are using the Vercel AI SDK (`ai` package) with `@ai-sdk/react`.

### Step 1 — Install packages

```bash
npm install ai @ai-sdk/react zod @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/mistral @ai-sdk/groq
```

### Step 2 — Create `src/app/api/chat/route.ts`

This is a streaming chat endpoint. Exact implementation:

```typescript
import { streamText, convertToModelMessages, UIMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createGroq } from '@ai-sdk/groq';
import { getFullStore } from '@/lib/store';

function resolveModel(modelString: string) {
  const [provider, ...rest] = modelString.split('/');
  const modelId = rest.join('/');
  switch (provider) {
    case 'openai':   return createOpenAI({ apiKey: process.env.OPENAI_API_KEY! })(modelId);
    case 'anthropic': return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })(modelId);
    case 'google':   return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY! })(modelId);
    case 'mistral':  return createMistral({ apiKey: process.env.MISTRAL_API_KEY! })(modelId);
    case 'groq':     return createGroq({ apiKey: process.env.GROQ_API_KEY! })(modelId);
    default:         return createOpenAI({ apiKey: process.env.OPENAI_API_KEY! })('gpt-4o-mini');
  }
}

export async function POST(req: Request) {
  const { messages, model: modelString = 'openai/gpt-4o-mini' }: { messages: UIMessage[]; model?: string } = await req.json();

  const store = await getFullStore();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthTransactions = store.transactions.filter(t => t.date.startsWith(currentMonth));
  const totalIncome = monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const overdueDeadlines = store.deadlines.filter(d => d.status === 'pending' && new Date(d.dueDate) < now);
  const overdueReceivables = store.receivables.filter(r => r.status === 'overdue');
  const outstandingReceivables = store.receivables.filter(r => ['sent', 'overdue', 'partial'].includes(r.status));
  const outstandingTotal = outstandingReceivables.reduce((s, r) => s + (r.amount - (r.amountPaid ?? 0)), 0);

  const system = `You are a financial copilot for a solo small business owner.

Current date: ${now.toDateString()}
This month (${currentMonth}):
  - Income: ${store.settings.currency ?? 'USD'} ${totalIncome.toFixed(2)}
  - Expenses: ${store.settings.currency ?? 'USD'} ${totalExpenses.toFixed(2)}
  - Net: ${store.settings.currency ?? 'USD'} ${(totalIncome - totalExpenses).toFixed(2)}

Cash balance: ${store.settings.currency ?? 'USD'} ${store.settings.currentCashBalance ?? 0}
Outstanding receivables: ${store.settings.currency ?? 'USD'} ${outstandingTotal.toFixed(2)} across ${outstandingReceivables.length} invoices
Overdue invoices: ${overdueReceivables.length}
Overdue deadlines/taxes: ${overdueDeadlines.map(d => d.title).join(', ') || 'none'}

Be concise, direct, and actionable. Use bullet points. Flag risks clearly.`;

  const result = await streamText({
    model: resolveModel(modelString),
    system,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

**Important notes:**
- `convertToModelMessages` is imported from `'ai'`, not `'@ai-sdk/react'`
- `getFullStore` or equivalent must exist in `src/lib/store.ts` — if the function is named differently, find the one that returns the full store object with `{ transactions, deadlines, receivables, settings }`
- `toUIMessageStreamResponse()` is the correct method for Vercel AI SDK v4+

### Step 3 — Create `src/components/AICopilot.tsx`

```typescript
'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

const MODELS = [
  { label: 'GPT-4o Mini (fast)', value: 'openai/gpt-4o-mini' },
  { label: 'GPT-4o', value: 'openai/gpt-4o' },
  { label: 'Claude Sonnet 4.5', value: 'anthropic/claude-sonnet-4-5' },
  { label: 'Gemini 2.5 Flash', value: 'google/gemini-2.5-flash' },
  { label: 'Mistral Large', value: 'mistral/mistral-large-latest' },
  { label: 'Llama 3.3 70B (free)', value: 'groq/llama-3.3-70b-versatile' },
];

const SUGGESTED = [
  'How am I doing this month?',
  'Which invoices are at risk?',
  'Should I be worried about cash?',
  'What should I focus on this week?',
];

export default function AICopilot() {
  const [selectedModel, setSelectedModel] = useState('openai/gpt-4o-mini');

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    transport: new DefaultChatTransport({
      url: '/api/chat',
      body: { model: selectedModel },
    }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center gap-2">
        <label className="text-sm font-medium text-gray-600">Model:</label>
        <select
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          className="text-sm border rounded px-2 py-1 flex-1"
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500 mb-3">Suggested questions:</p>
            {SUGGESTED.map(q => (
              <button
                key={q}
                onClick={() => handleSubmit(undefined, { data: { content: q } })}
                className="block w-full text-left text-sm bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-2 text-blue-700"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-gray-100 text-gray-800 rounded-bl-sm'
            }`}>
              {m.parts?.map((p, i) => p.type === 'text' ? <span key={i}>{p.text}</span> : null)}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2">
              <span className="text-gray-500 text-sm animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask about your finances..."
          className="flex-1 border rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-blue-600 text-white rounded-full px-4 py-2 text-sm disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

### Step 4 — Add env vars to `.env.example`

Append to `.env.example` (create if missing):

```
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
MISTRAL_API_KEY=
GROQ_API_KEY=
```

### Step 5 — Wire into `src/app/page.tsx`

Add a "Copilot" tab to the existing tab navigation in `page.tsx`:

```typescript
import AICopilot from '@/components/AICopilot';
// In the tab list, add: { id: 'copilot', label: '🤖 Copilot' }
// In the tab content switch, add:
// case 'copilot': return <AICopilot />;
```

### Verification

```bash
npm run build          # must pass with no type errors
npm run dev            # start dev server
# Open http://localhost:3000, navigate to Copilot tab
# Send a message — response must stream in
# Change model — next message must use the selected provider
```

### Anti-patterns to avoid

- Do NOT hardcode a single provider — the `resolveModel()` function handles routing
- Do NOT use `generateText` — it waits for full response; use `streamText` for streaming
- Do NOT import `useChat` from `'ai/react'` — import from `'@ai-sdk/react'`
- Do NOT import `convertToModelMessages` from `'@ai-sdk/react'` — it lives in `'ai'`

---

## Phase 2: PWA — Install on Phone

**Goal:** Make the app installable on Android/iPhone home screen and work offline.

**Context for new session:** This is a Next.js 16 + React 19 + TypeScript app at `/home/yenuka/workspace/projects/solo-smb-copilot`. The config is currently `next.config.ts` (TypeScript). PWA requires renaming it to `next.config.js` (CommonJS) because `withPWA` does not support ESM config.

### Step 1 — Rename config file

```bash
mv next.config.ts next.config.js
```

### Step 2 — Install packages

```bash
npm i @ducanh2912/next-pwa && npm i -D webpack
```

### Step 3 — Rewrite `next.config.js`

Replace the entire file content with:

```javascript
const withPWA = require('@ducanh2912/next-pwa').default;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // preserve any existing options here
};

module.exports = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
})(nextConfig);
```

### Step 4 — Create `src/app/manifest.ts`

```typescript
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Solo SMB Copilot',
    short_name: 'SMB Copilot',
    description: 'Financial copilot for solo business owners',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

### Step 5 — Update `src/app/layout.tsx` metadata

Add to the `metadata` export:

```typescript
export const metadata: Metadata = {
  // ...existing fields...
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SMB Copilot',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};
```

Also add viewport theme color. In Next.js 15+, viewport is separate:

```typescript
import type { Viewport } from 'next';

export const viewport: Viewport = {
  themeColor: '#2563eb',
};
```

### Step 6 — Create `src/app/~offline/page.tsx`

```typescript
export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
      <h1 className="text-2xl font-bold mb-4">You are offline</h1>
      <p className="text-gray-600">SMB Copilot is not available without a connection for this page. Please reconnect and try again.</p>
    </div>
  );
}
```

### Step 7 — Create placeholder icons

```bash
mkdir -p public/icons
# Create simple colored PNG placeholders
# Use any image tool or a script to generate 192x192, 384x384, 512x512 PNG files
# Minimum: copy any PNG and rename. The manifest requires the files to exist.
```

If no image tool is available, use Node to generate minimal PNGs:

```bash
node -e "
const { createCanvas } = require('canvas');
// Or just copy a placeholder image
"
```

Alternatively, download a placeholder from a public URL and place at `public/icons/icon-192.png`, `icon-384.png`, `icon-512.png`.

### Step 8 — Update `.gitignore`

Add these lines:

```
public/sw.js
public/sw.js.map
public/workbox-*.js
public/workbox-*.js.map
```

### Verification

```bash
npm run build && npm start
# Open http://localhost:3000 in Chrome
# DevTools → Application → Service Workers → confirm "Activated and running"
# DevTools → Application → Manifest → confirm no errors
# On Android Chrome: three-dot menu → "Add to Home Screen" should appear
```

### Anti-patterns to avoid

- Do NOT keep `next.config.ts` — `withPWA` requires CommonJS (`require()`), not ESM
- Do NOT enable PWA in development — `disable: process.env.NODE_ENV === 'development'` prevents cache conflicts during dev
- Do NOT commit generated SW files — add them to `.gitignore`

---

## Phase 3: Mobile-First UI Redesign

**Goal:** Transform the monolithic desktop UI into a mobile-friendly tabbed app with bottom navigation.

**Context for new session:** This is a Next.js 16 + React 19 + TypeScript + Tailwind v4 app. The current `src/app/page.tsx` is a monolithic file with all sections. We are extracting it into separate view components and adding a native-feeling bottom navigation bar.

### Step 1 — Create `src/components/BottomNav.tsx`

```typescript
'use client';

const TABS = [
  { id: 'dashboard',    label: 'Dashboard',     icon: '📊' },
  { id: 'transactions', label: 'Transactions',   icon: '💸' },
  { id: 'copilot',      label: 'Copilot',        icon: '🤖' },
  { id: 'receivables',  label: 'Receivables',    icon: '📬' },
  { id: 'more',         label: 'More',           icon: '⋯'  },
] as const;

export type TabId = typeof TABS[number]['id'];

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 flex flex-col items-center py-2 min-h-[56px] text-xs transition-colors ${
            activeTab === tab.id
              ? 'text-blue-600'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <span className="text-xl leading-tight">{tab.icon}</span>
          <span className="mt-0.5 font-medium">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
```

### Step 2 — Create `src/components/layout/AppShell.tsx`

```typescript
'use client';
import { useState } from 'react';
import BottomNav, { TabId } from '@/components/BottomNav';

interface AppShellProps {
  children: (activeTab: TabId) => React.ReactNode;
  title?: string;
}

export default function AppShell({ children, title = 'SMB Copilot' }: AppShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-40"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </header>
      <main className="flex-1 overflow-y-auto pb-20">
        {children(activeTab)}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
```

### Step 3 — Extract view components

Extract each section from the current `src/app/page.tsx` into:

- `src/components/dashboard/DashboardView.tsx` — summary cards (cash, P&L, net), month-over-month chart
- `src/components/transactions/TransactionsView.tsx` — transaction list, add transaction form
- `src/components/receivables/ReceivablesView.tsx` — receivable list, add/update receivable form
- `src/components/deadlines/DeadlinesView.tsx` — deadline list, add deadline form

Each view component should:
1. Fetch its own data (via `fetch('/api/...')`) in a `useEffect` or use SWR
2. Export a default React component
3. Be wrapped in a `<div className="p-4 space-y-4">`

### Step 4 — Rewrite `src/app/page.tsx`

```typescript
import AppShell from '@/components/layout/AppShell';
import DashboardView from '@/components/dashboard/DashboardView';
import TransactionsView from '@/components/transactions/TransactionsView';
import AICopilot from '@/components/AICopilot';
import ReceivablesView from '@/components/receivables/ReceivablesView';
import DeadlinesView from '@/components/deadlines/DeadlinesView';

export default function Home() {
  return (
    <AppShell>
      {(activeTab) => {
        switch (activeTab) {
          case 'dashboard':    return <DashboardView />;
          case 'transactions': return <TransactionsView />;
          case 'copilot':      return <AICopilot />;
          case 'receivables':  return <ReceivablesView />;
          case 'more':         return <DeadlinesView />;
          default:             return <DashboardView />;
        }
      }}
    </AppShell>
  );
}
```

### Step 5 — Mobile UI principles to apply throughout

Apply these rules to all components during extraction:

| Rule | Implementation |
|------|---------------|
| Min touch target 48px | `min-h-[48px]` or `py-3` on all interactive elements |
| Full-width forms | `w-full` on all inputs and form containers |
| Card padding | `p-4` (16px) on all card components |
| No horizontal scroll | `max-w-full overflow-hidden` on outer containers |
| Safe area insets | `pb-[env(safe-area-inset-bottom)]` on fixed bottom elements |
| Readable font size | `text-sm` minimum, `text-base` for primary content |

### Verification

```bash
npm run dev
# Open Chrome DevTools → Toggle device toolbar
# Test on: iPhone SE (375px), Pixel 5 (393px)
# Checklist:
# [ ] All 5 tabs navigate correctly
# [ ] No horizontal scrollbar at any mobile width
# [ ] Buttons/inputs are comfortably tappable (>=48px height)
# [ ] Bottom nav does not overlap content
# [ ] Header stays sticky on scroll
```

---

## Phase 4: Prisma + SQLite Migration

**Goal:** Replace `data/store.json` flat-file persistence with SQLite via Prisma ORM. Enables multi-device readiness and proper querying.

**Context for new session:** This is a Next.js 16 app at `/home/yenuka/workspace/projects/solo-smb-copilot`. All persistence currently uses `src/lib/store.ts` which reads/writes `data/store.json`. We are replacing this with Prisma + SQLite while keeping all API route signatures identical. Types are defined in `src/lib/types.ts`.

### Step 1 — Install Prisma

```bash
npm install -D prisma && npm install @prisma/client
npx prisma init --datasource-provider sqlite
```

This creates `prisma/schema.prisma` and sets `DATABASE_URL="file:./dev.db"` in `.env`.

Update `.env` to use:
```
DATABASE_URL="file:./data/dev.db"
```

### Step 2 — Write `prisma/schema.prisma`

Replace the generated schema with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Transaction {
  id          String   @id @default(cuid())
  type        String   // "income" | "expense"
  amount      Float
  date        String   // ISO date string "YYYY-MM-DD"
  category    String
  description String?
  source      String?
  receiptName String?
  createdAt   DateTime @default(now())
}

model Deadline {
  id                  String   @id @default(cuid())
  title               String
  dueDate             String   // ISO date string
  recurring           String?  // "monthly" | "quarterly" | "annually" | null
  status              String   @default("pending")  // "pending" | "completed" | "dismissed"
  notes               String?
  reminderOffsetsDays String?  // JSON array stored as string: "[7, 3, 1]"
  createdAt           DateTime @default(now())
}

model Receivable {
  id                   String    @id @default(cuid())
  customerName         String
  amount               Float
  amountPaid           Float?    @default(0)
  dueDate              String
  status               String    @default("draft")  // "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled"
  description          String?
  notes                String?
  promiseDate          String?
  nextFollowUpDate     String?
  reminderCount        Int?      @default(0)
  lastReminderAt       DateTime?
  lastReminderChannel  String?
  lastActionAt         DateTime?
  lastActionType       String?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
}

model Settings {
  id                          String  @id @default("singleton")
  taxReserveRate              Float?  @default(0.25)
  currency                    String? @default("USD")
  monthlyRevenueGoal          Float?
  monthlyExpenseLimit         Float?
  currentCashBalance          Float?  @default(0)
  cashBurnRateMultiplier      Float?  @default(1.0)
  receivableCollectionConfidence Float? @default(0.8)
}
```

### Step 3 — Run migration

```bash
npx prisma migrate dev --name init
```

This creates `prisma/migrations/` and generates the Prisma client.

### Step 4 — Create `src/lib/prisma.ts` singleton

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
// NEVER call prisma.$disconnect() in request handlers
```

### Step 5 — Create `src/lib/db.ts`

This is the new persistence layer with the same function signatures as `store.ts`. Implement each function using Prisma:

```typescript
import { prisma } from './prisma';
import type { Transaction, Deadline, Receivable, Settings } from './types';

// Transactions
export async function getTransactions(): Promise<Transaction[]> {
  const rows = await prisma.transaction.findMany({ orderBy: { date: 'desc' } });
  return rows as Transaction[];
}

export async function addTransaction(data: Omit<Transaction, 'id' | 'createdAt'>): Promise<Transaction> {
  const row = await prisma.transaction.create({ data: { ...data, id: crypto.randomUUID() } });
  return row as Transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  await prisma.transaction.delete({ where: { id } });
}

// Deadlines
export async function getDeadlines(): Promise<Deadline[]> {
  const rows = await prisma.deadline.findMany({ orderBy: { dueDate: 'asc' } });
  return rows.map(r => ({
    ...r,
    reminderOffsetsDays: r.reminderOffsetsDays ? JSON.parse(r.reminderOffsetsDays) : [],
  })) as Deadline[];
}

export async function addDeadline(data: Omit<Deadline, 'id' | 'createdAt'>): Promise<Deadline> {
  const row = await prisma.deadline.create({
    data: {
      ...data,
      id: crypto.randomUUID(),
      reminderOffsetsDays: data.reminderOffsetsDays ? JSON.stringify(data.reminderOffsetsDays) : null,
    },
  });
  return { ...row, reminderOffsetsDays: row.reminderOffsetsDays ? JSON.parse(row.reminderOffsetsDays) : [] } as Deadline;
}

// Receivables — implement similarly

// Settings
export async function getSettings(): Promise<Settings> {
  const row = await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  return row as Settings;
}

export async function updateSettings(data: Partial<Settings>): Promise<Settings> {
  const row = await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  });
  return row as Settings;
}
```

Implement all remaining functions from `store.ts` following these patterns.

### Step 6 — Create data migration script `scripts/migrate-store.ts`

```typescript
import { prisma } from '../src/lib/prisma';
import { readFileSync } from 'fs';
import { join } from 'path';

const raw = readFileSync(join(process.cwd(), 'data/store.json'), 'utf-8');
const store = JSON.parse(raw);

async function main() {
  console.log('Migrating transactions...');
  for (const t of store.transactions ?? []) {
    await prisma.transaction.upsert({ where: { id: t.id }, update: t, create: t });
  }

  console.log('Migrating deadlines...');
  for (const d of store.deadlines ?? []) {
    const row = { ...d, reminderOffsetsDays: d.reminderOffsetsDays ? JSON.stringify(d.reminderOffsetsDays) : null };
    await prisma.deadline.upsert({ where: { id: d.id }, update: row, create: row });
  }

  console.log('Migrating receivables...');
  for (const r of store.receivables ?? []) {
    await prisma.receivable.upsert({ where: { id: r.id }, update: r, create: r });
  }

  if (store.settings) {
    console.log('Migrating settings...');
    await prisma.settings.upsert({ where: { id: 'singleton' }, update: store.settings, create: { id: 'singleton', ...store.settings } });
  }

  console.log('Migration complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

Run with:
```bash
npx ts-node --project tsconfig.json scripts/migrate-store.ts
```

### Step 7 — Swap API route imports

Replace `import { ... } from '@/lib/store'` with `import { ... } from '@/lib/db'` across all 19 API routes. Do this in order to minimize breakage:

1. Transaction routes first (`src/app/api/transactions/`)
2. Deadline routes (`src/app/api/deadlines/`)
3. Receivable routes (`src/app/api/receivables/`)
4. Dashboard/settings routes (`src/app/api/dashboard/`, `src/app/api/settings/`)

Use find-and-replace across the codebase:
```bash
# Verify first
grep -r "from '@/lib/store'" src/app/api/
# Then replace
sed -i "s/from '@\/lib\/store'/from '@\/lib\/db'/g" src/app/api/**/*.ts
```

### Verification

```bash
npx prisma migrate dev --name init    # must succeed
npx prisma studio                      # open at localhost:5555, verify tables
npm run build                          # must pass
# Test a few API routes manually to confirm data flows through Prisma
```

### Anti-patterns to avoid

- Do NOT call `prisma.$disconnect()` in request handlers — only in one-off scripts
- Do NOT create a new `PrismaClient` instance per request — use the singleton from `src/lib/prisma.ts`
- Do NOT skip the global guard pattern in `prisma.ts` — Next.js hot-reload will exhaust DB connections otherwise
- Do NOT store arrays directly in SQLite fields — serialize to JSON string and parse on read (as shown for `reminderOffsetsDays`)

---

## Phase 5: Auth (NextAuth v5)

**Goal:** Add user authentication for multi-user / multi-device deployment.

**Context for new session:** This app currently has no authentication. All data is single-user. NextAuth v5 (beta) is the recommended auth library for Next.js App Router. This phase depends on Phase 4 (Prisma) being complete, as the Prisma adapter requires a User model.

**Note:** Skip this phase until you are ready to deploy publicly. Phases 1–4 all work as single-user without auth.

### Step 1 — Install

```bash
npm install next-auth@beta @auth/prisma-adapter
```

### Step 2 — Add User model to `prisma/schema.prisma`

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  password      String?   // hashed with bcrypt
  accounts      Account[]
  sessions      Session[]
  createdAt     DateTime  @default(now())
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Run: `npx prisma migrate dev --name add-auth`

### Step 3 — Create `src/auth.ts`

```typescript
import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize({ email, password }) {
        const user = await prisma.user.findUnique({ where: { email: String(email) } });
        if (!user?.password) return null;
        const valid = await bcrypt.compare(String(password), user.password);
        return valid ? user : null;
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
});
```

### Step 4 — Create `src/app/api/auth/[...nextauth]/route.ts`

```typescript
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
```

### Step 5 — Protect API routes via middleware

Create `middleware.ts` at project root:

```typescript
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
});

export const config = {
  matcher: ['/api/:path*', '/((?!login|api/auth).*)'],
};
```

### Step 6 — Create `src/app/login/page.tsx`

A simple email + password form that calls `signIn('credentials', ...)` from `next-auth/react`.

### Verification

```bash
npm run build
# Navigate to http://localhost:3000/login
# Sign up and sign in
# API routes should return 401 without a valid session
```

---

## Quick Wins (Can Do Anytime)

These are standalone improvements that do not depend on any phase above.

### 1 — Telegram Expense Logging

The user already has a Telegram bot. Add a webhook that parses natural language like "spent 120 on gas" and creates a transaction.

Create `src/app/api/telegram/route.ts`:
- Verify `X-Telegram-Bot-Api-Secret-Token` header
- Parse message text with a simple regex or LLM call
- Call `addTransaction()` from store/db
- Reply with a confirmation message via Telegram Bot API

### 2 — VAT Tracking

- Add `vatAmount: Float?` field to the Transaction Prisma model (or store.json structure)
- On transaction forms, add an optional "VAT amount" input
- On the dashboard, show a "VAT collected this quarter" card
- Add a `/api/dashboard/vat` endpoint that sums VAT by quarter

### 3 — Multi-Currency

- Add `currency` field to Transaction
- Fetch exchange rates from `https://open.er-api.com/v6/latest/USD` (free, no key required)
- Display amounts in the user's preferred currency from Settings
- Cache exchange rates in a `data/rates.json` file with 1-hour TTL

### 4 — Receipt Camera (Zero Code)

On the transaction form's file input, add `capture="environment"`:

```html
<input type="file" accept="image/*" capture="environment" />
```

On mobile PWA, this opens the camera directly instead of the file picker. No other changes needed.

---

## Recommended Execution Order

| Priority | Phase | Why | Estimated Time |
|----------|-------|-----|----------------|
| 1 | Phase 1 (AI Copilot) | Highest impact, zero dependencies, core feature | 2–3 hours |
| 2 | Phase 2 (PWA) | Enables home screen install, minimal effort | 30 min |
| 3 | Phase 3 (Mobile UI) | Makes it feel like a real native app | 4–6 hours |
| 4 | Phase 4 (Prisma) | Required for multi-device sync | 3–4 hours |
| 5 | Phase 5 (Auth) | Only needed before public deployment | 2–3 hours |

Phases 1 and 2 can be done in parallel (no dependencies between them).
Phase 3 ideally follows Phase 1 so the Copilot tab is included in the bottom nav.
Phase 5 requires Phase 4 (Prisma must be in place for the DB adapter).
