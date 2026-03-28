# PRD: AR Follow-up Queue (v1)

## Objective
Help SMB owners collect receivables faster by turning overdue invoices into a daily prioritized action list.

## Problem
Owners often know they have unpaid invoices but lack a clear queue for who to contact first and what to say.

## Success metrics (first 30 days)
- % overdue receivables contacted within 48h
- Collected amount from overdue bucket
- Median days outstanding (DSO proxy) trend
- Weekly active usage of AR queue

---

## User stories
1. As an owner, I want to see all open receivables sorted by urgency so I know who to chase first.
2. As an owner, I want a reminder message draft in one click so follow-up is fast.
3. As an owner, I want dashboard visibility of overdue count/amount so risk is obvious.
4. As an owner, I want to mark reminder events so I don’t spam the same customer.

---

## Scope (v1)
- Receivables data model
- AR queue API (list + reminder draft)
- Dashboard overdue receivables risk card
- Minimal UI section for queue + one-click draft generation
- Tests for priority sort, risk aggregation, and draft generation

Out of scope (v1):
- Actual email/SMS sending
- Payment links and reconciliation automation
- Multi-user permissions

---

## Data model additions
Add `receivables` collection in store:

```ts
type ReceivableStatus = "open" | "promised" | "paid" | "written_off";

interface Receivable {
  id: string;
  customerName: string;
  customerEmail?: string;
  invoiceNumber?: string;
  issueDate: string;      // YYYY-MM-DD
  dueDate: string;        // YYYY-MM-DD
  amount: number;
  currency?: string;      // default from settings
  status: ReceivableStatus;
  notes?: string;
  lastReminderAt?: string; // ISO datetime
  reminderCount?: number;
  paidAt?: string;         // ISO datetime
  createdAt: string;
  updatedAt?: string;
}
```

Derived fields for UI/API:
- `daysOverdue`
- `priorityScore`
- `suggestedAction`

Priority score v1 (simple):
`score = overdueDaysWeight + amountWeight + staleReminderWeight`

---

## API design (v1)

## `GET /api/receivables`
Returns open/promised receivables with derived fields and sorted by priority.

Query params:
- `status` (optional)
- `limit` (optional)

Response includes:
- list
- totals: `openCount`, `openAmount`, `overdueCount`, `overdueAmount`

## `POST /api/receivables/reminder-draft`
Input:
```json
{ "receivableId": "...", "tone": "polite|firm" }
```
Output:
```json
{
  "subject": "Invoice INV-1234 is overdue",
  "message": "Hi <Name>, quick reminder..."
}
```

Also update `lastReminderAt` + increment `reminderCount` when user confirms draft generation action.

---

## UI/UX (v1)

### Dashboard card
- New risk card: **Overdue Receivables**
- Shows count + amount + top 1 urgent invoice

### Follow-up Queue section
Table columns:
- Customer
- Invoice
- Amount
- Due date (+ overdue label)
- Last reminder
- Priority badge
- Actions: `Generate reminder text`

Action flow:
1. Click `Generate reminder text`
2. Modal/panel shows subject + message draft
3. User copy/manual send (v1)
4. Mark reminder event in store

---

## Testing plan
- Unit tests:
  - priority scoring/sorting
  - overdue aggregation
  - reminder draft formatting
- API tests:
  - list endpoint returns expected totals and ordering
  - reminder-draft endpoint updates reminder metadata
- Regression:
  - existing dashboard/transaction flows unaffected

---

## Rollout plan
1. Ship behind simple feature flag (`AR_QUEUE_ENABLED=true`) if needed.
2. Pilot with real data from 3-5 users.
3. Collect feedback on draft quality and priority order.
4. Iterate with send integrations (email/WhatsApp) in v2.
