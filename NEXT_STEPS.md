# Next Steps (Autonomous backlog)

## Completed now
- End-to-end local MVP built and tested
- Dashboard + transaction logging + deadline tracking + tax reserve settings
- Receipt/invoice upload endpoint that logs transactions
- Unit tests + lint + production build + API smoke tests
- Transaction deletion (UX improvement)
- Transaction editing (UX improvement)
- Transaction search and profit indicator (UX improvement)
- Profit margin percentage on dashboard (UX improvement)
- Expense category breakdown on dashboard (UX improvement)
- Export download endpoint and UI links (UX improvement)
- Transaction description in table (UX improvement)
- Category suggestions via datalist (UX improvement)
- Onboarding "Go to section" shortcuts (UX improvement)
- "Clear all filters" button for transactions (UX improvement)
- Deadline deletion (UX improvement)
- Quick-select category buttons and date shortcuts in transaction form (UX improvement)
- Filtered totals and count summary for transaction list (UX improvement)
- Transaction duplication (UX improvement)
- Increased recent transactions limit to 50 and added "Download CSV" for filtered transactions (UX improvement)
- Improved reminder wording to human-readable statuses ("due today", "1 day left", "1 day overdue") and added coverage tests (UX + test improvement)
- Deadline timing now uses day-level logic so "due today" items are not incorrectly marked overdue mid-day, with regression tests for summary + alerts (UX + test improvement)
- Deadline list now shows human-readable timing labels ("due today", "X days left", "X days overdue") for faster triage, backed by shared status-label helper tests (UX + test improvement)
- Deadlines are now sorted for triage (open items first, nearest due dates first, completed items last), with regression coverage for sorting behavior (UX + test improvement)
- Deadline rows now show readable due-date formatting (e.g., "Feb 21, 2026") instead of raw ISO strings, with helper coverage for invalid-date fallback (UX + test improvement)
- Transaction and OCR review rows now show readable date formatting instead of raw ISO strings, using a shared date-display helper with regression tests (UX + test improvement)
- Date display now safely handles full ISO timestamps and impossible calendar dates (e.g., Feb 30) by showing stable readable labels or preserving invalid raw input, with regression tests for both paths (UX + test improvement)
- Editing a transaction now reliably saves or clears the receipt file name from the form, with regression coverage for both update paths (UX + test improvement)
- Deadline timing labels now use friendlier one-day wording ("due tomorrow" / "due yesterday") while keeping multi-day labels unchanged, with regression coverage (UX + test improvement)
- Transaction search now matches both ISO dates and readable date labels (e.g., "Feb 21") so users can find entries using the same date format shown in the UI, with helper regression tests (UX + test improvement)
- Transaction search now also matches currency-style amount queries (e.g., "$145.20" and "1,234.50"), with regression tests for both formats (UX + test improvement)
- Transaction search now tolerates punctuation differences in text queries (e.g., finding `invoice-feb.pdf` by searching `invoice feb`), with regression coverage for receipt-name matching (UX + test improvement)
- Transaction search now matches type keywords and aliases (e.g., `income`, `cost`) so users can quickly filter by intent without memorizing exact labels, with regression tests (UX + test improvement)
- Transaction search now matches common plural type terms (e.g., `expenses`, `revenues`) so users can find entries with natural phrasing, with regression tests (UX + test improvement)
- Transaction search now supports shorthand type queries (e.g., `exp`, `rev`, `inc`) for faster keyboard filtering, with regression tests for abbreviation matching (UX + test improvement)
- Transaction search now understands relative date keywords (`today`, `yesterday`, `tomorrow`) for quick date-focused filtering, with regression tests for deterministic date matching (UX + test improvement)
- Transaction search now supports relative month keywords (`this month`, `last month`, `next month`) for faster period-based filtering, with regression tests for keyword behavior (UX + test improvement)
- Transaction search now supports relative week keywords (`this week`, `last week`, `next week`) for faster short-range filtering, with regression tests for keyword behavior (UX + test improvement)
- Transaction search now supports relative year keywords (`this year`, `last year`, `next year`) so users can quickly slice annual records with natural language, with regression tests for keyword behavior (UX + test improvement)
- Transaction search now supports fiscal period aliases (`this/last/next fiscal year` and `this/previous/next fiscal quarter`) for finance-friendly filtering language, with regression tests (UX + test improvement)
- Transaction search now supports relative quarter keywords (`this quarter`, `last quarter`, `next quarter`) for faster quarterly review flows, with regression tests for keyword behavior (UX + test improvement)
- Transaction search now matches explicit quarter-period queries (e.g., `q1`, `q1 2026`, `quarter 1 2026`) for faster accounting-style filtering, with regression tests (UX + test improvement)
- Transaction search now supports rolling date-range keywords (`last/past 7/30/90 days`) so users can quickly review recent activity windows, with regression tests for in-range, out-of-range, and future-date behavior (UX + test improvement)
- Transaction search now supports period-to-date keywords and shorthand (`week/month/quarter/year to date`, plus `wtd/mtd/qtd/ytd`) for faster bookkeeping slices, with regression tests for in-range and out-of-range matching (UX + test improvement)
- Transaction search now also matches hyphenated period-to-date terms (e.g., `year-to-date`, `month-to-date`) so common accounting phrasing works without remembering shorthand, with regression tests (UX + test improvement)
- Transaction search now tolerates punctuation/spacing variations in date-range keywords (e.g., `last-30-days`, `month   to   date`) so natural typing still finds the right records, with regression tests (UX + test improvement)
- Transaction search now supports 14-day and 2-week rolling range phrases (e.g., `last 14 days`, `past 2 weeks`) for more natural short-range filtering, with regression tests for boundary behavior (UX + test improvement)
- Transaction search now also supports quarter shorthand aliases (`this/last/next qtr`) so common finance shorthand works without full phrases, with regression tests for each alias (UX + test improvement)
- Transaction search now supports upcoming rolling date-range keywords (`next/upcoming 7/14/30/90 days` and `next/upcoming 2 weeks`) so planning workflows can find future-dated entries quickly, with regression tests for boundaries and non-matching past/today cases (UX + test improvement)
- Transaction search now also supports 60-day rolling range keywords (`last/past 60 days`, `next/upcoming 60 days`) so mid-range reviews and planning queries work without falling back to custom filters, with regression tests for in-range and boundary misses (UX + test improvement)
- Transaction search now supports explicit fiscal-year shorthand queries (`fy2026`, `fy 26`) to match common accountant-style filtering language, with regression tests and updated in-UI search hint text (UX + test improvement)
- Filtered transaction CSV downloads now use robust CSV escaping for all fields, normalize multiline text to one row per transaction, and include a UTF-8 BOM for better spreadsheet compatibility, with regression tests (UX + test improvement)
- Transaction search now supports `yr` shorthand in relative year/fiscal-year phrases (e.g., `this yr`, `last fiscal yr`) for faster natural typing, with regression tests and updated in-UI search hint text (UX + test improvement)
- Revenue category breakdown on dashboard (UX improvement)
- Fixed broken transaction search category tests and missing API imports (Test + stability improvement)
- Transaction list now features quick-filter buttons for common periods (This Month, Last 30 Days, Year to Date) for faster triage (UX improvement)
- Transaction rows now show a "Today" / "Yesterday" status badge for immediate temporal context, with a shared date helper and new test coverage (UX + test improvement)
- Fixed multiple broken tests and build failures caused by stale `buildSummary` signatures across the codebase (Stability improvement)
- Dashboard now displays a revenue goal progress indicator when a goal is set, with coverage for calculation logic and edge cases (UX + test improvement)
- Dashboard now displays a monthly expense limit progress indicator when a limit is set, with coverage for calculation logic and boundary edge cases (UX + test improvement)
- Dashboard now includes smart risk flags for missed revenue goals (at end-of-month) and exceeded/near-limit monthly expense targets, with dedicated regression tests (UX + test improvement)
- Dashboard now includes a smart risk flag for transactions waiting in the OCR review queue to ensure they are not forgotten, with regression tests (UX + test improvement)
- Dashboard now includes a smart risk flag for negative monthly cashflow to surface burn rate concerns early, with regression tests (UX + test improvement)
- Onboarding now includes a step for checking the tax reserve to improve financial awareness (UX + test improvement)
- Onboarding now includes steps for setting an expense limit and checking spending progress on the dashboard to improve financial planning awareness (UX + test improvement)
- Standardized `buildSummary` calls across API routes to use full settings object, fixing several TypeScript and build failures (Stability improvement)
- Cleaned up unused variables and improved error handling in UI and API routes (Stability improvement)
- Added `updateDeadline` to store and expanded `/api/deadlines` PATCH to support full deadline editing, with complete regression coverage (UX + test improvement)
- Updated receipt upload to support core-less AI extraction for Gemini and OpenAI providers, enabling asynchronous agentic review flows, with regression tests (UX + test improvement)
- AR follow-up queue now ships as a vertical slice: `/api/receivables` returns prioritized open items + queue totals, dashboard shows an overdue receivables risk card, and UI includes one-click reminder draft generation/copy for top queue items (owner-action improvement)
- Receivables scoring now factors both overdue timing and remaining amount, with queue sorting/totals regression coverage to protect priority ordering behavior (test improvement)
- AR queue now flags stale follow-ups (no touch in 7+ days), shows owner-facing suggested next actions inline, and prioritizes stale items first when risk ties, with regression coverage for stale-priority ordering (owner-action + test improvement)
- AR queue now persists reminder touch events per receivable (count + last channel/date), includes high-risk/stale queue totals, generates timing-aware reminder drafts, and surfaces follow-up history directly in queue UX via one-click “Draft + log touch”, with expanded regression coverage for touch recency, escalation logic, and totals (owner-action + backend + UI + test improvement)
- AR queue management is now end-to-end in-app: receivable create/edit form, action-based receivable API updates (mark paid, record partial payment, snooze follow-up date, set/clear promise date), queue scoring/sorting aware of snoozed follow-ups and promise dates, and expanded receivables regression tests for snooze/promise workflows (owner-action + backend + UI + test improvement)
- AR queue now supports bulk queue operations (multi-select + select-visible, bulk mark-paid, bulk snooze), persists receivable-level last action metadata for audit visibility, and adds PATCH action-branch regression coverage for mark_paid/mark_partial/bulk_mark_paid/bulk_snooze validation + state transitions (owner-action + data model + backend + UI + test improvement)
- AR queue hardening now includes bulk reminder drafting + touch logging with channel picker (`/api/receivables/reminder` supports ids[]), owner-visible bulk draft review/copy UX, and receivable action analytics counters surfaced in `/api/receivables` + queue UI (paid/snooze/partial/reminder/channel counts), with new regression coverage for bulk reminder logging and counter increments (owner-action + data model + backend + UI + test improvement)
- AR queue analytics now support lifetime + windowed (7d/30d) performance views and reminder→payment conversion tracking (count, collected amount, rate), backed by persisted receivable action events, expanded receivables API payloads, owner-visible queue ROI cards, and new regression coverage for analytics math + route integration (owner-action + data model + backend + UI + test improvement)
- AR queue reminder analytics now include channel-attributed conversion performance (email/SMS/WhatsApp/phone/other reminders sent, converted receivables, collected amount, and conversion rate) derived from event sequencing, exposed in `/api/receivables`, visualized in queue analytics UI as a per-channel ROI table, and protected by new regression tests for attribution logic and route payloads (owner-action + data model + backend + UI + test improvement)
- Cash runway + 14-day cash risk vertical slice shipped: new runway engine (`buildCashRunwaySummary`) using trailing 30-day net trend + receivable-weighted inflow expectations, persisted `currentCashBalance` setting + dashboard PATCH validation, new `/api/cash-runway` endpoint, owner-facing runway/risk cards and 14-day projection table in dashboard UI, and regression coverage for runway math + route payload + settings persistence (owner-action + data model + backend + UI + test improvement)
- Cash runway forecasting now supports owner-adjustable assumptions (burn sensitivity + collection confidence) persisted in settings, API validation for safe ranges, scenario confidence band output (`projectionBands14d` best/base/worst), dashboard controls for tuning assumptions, and expanded regression coverage for assumption math, route payload shape, and PATCH validation (owner-action + data model + backend + UI + test improvement)
- Weekly Top 5 owner actions vertical slice shipped: new action-planning engine (`buildWeeklyOwnerActionBrief`) that ranks collections/cost-control/revenue/compliance moves by expected 14-day cash impact, new `/api/owner-actions` endpoint, dashboard KPI + weekly action cards with impact/confidence/rationale, and regression coverage for ranking/fallback behavior plus route payload validation (owner-action + data model + backend + UI + test improvement)
- Stripe checkout + webhook state completion vertical slice shipped: new Stripe checkout session API (`/api/billing/checkout`) with account-aware metadata persistence, billing status API (`/api/billing/status`), expanded billing data model (customer→account map, processed webhook dedupe IDs, checkout session tracking), webhook completion flow for both `checkout.session.completed` and `customer.subscription.*` with dedupe safety, dashboard billing/plan UX with one-click checkout launch, and regression coverage for checkout + webhook-to-active lifecycle (owner-action + data model + backend + UI + test improvement)
- Stripe self-serve plan management shipped: new Stripe Billing Portal session API (`/api/billing/portal`), env-driven portal return URL support, billing status readiness flag (`portalReady`), dashboard “Manage plan in Stripe” UX for active customers, and regression coverage for portal session creation + missing-customer guardrails (owner-action + backend + UI + test improvement)
- Stripe billing state hardening shipped: webhook support for `invoice.payment_failed` + `invoice.paid` now persists invoice amount/status/due date/error context, subscription delinquency lifecycle (past_due → active recovery), and latest hosted invoice link; billing status + dashboard UX now surface payment-issue alerts with one-click invoice/portal recovery actions, backed by new regression tests (owner-action + data model + backend + UI + test improvement)
- Stripe entitlement/state reconciliation vertical slice shipped: new reconciliation engine that compares local subscription cache vs live Stripe subscription state and auto-heals drift (`runStripeBillingReconciliation`), new reconciliation APIs (`/api/billing/reconcile` for manual run + `/api/billing/reconcile/run` token-guarded scheduler runner), persisted billing reconciliation reports/history in store, dashboard billing card controls + drift report visibility, and regression coverage for live drift healing plus runner auth gating (owner-action + data model + backend + UI + test improvement)
- Stripe invoice timeline/audit visibility shipped: subscription state now persists a capped invoice/payment event timeline (failed + paid webhook events with amount/status/error metadata), `/api/billing/status` exposes timeline payloads, dashboard billing card shows a recent invoice/payment event feed for owner support triage, and regression coverage verifies timeline persistence/order and API delivery (owner-action + data model + backend + UI + test improvement)
- AR queue “best next channel” recommendations shipped: queue scoring now enriches each receivable with a recommended reminder channel + confidence + rationale derived from customer-level and global reminder→payment conversion history, `/api/receivables` now returns recommendation metadata, AR queue UI shows recommendation chips and reasons inline, one-click Draft+log now automatically uses the recommended channel, and regression coverage protects recommendation fallback/selection behavior (owner-action + data model + backend + UI + test improvement)
- AR queue recommendation engine is now segment-aware (invoice size + overdue timing cohorts): reminder conversion stats are tracked at customer+segment and segment-global levels, recommendation fallback order now prefers cohort-fit channels before global defaults, `/api/receivables` exposes recommendation source/tags for explainability, queue UX renders “why this channel” tags inline, and regression coverage now validates segment-vs-global recommendation behavior and tag delivery (owner-action + data model + backend + UI + test improvement)
- AR queue recommendation backtest is now live: `/api/receivables` analytics include segment/channel predicted-vs-realized conversion + cash collected metrics, recommendation match-rate telemetry, and top segment outcome slices; queue UX now shows an owner-facing recommendation accuracy card with channel backtest and segment outcome breakdown; regression coverage added for analytics math + route payload delivery (owner-action + data model + backend + UI + test improvement)
- AR queue confidence-floor auto-tuning shipped: new recommendation calibration endpoint (`/api/receivables/recommendation-calibration`) computes rolling 30-day backtest error bands and persists a confidence cap, receivables queue scoring now applies calibrated max confidence labels, `/api/receivables` exposes calibration state for operators, dashboard queue analytics shows calibration status + error metrics with one-click “Auto-tune now”, and regression coverage added for calibration math, queue cap enforcement, and route persistence (owner-action + data model + backend + UI + test improvement)

