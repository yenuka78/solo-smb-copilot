# Solo SMB Daily Finance Copilot - Execution Plan

## Goal
Ship an end-to-end MVP for solo business owners that is used daily, not just at tax filing time.

## MVP scope (implemented)
1. Revenue/expense logging (manual, with receipt filename placeholder)
2. Dashboard summary (revenue, expense, profit, tax reserve suggestion, and MoM trends)
3. Risk flags (high expense ratio, overdue deadlines, negative cashflow)
4. Compliance deadline tracker with open/done state
5. Configurable tax reserve rate
6. Persistent local data store (JSON)
7. API endpoints for dashboard, transactions, and deadlines

## Why this scope
- Fast to ship and validate user behavior
- Avoids expensive integrations at day 1
- Proves daily utility and retention potential

## Next milestones
1. OCR capture (real image upload + extraction)
2. Stripe sync for automatic revenue ingestion
3. Bank feed integration (Plaid/Teller)
4. Accountant workspace export package
5. Mobile app shell for camera-first capture

## Success metrics for validation
- Daily active usage per account
- % of users logging at least 3 transactions/week
- Deadline completion rate before due date
- % users adjusting tax reserve rate and keeping it enabled
