# Plan: Admin console v2 — find people off the happy path, approve merchants, track the money

Status: **APPROVED (owner, 2026-10-13)** with the §11 answers · Date: 2026-10-13
Scope: `apps/admin`, the `apps/api` admin surface, and the data the API must start recording.
Source: a code review of every console route, admin endpoint, the Prisma schema and the KYC / onboarding / merchant / wallet flows.
The docs were not used as a source; they are behind the code.

**The goal, in one line:** every customer, biker and merchant has one happy path. The console shows who is on it,
who fell off and where, and gives ops one tap to reach them. Merchant sign-up becomes a real approval queue, and
commission, wallets and top-ups reconcile to the cent.

---

## 1. What the console does today

| Area | Today | Main gap |
|---|---|---|
| Overview | Live order count, bikers online, today's completed orders and fares, an all-time parcel funnel | **Parcels only.** Food and shop orders are invisible. "Today" starts at UTC midnight (02:00 in Harare). No trend or date range. |
| Orders | Newest 100, status/type chips, detail with timeline, proof, fare provenance, cancel/adjust/adjudicate | No search, no paging, no date filter. "Live" label but no refresh. No bids list. Names don't link to people. |
| Bikers | Directory, KYC tabs, plate queue, profile, wallet ledger, suspend/ban/credit | **Only people who reached `/riders/become`.** No step funnel, no join date (Rider has no `createdAt`), no "stuck" view. |
| KYC | Didit-driven queue, review page, approve/decline/reset | No attempt history. Resolved-at, resolved-by and ID expiry are not shown. No "never finished at Didit" split. |
| Merchants | Directory, "awaiting go-live" filter, go-live switch, owner transfer, order settings, kitchen confirm, disputes | **No application lifecycle.** The go-live checklist asks ops to check hours, owner and licence, but the page has none of that data. No menu, team or document view. No suspend. |
| Commission / wallet | `/cash`: fixed 7 days, per biker. Per-biker ledger. Manual credit. | **No top-up list** (Paynow pending, failed, short-paid). No fee or float totals. Accrued KPI is overstated (see 2.1). No free-jobs-left. Ledger rows don't link to the order. |
| SOS, Issues | Lists with ack/resolve | No age or SLA timer. Issues has no auto-refresh. |
| Access | One shared admin token. An email allowlist upstream. Every operator can do everything. | No roles. **No audit log viewer** (the API writes ~45 audited actions and has no read endpoint). |
| Telemetry | OTEL metrics in code; PostHog on mobile for biker onboarding | The OTEL collector still exports to GCP and no Azure endpoint is set, so API metrics are most likely not collected. No server-side business events. |

---

## 2. Fix now: bugs and wrong copy (no new screens, no schema)

### 2.1 Bugs
1. **Accrued commission is overstated.** Free first-10 jobs write no ledger row, so `/cash` projects commission for them (`settlements.service.ts:149-153`). Jobs completed at 0% are re-priced at today's rate.
2. **The issue resolve reason is thrown away.** The modal requires a reason, `resolveIssue` never sends it, and `ResolveIssueRequest` has no field for it (`issues/[id]/ResolveActions.tsx:53,70,86`; `packages/shared/src/contracts.ts:299`).
3. **Fare adjust is offered on merchant orders**, but the API rejects it (`admin-orders.service.ts:360`).
4. **"Live orders" leaves out** `delivered`, `at_pickup` and `offer_selected` (`app/page.tsx:177`).
5. **Who cancelled is unknown.** `cancelledBy = null` covers admin, merchant and system cancels alike, so the list shows "—".
6. **Negative balance shows "$-3.00"** on the biker header (`riders/[id]/page.tsx:109`).
7. **"Needs attention" is never empty**, because the "Commission is X%" row is always there.

### 2.2 Copy that is false under current policy (delete or correct; keep it short)
- `cash/page.tsx:148`: "a low balance blocks going online". False: the check is per job (D-104).
- `cash/page.tsx:111`: doesn't say the first 10 jobs are free, or that food jobs are charged on the delivery fee.
- "Written off — biker suspended" (`merchants/[id]:18`, `orders/[id]:16`): the write-off suspends nobody.
- "takes no new jobs until it settles" (`merchants/[id]:143`, `disputes:110`), "3 strikes = auto-cooldown" (`riders/[id]:195`) and the permanent-hold banner: all off while `PENALTIES_SUSPENDED=true`.
- Internal codes and repo paths on screen: "R-05 … N-12" (`disputes:93`), "docs/MERCHANT-GO-LIVE-RUNBOOK.md" (`merchants/[id]:132`).
- Paragraphs of 50–80 words (`cash:97-104`, `merchants/[id]:227-233`, `riders/[id]:303,326`): cut each to one line.
- "Rider" still shown on screen (`orders/[id]:218`, `SeedCreditCard.tsx:65,67`): change to "Biker" (D-101).