## Phase 2 (next implementation pass)
1. AR Follow-up Queue (owner-action priority)
   - ✅ Shipped: urgency scoring (overdue days, amount, stale follow-up), overdue/high-risk/stale totals, dashboard overdue receivables card, one-click reminder draft + reminder touch tracking.
   - ✅ Shipped: in-app receivable CRUD workflow (add/edit), explicit “mark paid” and partial payment capture, snooze-to-date follow-up, and set/clear customer promise date actions with API validation and queue UX updates.
   - ✅ Shipped: queue bulk actions (select + bulk mark paid + bulk snooze), receivable action audit metadata (`lastActionType`/`lastActionAt`), and `/api/receivables` PATCH action-branch tests for positive and negative paths.
   - ✅ Shipped: bulk “Draft + log reminders” for selected receivables with channel picker, plus queue action analytics counters (per action + reminder channel) exposed in API and UI.
   - ✅ Shipped: queue analytics windowing (last 7/30 days) plus reminder→payment conversion metrics (count, amount, rate) using persisted receivable action events and in-app ROI visibility.
   - ✅ Shipped: channel-attributed conversion analytics for reminders (email/SMS/WhatsApp/phone/other) including per-channel reminders sent, converted receivables, collected amount, and conversion rate in API + queue UX.
   - ✅ Shipped: recommendation accuracy backtest telemetry (predicted vs realized conversion + cash collected) for channel/segment cohorts in `/api/receivables` analytics, plus owner-visible queue accuracy cards/tables in dashboard UX.
   - ✅ Shipped: rolling 30-day confidence-floor auto-tuning (`/api/receivables/recommendation-calibration`) that persists calibrated recommendation confidence caps from backtest error bands and applies them live in queue confidence labels.
   - Remaining for this item: no blocking MVP gaps; optional follow-up is scheduled nightly calibration runs + drift alerts when confidence cap drops.
   - Next concrete cut: add token-guarded scheduled calibration runner endpoint and owner alert banner when calibration status degrades.
