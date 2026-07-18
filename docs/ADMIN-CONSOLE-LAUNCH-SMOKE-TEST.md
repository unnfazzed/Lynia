# Admin Console — Launch Smoke-Test Runbook

**Purpose.** Everything in `apps/admin` has been unit/integration-tested and rendered locally against a
mock API, but it has **never run against the real database or real Google IAP** — because the site is
IAP-gated and CI/agents can't reach it. This runbook is the **go/no-go gate**: a maintainer with IAP
access walks every operator journey against the live API and confirms each one produces the right
**database effect** and **audit row**. Nothing here is optional for launch.

**Who runs it.** A maintainer whose Google account has IAP access to the console (see §1) and who can
reach the production Postgres (Cloud SQL) read-only for verification.

**Time budget.** ~45–60 min. Do it end-to-end in one sitting so the audit trail reads as one session.

**Known environment (from prod, 2026-07-18):**

| Thing | Value |
|---|---|
| Admin URL | `https://lyniagoadmin.lyniafinance.com/` |
| GCP project | `lynia-500911` |
| Cloud Run service | `lynia-admin` |
| IAP backend service | `lynia-admin-backend` (global), IAP **enabled** |
| IAP OAuth client | `407250490173-sfa8p2bajrg7pjaplld66jb20libtogm.apps.googleusercontent.com` |
| Console runtime env | `NODE_ENV=production`, `API_BASE_URL`, `ADMIN_CONSOLE_IAP_AUDIENCE`, secret `ADMIN_API_TOKEN` |

> Convention below: **UI** = what you should see; **DB** = a read-only SQL check on the prod database;
> **Audit** = the `audit_logs` row the action must write. Fill the **✅ / ❌** column as you go.

---

## 1. Prerequisites & access

- [ ] **1.1 IAP access for your operator account.** Your Google account must hold
  `roles/iap.httpsResourceAccessor` on the backend service. Grant (founder, once per operator):
  ```bash
  gcloud iap web add-iam-policy-binding \
    --project=lynia-500911 \
    --resource-type=backend-services --service=lynia-admin-backend \
    --member="user:OPERATOR@gmail.com" \
    --role=roles/iap.httpsResourceAccessor
  ```