### 2.3 UX fixes inside the drawn pages
- **Times in Harare.** Render every timestamp with `timeZone: "Africa/Harare"`. "Today" means the Harare day. Use one shared `timeAgo`.
- **No raw values.** Show a short order id (`#a1b2c3`) instead of a full UUID. Show names, not profile ids (SOS "Raised by", debt ledger). Map enum values to labels (`commission_freeze`, raw `kyc`, payment method).
- **Link everything.** Order ↔ biker ↔ customer ↔ merchant ↔ issue ↔ ledger row. `OrderDetail` needs those ids added.
- **Actions first.** Move the order actions card to the top. Put the wallet above trips on the biker page. Remove the two disabled freeze controls until they are wired.
- **Refresh where it says "Live":** Overview and Orders (30s), Issues and Disputes (60s).
- **Money:** one `money()` formatter (−$, thousands separators). "Fares" means the same thing everywhere.

---

## 3. Data we must start recording

The aim is to answer happy-path questions without guessing. **One generic event table** carries most of it, plus a
few columns that are queried often. That keeps the schema from sprawling.

**`DomainEvent`** (append-only): `type`, `actorId`, `actorRole` (customer/rider/merchant/admin/system),
`subjectType`, `subjectId`, `orderId?`, `data` JSON, `createdAt`. Indexes on (type, createdAt) and (subjectId, createdAt).
GPS inside `data` follows `GPS_RETENTION_DAYS`.

| Event types | What it unlocks |
|---|---|
| `rider.online` / `rider.offline` (with reason) | Supply hours, utilisation, "verified but never online" |
| `rider.onboarding_step` (profile, become, didit_started, photo, plate_set, first_online, first_bid, first_job, job_10, first_topup) | The biker funnel and stuck lists |
| `kyc.attempt` (ref, vendor status, decision, reason, resolvedBy) | KYC attempt history (replaces scattered audit rows) |
| `merchant.phase` (accept, reject, payment, prep, ready) | Merchant accept time, missed orders |
| `merchant.availability` (open, close, busy, hours edit) and `menu.stock` | Open-hours compliance, out-of-stock rate |
| `offer.bid` / `offer.rebid` / `offer.withdraw`, `order.fare_raise` (from → to) | Real bid history and price discovery. Today a re-bid overwrites the row and the first ask is lost. |
| `order.broadcast` (riders reached, radius) | Parcel acceptance rate. Today reach lives only in Redis for 10 minutes. |
| `topup.anomaly` (short_paid, paid_on_declined) | A queue for ops. Today these are only log lines. |
| `merchant.application` (submitted, called, docs_ok, approved, rejected) | Merchant approval funnel and SLA |

**Columns** (hot queries):
- `Rider.createdAt`
- `Order.assignedAt`, `Order.merchantAcceptedAt`
- `Order.cancelledByRole`, `cancelStage`, `cancelReasonCode` (an enum; free text stays as a note)
- `Merchant.status` (§5), `approvedAt`, `approvedBy`
- `TopUp.declineReason`
- `AuditLog.targetType`, `before`/`after` JSON

**Indexes:** Order (createdAt), (status, createdAt), (orderType, createdAt); OrderEvent (status, createdAt); Offer (createdAt).

**Ops (not the console, but needed for the dashboards):** point the OTEL exporter at Azure Monitor. API metrics are not reaching anything today.

---

## 4. "Find them": the happy paths and the stuck lists

One new page, **People**, plus a **global search** in the top bar (phone, name, order id, Paynow reference).
Every person has one timeline that merges orders, events, audit rows, KYC and top-ups.

| Person | Happy path (each step is a funnel bar with a count and a median time) | Stuck lists (age, sorted oldest first, Call / WhatsApp / Nudge) |
|---|---|---|
| **Biker** | Signed up → profile → become biker → Didit started → verified → plate verified → first online → first job → 10th job → first top-up → active this week | Never started Didit (>24h) · Didit unfinished (>1h) · declined but fixable · plate waiting · verified, never online · online, no job in 3 days · balance below one job's commission · ID expires in 30 days |
| **Customer** | Signed up → first order → delivered → rated → second order within 14 days | Last order expired with no biker (call back, the highest value) · cancelled first order · undelivered · signed up, no order in 7 days |
| **Merchant** | Signed up → pin + hours → menu with photos → ops called → approved → live → first order → first completed → 10 orders | See §5 |

