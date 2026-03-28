# Solo SMB Daily Finance Copilot

A fast MVP for daily business finance/tax operations:
- log revenue and expenses
- estimate tax reserve in real time
- track filing/compliance deadlines
- complete a first-run onboarding checklist (tax rate, first transaction, first deadline, first receipt upload)
- see risk flags before problems become expensive

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## API routes
- `GET /api/dashboard` - summary, settings, recent items, OCR review queue counts, onboarding checklist progress
- `PATCH /api/dashboard` - update settings (tax reserve rate)
- `GET /api/transactions`
- `POST /api/transactions`
- `GET /api/deadlines`
- `POST /api/deadlines`
- `PATCH /api/deadlines` - toggle open/done
- `POST /api/upload` - upload receipt/invoice, run parser abstraction (env-selected OCR provider; mock by default), score extraction confidence, and create linked transaction (premium-gated when Stripe is enabled)
- `POST /api/export/monthly` - generate accountant-ready bundle in `data/exports` (`.csv` + `.json` + `.md`) and return file list (premium-gated when Stripe is enabled)
- `POST /api/reminders/run` - reminder dispatch (`mode: dry-run` by default, `mode: send` requires `provider: email` + RESEND env vars; premium-gated when Stripe is enabled)
- `GET /api/review/transactions` - list transactions needing OCR review
- `PATCH /api/review/transactions` - mark reviewed (and optionally correct fields)
- `GET /api/billing/status` - billing + subscription status for current account
- `POST /api/billing/checkout` - create Stripe Checkout subscription session
- `POST /api/billing/portal` - create Stripe Billing Portal session for plan/payment management
- `POST /api/billing/stripe/webhook` - Stripe webhook ingestion scaffold

## Data storage
For MVP speed, data is persisted in `data/store.json`.

## Stripe subscription scaffold
Stripe gating is scaffolded with a safe default (`STRIPE_ENABLED=false`).
See `docs/stripe-subscriptions-checklist.md` for production rollout steps.

## OCR provider abstraction (safe default)
OCR runs through a provider adapter with env-based selection.
By default, this project uses `OCR_PROVIDER=mock` (no external dependency).

See `docs/ocr-provider-setup.md` for provider options, error behavior, and how to enable a real provider adapter later.

## Testing and verification

```bash
npm run test
npm run lint
npm run build
```

## Current deployment model
- Primary: web app (desktop + mobile browser)
- Notifications: reminder engine implemented with preview mode + optional email stub (Resend)
- Integrations: manual entry first, integrations planned next

See `PLAN.md` for roadmap and success metrics.