- [ ] **1.2 DB read access.** Open a read-only psql to the prod database for the verification queries:
  ```bash
  gcloud sql connect <INSTANCE> --project=lynia-500911 --user=<readonly-user>
  # then: \c <database>
  ```
  (Use the same DB the API's `DATABASE_URL` points at. A read replica is fine.)
- [ ] **1.3 A safe test rider + test customer + one test order.** Prefer real pilot fixtures you can
  mutate without harming a live delivery. Note their ids: `RIDER_ID`, `CUSTOMER_ID`, `ORDER_ID`.

---

## 2. Config & deploy verification (before you click anything)

- [ ] **2.1 IAP is on** (already confirmed): `iap.enabled: true` on `lynia-admin-backend`.
- [ ] **2.2 The serving revision is current.** The deployed revision should match the latest green
  `deploy-admin` run on `main`:
  ```bash
  gcloud run services describe lynia-admin --region=<REGION> --project=lynia-500911 \
    --format='value(status.latestReadyRevisionName, status.traffic)'
  ```
- [ ] **2.3 The console's env is complete.** Confirm the runtime carries the API base, the IAP audience
  (turns on signed-JWT verification), and the admin token secret:
  ```bash
  gcloud run services describe lynia-admin --region=<REGION> --project=lynia-500911 \
    --format='yaml(spec.template.spec.containers[].env)'
  ```
  Expect `NODE_ENV=production`, a non-empty `API_BASE_URL`, a non-empty `ADMIN_CONSOLE_IAP_AUDIENCE`,
  and `ADMIN_API_TOKEN` sourced from Secret Manager. **If `ADMIN_CONSOLE_IAP_AUDIENCE` is empty, STOP** —
  the console would run in unverified proxy-header mode (the middleware now logs a one-time warning for
  exactly this; grep the logs for "UNVERIFIED proxy-header mode").

---

## 3. Authentication journeys

| # | Step | Expected | ✅/❌ |
|---|---|---|---|
| 3.1 | Open the URL in a fresh/incognito window while **signed out** of Google | Google's IAP consent/login screen — **never** the console | |
| 3.2 | Sign in with an operator account that **lacks** IAP access | IAP "you don't have access" — the app never renders | |
| 3.3 | Sign in with a granted operator account | The Overview loads | |
| 3.4 | Look at the sidebar footer | Your **operator identity** (your email/name), not a generic "Ops admin", and a **Sign out** link | |
| 3.5 | Click **Sign out** | You're bounced back through Google; returning requires re-auth | |
| 3.6 | (fail-closed spot check) `curl -s -o /dev/null -w '%{http_code}' https://lyniagoadmin.lyniafinance.com/` with no IAP cookie | `302` to Google (or `401`) — **never 200** | |

- [ ] **3.7 Audit actor is your real identity.** After any action below, the `audit_logs.actor` must be
  your **operator email** (e.g. `accounts.google.com:ops@lynia.com` or the normalized email), proving
  the IAP `X-Operator` forwarding works — not `system`, not a uuid.

---

## 4. Read surfaces — every page loads real data

For each: the page shows **`● live`** (not `○ API not connected` / `unreachable`), real numbers, and no
error. Click into one detail from each list.

| # | Page | Expect | ✅/❌ |
|---|---|---|---|
| 4.1 | **Overview** `/` | 4 KPIs incl. **Completed today** + **Fares today**; the funnel substrip; the **Needs attention** queue (stuck / disputes / KYC / commission) with working action links; Recent orders with colored status pills + Route/Rider/Created | |
| 4.2 | Sidebar badges | KYC / Issues / SOS counts match reality (cross-check §4.4–4.7) | |
| 4.3 | **Orders** `/orders` | Route / Status pills / Rider / Fare / Created; filter chips work; a row opens the order detail (8-step timeline, People, Fare, Actions) | |
| 4.4 | **Riders** `/riders` (directory) | Standing column shows online/offline/**suspended/banned/on hold** correctly; a row opens the rider detail | |
| 4.5 | **KYC review** `/riders?kyc=pending` | "KYC review" is the **highlighted** nav item (not "Riders"); pending riders show Approve/Review; a Review opens the doc-review screen (duplicate-ID guard, attempt counter) | |
| 4.6 | **Customers** `/customers` | Masked phones, spend, cancel-rate, flags; a row opens the customer detail | |
| 4.7 | **Issues** `/issues` | Open/investigating/resolved; a row opens the investigation (evidence, statements, resolution) | |
| 4.8 | **SOS** `/sos` | Pending-first; a row links to the order; a pending alert shows **Acknowledge** | |
| 4.9 | **Commission** `/cash` | 0%-launch banner; rides/fares KPIs; by-rider table | |

---

## 5. Mutating actions — UI + DB effect + audit row

> Each destructive action is reason-coded through the confirm modal. After each, run the DB check and
> the audit check. **All of these write the audit row in the SAME transaction as the mutation** — if the
> mutation lands, the audit row must exist with your operator as `actor`.

### 5.1 KYC decision
- Steps: KYC review → open a **pending** rider → **Approve rider** (or **Decline…** with a reason).
- [ ] **UI**: success; the rider's KYC pill flips (verified / failed), the rider-detail page reflects it.
- [ ] **DB**: `SELECT kyc_status, kyc_attempts FROM riders WHERE profile_id='RIDER_ID';` — status changed;
  a decline increments `kyc_attempts` (2 declines lock resubmission).
- [ ] **Audit**: `SELECT actor, action, reason_code FROM audit_logs WHERE target='RIDER_ID' ORDER BY created_at DESC LIMIT 1;`
  — actor = you; a decline carries the reason code.

### 5.2 Rider suspend → lift
- Steps: Rider detail (active rider) → **Suspend rider…** (reason + note) → confirm. Then **Lift suspension…**.
- [ ] **UI**: "Suspended" banner appears; rider goes offline; then lifts cleanly.
- [ ] **DB**: `SELECT account_status, is_online, suspend_reason FROM riders WHERE profile_id='RIDER_ID';`
  — `suspended` + `is_online=false` after suspend; `active` after lift.
- [ ] **Audit**: two rows, `action='rider.suspend'` then `'rider.lift'`, actor = you, reason codes present.

### 5.3 Rider ban (terminal — pick a throwaway rider)
- Steps: suspend the rider first, then **Ban permanently…** (note required).
- [ ] **UI**: "Permanently banned" banner; the actions collapse to **Call rider** only (no Suspend/Lift).
- [ ] **DB**: `account_status='banned'`.
- [ ] **Audit**: `action='rider.ban'`, actor = you.

### 5.4 Order actions
- Steps (on a suitable `ORDER_ID`): **Adjust fare / refund** (new fare + reason); **Cancel order…**; for a
  rider-raised `undelivered` order, **Mark delivered (code bypass)**.
- [ ] **UI**: each succeeds and the order/timeline updates.
- [ ] **DB**: fare-adjust → `SELECT agreed_fare FROM orders WHERE id='ORDER_ID';` changed; cancel →
  `status='cancelled'` and **`cancelled_by` is NULL** (the operator email must NOT be written into that
  uuid column — regression-guarded); adjudicate → `status='delivered'`, `delivered_at` set.
- [ ] **Audit**: `action` in (`order.fare_adjust`, `order.cancel`, `order.adjudicate_delivered`), actor = you.
- [ ] **Fare-adjust ledger**: a fare change appends a `commission_ledger` row of `type='adjustment'` for
  the rider at the ride's original rate — confirm it exists.

### 5.5 Customer hold → lift
- Steps: Customer detail → **Put on hold…** (reason) → confirm. Then **Lift hold…**.
- [ ] **UI**: held banner; then lifts.
- [ ] **DB**: `SELECT on_hold, hold_reason FROM profiles /* customer standing table */ WHERE id='CUSTOMER_ID';`
  (or the customer-standing column your schema uses) — held then cleared.
- [ ] **Audit**: `customer.hold` then `customer.lift`, actor = you.

### 5.6 Issue resolution
- Steps: open an issue → resolve it (**Refund the fare** / **Strike the rider** / **Close — no action**),
  reason-coded.
- [ ] **UI**: the issue moves to resolved with the chosen outcome.
- [ ] **DB**: `SELECT status FROM issues WHERE id='ISSUE_ID';` → `resolved`.
- [ ] **Audit**: `action='issue.resolve'`, actor = you; a refund also moves money (check the ledger).

### 5.7 SOS acknowledge
- Steps: SOS → **Acknowledge** a pending alert.
- [ ] **UI**: flips to "acknowledged · <time>".
- [ ] **DB**: `SELECT acknowledged_at FROM sos_events WHERE id='SOS_ID';` — now non-null.
- [ ] **Audit**: an ack audit row, actor = you.

---

## 6. The money path — wallet credit + idempotency (do this carefully)

This is the launch top-up rail; it moves real balance. It was just hardened for exactly-once retries.

- [ ] **6.1 Credit lands once.** Rider detail → **Prepaid wallet** card → **Credit account…** → amount
  (≤ the manual cap) + reason → confirm.
  - **UI**: the balance updates; a new `topup` row appears in the ledger table with your operator as actor.
  - **DB**: `SELECT balance FROM commission_accounts WHERE rider_id='RIDER_ID';` increased by the amount;
    `SELECT type, amount, balance_after, actor, provider_ref FROM commission_ledger WHERE rider_id='RIDER_ID' ORDER BY created_at DESC LIMIT 1;`
    — one `topup` row, `actor` = you.
  - **Audit**: `action='wallet.credit'`, actor = you.
- [ ] **6.2 Retry does NOT double-credit.** With the SAME dialog still open after a success is not
  possible (it closes), so simulate the real risk — a lost response — by throttling: open the credit
  dialog, then in devtools **go offline**, click **Confirm** (it errors, dialog stays open), go back
  **online**, click **Confirm again**. Because the idempotency key is minted per *dialog-open* (stable
  across the retry), the second attempt re-sends the same key.
  - **Expected**: exactly **one** credit total. `commission_ledger` shows a single new `topup`; `balance`
    moved by the amount **once**. The endpoint dedups on `top_ups.provider_ref` (unique) → `P2002` →
    returns the existing balance.
  - **If you see two credits**, the idempotency fix regressed — **STOP and report**.
- [ ] **6.3 Bad amount is rejected.** Enter `0` or a negative amount → the dialog shows an error and does
  **not** close silently (no phantom credit).

---

## 7. State & honesty checks

- [ ] **7.1 Not-found**: open `/orders/<garbage-id>` → "Record not found" (not "endpoint hasn't shipped").
- [ ] **7.2 Empty states**: a rider with no trips, a clean customer, an empty SOS list → sensible empty copy.
- [ ] **7.3 Unreachable (optional, if you can briefly point the console at a dead API in staging)**: the
  banner reads "API unreachable" and does **not** leak the raw `API_BASE_URL` env-var name to the operator.

---

## 8. Audit-attribution sweep (the compliance gate)

- [ ] **8.1** Pull every audit row you generated this session and confirm **every** `actor` is *your*
  operator identity, the `action` matches what you did, and destructive actions carry a `reason_code`:
  ```sql
  SELECT created_at, actor, action, target, reason_code
  FROM audit_logs
  WHERE created_at > now() - interval '2 hours'
  ORDER BY created_at DESC;
  ```
  Expected actions from this run: `rider.suspend`, `rider.lift`, `rider.ban`, `order.fare_adjust`,
  `order.cancel`, `order.adjudicate_delivered`, `customer.hold`, `customer.lift`, `issue.resolve`,
  `wallet.credit`, plus your KYC + SOS actions.
- [ ] **8.2** No audit row has `actor='system'` for a change **you** made, and no operator email leaked
  into a uuid FK column (e.g. `orders.cancelled_by`).

---

## 9. Rollback drill (know it before you need it)

If a smoke step reveals a serving-revision problem, roll back the console in seconds (traffic re-point,
no rebuild):
```bash
gcloud run services update-traffic lynia-admin --region=<REGION> --project=lynia-500911 \
  --to-revisions <PREVIOUS_REVISION>=100
```
(Find `<PREVIOUS_REVISION>` from `gcloud run revisions list --service=lynia-admin`.)

---

## 10. Sign-off

| Section | Result | Notes |
|---|---|---|
| 2 Config | ☐ pass ☐ fail | |
| 3 Auth | ☐ pass ☐ fail | |
| 4 Reads | ☐ pass ☐ fail | |
| 5 Mutations + audit | ☐ pass ☐ fail | |
| 6 Money path + idempotency | ☐ pass ☐ fail | |
| 7 States | ☐ pass ☐ fail | |
| 8 Audit sweep | ☐ pass ☐ fail | |

**Launch gate:** the console is ready when §5, §6, and §8 all pass — real mutations land, the money path
is exactly-once, and every action is attributed to a real operator in the audit log. A failure in §6 or
§8 is a **hard blocker**.

> Scope note: this runbook covers the **admin console only**. The broader launch gates (WhatsApp BSP + SMS
> gateway, a real ZIM-ID Didit run, live FCM, on-device QA, load/chaos drills, crash telemetry) are tracked
> as **KB-OPS-GATE** in `docs/KNOWN_BUGS.md` and are separate from this checklist.