The **Nudge** action sends a push (and SMS where configured) using fixed copy for each step. It writes an audit row
and is capped at one per person per step per day. **Today the console cannot contact anyone except through `tel:` links.**

The Overview gains three funnel strips (biker, customer, merchant) for a chosen range (today, 7 days, 30 days, Harare
days), each bar linking to its stuck list.

---

## 5. Merchant registration → approval

Today a sign-up just creates a dormant merchant (`pilotEnabled=false`). The only server checks at go-live are "has a
pin" and "at least one dish that isn't a draft".

**States:** `applied → reviewing → approved → live`, with `rejected` and `suspended` as side states (live can go to suspended and back).
The merchant app keeps its current "LyniaGo will call you" screen.

**Application queue** (`/merchants?status=applied`): age, business type, area, a checklist score. An SLA pill turns
amber at 24h and red at 48h.

**Checklist, backed by data** (each row shows ✅ or ❌, computed by the API):

| Check | Data |
|---|---|
| Location pin + landmark | exists |
| Opening hours set | `Merchant.hours` (not returned to admin today) |
| Owner name, phone verified, terms accepted | `MerchantMember.termsAcceptedAt` (not returned today) |
| Menu: number of categories and dishes, % with photos, drafts, price range | `MerchantDish` |
| Team: staff and open invites | `MerchantMember` / `MerchantInvite` |
| Pharmacy: licence document + pharmacist named | **new**: `MerchantDocument` (kind, key, verifiedAt, verifiedBy) |
| Ops call logged | `merchant.application` event `called` |

**Actions:** Log call · Approve (only when every required check is ✅) · Reject (with a reason code; the merchant sees
it) · Go live · Suspend / Resume (new; blocks new orders and keeps history). Every action is reason-coded and audited,
as today.

**Merchant metrics on the detail page:** accept time (median), missed-order %, prep time vs promised, out-of-stock
rate, hours open vs scheduled, rating, open debt.

---

## 6. Commission ↔ wallet ↔ top-ups

**The ledger stays the single truth.** Fixes and additions:

1. **Free jobs become visible:** write a `free_job` ledger row of $0, with `orderId`. That fixes the accrued KPI, and "free jobs left" becomes a count.
2. **Top-ups page** (`/cash/topups`): every Paynow intent, with filters for pending, confirmed, declined, expired, short-paid and paid-on-declined. Shows amount, fee, charged, rail, Paynow reference and age. Actions: Re-poll, Credit the short-paid amount (reason-coded), Mark resolved.
3. **Biker statement:** each row links to its order (top-up rail and fee, commission with rate and basis, credit with its actor). The header shows balance, free jobs left, commission still pending on delivered jobs, and the last top-up.
4. **Platform money panel** (by Harare day, with CSV export): top-ups in · fees collected · commission earned · manual credits · **float** (sum of positive balances, money we owe bikers) · **receivable** (sum of negative balances) · the integrity check result, with a Run now button (the endpoint exists).
5. **Reversal/debit:** wire the existing `reversal` type for an admin correction (reason-coded, capped, two-person above a limit; see §8).
6. **Negative-balance list**, linked from the stuck lists.

**Owner decision (2026-10-13):** commission stays charged when the job closes. A biker can still stack jobs in the 6h rating window and go briefly negative; the negative-balance list (item 6) shows it.

---

## 7. Live ops