2. Cash runway + 14-day cash risk
   - ✅ Shipped: runway model driven by trailing 30-day daily net trend + receivable-weighted expected inflows, persisted current cash balance setting, dedicated `/api/cash-runway` API, and dashboard UX for runway metrics, risk level/reasons, suggested owner actions, and day-by-day 14-day projection table.
   - ✅ Shipped: owner-adjustable forecast assumptions (burn sensitivity + collection confidence), persisted settings + PATCH validation, explicit best/base/worst projection bands in `/api/cash-runway`, and dashboard scenario-band visibility for explainability.
   - Remaining for this item: no blocking MVP gaps; optional follow-up is lightweight historical backtest scoring to auto-suggest assumption defaults per business.
   - Next concrete cut: begin roadmap item #3 by shipping a weekly Top 5 owner actions brief ranked by expected 14-day cash impact.
3. Weekly owner action brief
   - ✅ Shipped: weekly Top 5 action planner ranked by expected 14-day cash impact, with category-aware recommendations (collections/cost-control/revenue/compliance), confidence + rationale metadata, `/api/owner-actions` backend delivery, and owner-visible dashboard cards.
   - Remaining for this item: no blocking MVP gaps; optional enhancement is learning-based impact calibration from realized outcomes (predicted vs actual) after pilot usage.
   - Next concrete cut: begin roadmap item #4 by implementing Stripe Checkout session creation + webhook-driven subscription state completion in-app.
4. Stripe checkout + webhook state completion
   - ✅ Shipped: checkout session creation endpoint (`/api/billing/checkout`) with Stripe metadata for account mapping and persisted pending checkout session context.
   - ✅ Shipped: webhook lifecycle completion for `checkout.session.completed` + `customer.subscription.*`, including customer→account mapping and processed-event dedupe safety.
   - ✅ Shipped: owner-visible billing status card + one-click checkout launch in dashboard settings, plus `/api/billing/status` for current plan state.
   - ✅ Shipped: Stripe Billing Portal session API (`/api/billing/portal`) with customer-link guardrails, env-configurable return URL, and in-app “Manage plan in Stripe” CTA.
   - ✅ Shipped: delinquency recovery lifecycle for `invoice.payment_failed` + `invoice.paid` with persisted invoice telemetry (amount, status, due date, hosted URL, payment error), billing status exposure, and dashboard payment-issue recovery prompts.
   - ✅ Shipped: periodic Stripe entitlement/state reconciliation flow with drift detection + auto-heal, manual reconcile endpoint, token-guarded scheduled runner endpoint, persisted reconciliation reports/history, and dashboard drift report UX.
   - ✅ Shipped: Stripe invoice/payment timeline audit trail persisted on subscription state and surfaced in billing status/dashboard UI for faster payment-support debugging.
   - Remaining for this item: no blocking MVP gaps; optional follow-up is webhook coverage + owner alerts for `charge.dispute.created` / `charge.dispute.closed` events.
   - Next concrete cut: extend Stripe webhook lifecycle to dispute events with in-app billing risk alerting and regression coverage.
5. OCR extraction pipeline hardening
   - Parse uploaded receipts/invoices to prefill amount/date/vendor/category
   - Confidence score + manual correction workflow
6. Reminder channels
   - Email reminders for deadlines and weekly risk digest
7. Export package
   - Monthly accountant package: CSV + attachments + summary PDF
8. Security hardening
   - File type/size controls and malware scan hook
   - Audit log + basic role guardrails

## Validation plan
- Recruit 5 pilot solo SMB users
- Target signals in 2 weeks:
  - 3+ sessions/week/user
  - 70% of transactions captured same day
  - 80% deadline tasks resolved before due date