- **Order monitor:** SLA timers per stage (no bid, merchant hasn't accepted, no biker for a food order, pickup wait, a delivery with no event for 20 minutes). Sort by breach. Auto-refresh.
- **Live map:** bikers online and active orders, from a new admin Socket.IO room. Today the gateway refuses admins and there is no fleet stream; until the room exists, poll `rider:geo`.
- **Alert strip** at the top: SOS pending, top-up anomalies, kitchen confirmations waiting, applications past SLA.
- **Config panel, read-only first:** show `PENALTIES_SUSPENDED`, the commission rate, `TOPUP_RAILS`, the fee %, `KYC_MODE` and the vertical switches. All of these are env-only today, so ops can't see what is on.

---

## 8. Access and audit

- **Roles:** `ops` (orders, people, KYC, merchants), `finance` (wallet, top-ups, credits, write-offs), `owner` (everything plus config). Map each role to a console identity; the API checks the role for each route.
- **Audit viewer:** `GET /admin/audit?target=&actor=&action=&from=` and an Audit tab on every person, order and merchant.
- **Two-person rule** for credits above $20, reversals, bans and write-offs. Proposed values; the owner sets them.

---

## 9. How the big platforms do it

| Capability | DoorDash | Uber | Gojek | Glovo | Chowdeck | Lynia today | Plan |
|---|---|---|---|---|---|---|---|
| Courier onboarding funnel with stuck-applicant follow-up | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | §4 |
| Periodic selfie re-check (stops account sharing) | ✓ | ✓ (Real-Time ID Check) | ✓ | — | — | ✗ | Later: a Didit re-check every N weeks |
| Merchant self-signup → reviewed → live, with a checklist | ✓ | ✓ | ✓ (GoBiz) | ✓ | ✓ | Partial | §5 |
| Live ops map with SLA breach alerts | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | §7 |
| Merchant quality scores (accept time, missed orders, errors) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | §5 metrics |
| Courier wallet statement + top-up reconciliation | ✓ | ✓ | ✓ (GoPay) | ✓ | ✓ | Partial | §6 |
| Supply hours, utilisation, demand heatmap | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | §3 events now; heatmap later |
| Role-based admin with an audit trail | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | §8 |
| Lost-demand callback (an order nobody took) | ✓ | — | ✓ | ✓ | ✓ | ✗ | §4 customer stuck list |
| Shift booking, surge pricing | ✓ | ✓ | ✓ | ✓ | — | ✗ | **Not now.** It doesn't fit a pilot with bidding. |

---

## 10. Design gate (CLAUDE.md pixel-parity rules)

The admin kit (`packages/design/ui_kits/admin`) draws **7 pages**: Overview, Orders, Riders, Customers, Cash, KYC and Issues.
§2 stays inside those pages.

**New, undrawn:** People/funnels, merchant applications, Top-ups, Live map, Audit and Config. "Not drawn ⇒ not rendered"
means each needs one of two routes:

- **(a)** A Claude Design brief, then a kit export, then the build. This is slower.
- **(b)** The Paynow precedent (D-103): build from the existing admin kit primitives (card, KPI, table, pills, confirm modal, tokens), and record every new screen in one `docs/DESIGN-DEVIATIONS.md` entry.

**Phone use:** the kit draws a 1440px desktop. The console currently breaks on a phone: a fixed 216px sidebar, tables
that don't scroll sideways, 32px chips. A responsive console changes drawn geometry, so it needs an owner decision and a ledger entry.

---

## 11. Owner decisions (2026-10-13)

1. New admin screens: **route (b)**. Build from the existing admin kit primitives and record them in one `docs/DESIGN-DEVIATIONS.md` entry.
2. Phone-usable console: **yes**, in its own PR with a ledger entry.
3. Unfinished commission: **keep charging when the job closes** (today's behaviour). Admin shows negative balances as money owed (§6 item 6).
4. Roles and the two-person rule: **later**. The owner is the only operator for now, so PR 8 waits.
5. Pharmacy licence before go-live: **yes** (the recommendation).
6. Nudge: **push only**, no SMS.

---

## 12. Delivery: PRs in order (each merges on green)

| # | PR | Needs |
|---|---|---|
| 1 | §2 bugs, copy and UX fixes in the drawn pages; Harare time | — |
| 2 | Schema: `DomainEvent`, the new columns and indexes; writers at each transition; `free_job` rows | — |
| 3 | Audit read API + viewer; global search; person timeline | Decision 1 |
| 4 | Merchant application states, checklist API, queue, suspend, documents | Decisions 1, 5 |
| 5 | Biker, customer and merchant funnels + stuck lists + Nudge | PR 2, decisions 1, 6 |
| 6 | Top-ups page, biker statement, platform money panel, reversal | PR 2, decision 3 |
| 7 | Live ops: SLA timers, admin socket room, map, alert strip, config panel | Decision 1 |
| 8 | Roles + two-person rule | Decision 4 |
| — | Responsive console | Decision 2 |
| — | OTEL → Azure Monitor (infra) | — |

Funnels only fill up from the day PR 2 ships. Past history can be rebuilt only where data already exists
(`Profile.createdAt`, `OrderEvent`, `FoodDispatchAttempt`, the ledger, `TopUp`). So **PR 2 should land early.**
