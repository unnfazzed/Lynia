# Lynia — UX & Usability Codebase Review

**Date:** 2026-07-21 · **Reviewer:** senior UX-engineering pass (routine) · **Scope:** shipped feature set. No new features, no architecture changes.

> **How this was run.** Phase 0 read `docs/KNOWN_BUGS.md` and the most recent
> `docs/UX-USABILITY-REVIEW-2026-07-20.md`. `mcp__github__list_pull_requests` (state=open) returned one
> open PR — #370, a `release-please` version-bump PR with no code diff — so there were no sibling
> `claude/*` bug-fix branches to cross-check. Phase 0.5 re-verified a rotating sample of three "→
> FIXED/MOOT" cluster headers against current code (rotated away from the six headers 2026-07-19/07-20
> already re-checked — see below). Phase 1 ran the mandated agentic-loop hunt engine
> (`Workflow({name: 'lane-bug-hunt'}, args: 'ux')`) — 4 finder lenses → 3-skeptic adversarial verify →
> per-finding sibling-sweep, 12 sub-agents total (2 returned empty — no candidates from those lenses).
> Phase 3 independently re-read every cited file:line against current code before writing each fix (no
> fix was written from the hunt's description alone).
>
> **Environment note.** Fresh session with no installed dependencies — `pnpm install`, `pnpm exec prisma
> generate` (in `apps/api`), and `pnpm --filter @lynia/shared build` all had to run before `pnpm
> typecheck`/`pnpm test`/`pnpm build` would resolve `@lynia/shared`/`@prisma/client` imports. Once
> installed, typecheck, lint, build, and the full test suite were clean.
>
> **Model note.** The `Workflow` tool's agent model parameter was not overridden — the hunt (Find/Verify/
> Sibling-sweep, 12 sub-agents) ran on the session's resolved model (Sonnet 5), and the fix stage ran
> directly on the orchestrating session (also Sonnet 5) rather than via separate implementation subagents,
> given the fixes' modest per-file scope once independently verified.
>
> **✅ Execution status (2026-07-21).** Both findings below are **implemented** on this branch. `pnpm
> typecheck` clean across all 5 packages; `pnpm test` — `@lynia/api` 1166/1166 (+5 new this run),
> `@lynia/mobile` 517/517 unchanged (no mobile-side fix this run); `@lynia/admin` has no test harness so
> its fixes are `pnpm --filter @lynia/admin typecheck && pnpm --filter @lynia/admin lint && pnpm
> --filter @lynia/admin build`-verified only (all clean), matching this repo's established precedent.

---

## 1. Summary — the highest-impact fixes

1. **The admin console's two most-clicked one-tap write actions — KYC quick-approve and "log a
   follow-up note" — crashed to Next.js's generic unstyled error screen on any API failure, instead of
   the console's own inline, retryable error text every other action uses.** Both were plain
   `<form action={serverAction}>` submits whose server actions deliberately `throw` on a failed write (a
   KYC decision or an audit note must never silently fail-open) — and with **zero `error.tsx` anywhere in
   the app**, that throw escaped past the row straight to Next's default crash page: no sidebar, no
   rider/order context, no in-place retry. *(MEDIUM — FIXED: both converted to client components that
   call the server action directly and catch the throw inline, mirroring the existing
   `AcknowledgeButton` `useTransition`+inline-error pattern; a root `error.tsx` backstop added for any
   future gap in this class)*
2. **"A rider's online near you" — the push that fulfills a customer's "notify me when a rider comes
   online" request — had no in-app Notifications feed fallback**, unlike every other single-recipient
   push type in the app (New offer, account/standing changes, fare-adjust, issue-resolved, SOS). A
   customer who missed the push (backgrounded app, cleared OS notification tray, a different signed-in
   device) had **no way to ever learn** a rider came online near their pickup — the feed stayed silent
   about it forever, unlike its "New offer" sibling. *(MEDIUM — FIXED: a durable audit-log fallback,
   mirroring the existing KB-FEED-SYNTH pattern, recovers a feed row for both the live-order case
   ["riders are being pinged on your live request"] and the generic case ["riders are back near your
   pickup"])*

---

## 2. Findings table

| # | Journey / Area | Lens | File:line (at time of audit) | What the user experiences | Fix | Impact | Status |
|---|---|---|---|---|---|---|---|
| UX21-01 | Admin console — KYC quick-approve + order follow-up note | Error/empty states | `apps/admin/app/riders/page.tsx:154` (`<form action={setKyc}>`); `apps/admin/app/riders/actions.ts:14` (`throw new Error(...)`); `apps/admin/app/orders/[id]/page.tsx:367` (`<form action={logOrderFollowUpNote.bind(null, o.id)}>`); `apps/admin/app/actions/audit.ts:70` (`throw new Error(...)`) | Every other admin write action (`FareAdjust`, `CancelOrder`, `AdjudicateDelivered`, `WalletCreditButton`, `KycDecision`, `AcknowledgeButton`) wraps its POST in a client-side try/catch that renders the failure inline next to the control. These two — the busiest KYC-queue action and the order follow-up note — were bare `<form action={serverAction}>` submits with no such handling. In Next.js App Router, a Server Action invoked from a plain form `action` prop that throws is caught only by the nearest `error.tsx`; `find apps/admin -iname "*error*"` returned nothing — no `error.tsx`/`global-error.tsx` anywhere in the app. A transient API failure while approving a rider's KYC or logging a stuck-order note blew past the whole page to Next's generic unstyled crash screen (no sidebar, no context, no retry) instead of the console's own honest inline error. | `KycSubmitButton.tsx` → `KycApproveButton`: calls `setKyc` directly (not via `<form action>`) inside `useTransition`, catches the throw, renders it inline — mirrors `AcknowledgeButton`. New `orders/[id]/FollowUpNoteButton.tsx`: same pattern for `logOrderFollowUpNote`. New root `apps/admin/app/error.tsx`: a styled, sidebar-preserving backstop (`offline-banner` + "Try again") for any other render/action error not already caught by a `ConfirmModal`/`AcknowledgeButton`-style handler. | Medium | ✅ Fixed (`@lynia/admin` — no test harness in this repo; typecheck + lint + build all clean) |
| UX21-02 | Customer "notify me when a rider's online" | Notification-coherence | `apps/api/src/notifications/notifications.service.ts:197-266` (`notifyRidersAvailable`); `apps/api/src/notifications/notifications-feed.service.ts` (no `riders_available` branch anywhere) | Every other single-recipient customer push (New offer, account/standing changes, fare-adjust, issue-resolved, SOS) has a durable KB-FEED-SYNTH fallback so a missed push is still recoverable from the in-app Notifications screen. `notifyRidersAvailable` — the fulfillment of a customer's "notify me when a rider comes online" request — was pure fire-and-forget over ephemeral Redis waiter state (TTL 1h, drained on claim) with zero DB write recording the event; `notifications-feed.service.ts` had no `riders_available` branch in any of its synthesis blocks. A customer who missed the push had no way to ever learn a rider came online near their pickup — permanently silent, unlike the analogous "New offer" push. | `notifyRidersAvailable` now writes a durable `AuditLog` row for every waiter it processes (independent of push delivery, in its own try/catch so a DB blip can never block the send) — `order.riders_available_notify` (target=orderId) for the live-order case, `customer.riders_available_notify` (target=profileId) for the generic case. `notifications-feed.service.ts` synthesizes both: a new order-scoped loop (mirroring `order.fare_adjust`) for the first, a new `ACCOUNT_FEED_COPY` entry for the second. Copy mirrors the actual push in both cases (the feed↔push contract). | Medium | ✅ Fixed (`@lynia/api` — 5 new tests: 3 in `notifications.service.spec.ts`, 2 in `notifications-feed.service.spec.ts`) |

---

## 3. Phase 0.5 — cluster-claim re-verification

2026-07-19 picked KYC / Object-authz-IDOR / Mobile-journey-dead-ends; 2026-07-20 picked Auth/identity /
Notifications-FCM / Edge-abuse. Rotated to the three remaining headers neither run touched: **Money-fraud**,
**Data-integrity**, **Ship/infra correctness**. Two members each, re-opened against current code:

- **Money-fraud cluster (→ MOOT):** confirmed `settlements.service.ts` has no `recordPayment` method at
  all (`grep -n "recordPayment|class SettlementsService" apps/api/src/settlements/settlements.service.ts`
  — only the class declaration matches) — the read-only prepaid per-ride rewrite the ledger claims is
  still the live shape.
- **Data-integrity cluster (→ FIXED):** migration `0014_report_unique` (reports unique NULL order_id) and
  migration `0017_encrypt_national_id` (national-ID AES-GCM encryption) both present in
  `apps/api/prisma/migrations/`; `rankOffers`'s NaN guard — `packages/shared/src/offer-ranking.ts:72,77-79`
  — confirmed present (`Number.isFinite` guards on every input array before scoring).
- **Ship/infra correctness cluster (→ FIXED):** `--timeout 3600` confirmed on both Cloud Run deploy
  commands (`.github/workflows/deploy-staging.yml:147`, `.github/workflows/release.yml:566,593`); the
  Serverless VPC Access connector to reach Redis/Memorystore confirmed present and wired
  (`infra/terraform/network.tf:42-43` `google_vpc_access_connector.connector`, referenced by
  `infra/terraform/outputs.tf:80`'s `VPC_CONNECTOR` output for `release.yml`'s `--vpc-connector`).

6/6 sampled members intact. No fresh findings from this pass.

---

## 4. Sibling-sweep

**UX21-01 (bare `<form action={serverAction}>` with no client-side error handling).**

```
grep -rn "<form action=" apps/admin/app --include="*.tsx"
grep -rn "action={" apps/admin/app --include="*.tsx" | grep -v "onConfirm\|onClick\|onAction"
```

Pre-fix: 2 live hits — both were the confirmed bug (`riders/page.tsx:154`, `orders/[id]/page.tsx:367`),
now fixed. Post-fix: 0 live hits — the only remaining matches are the doc-comments inside the two new
component files describing the fix. **No further siblings** — these were the only two bare-form server
actions anywhere in the admin console; every other write action already goes through `ConfirmModal` or an
`AcknowledgeButton`-style `useTransition` wrapper.

**UX21-02 (a push `kind` with no in-app feed synthesis).**

```
grep -rn 'kind:\s*"' apps/api/src/notifications/notifications.service.ts apps/api/src/sos/sos.service.ts apps/api/src/issues/issues.service.ts
```

7 hits across 4 push kinds. Disposition of each:
- `kind: "riders_available"` (×2, live-order + generic) — THE CONFIRMED BUG, fixed this run.
- `kind: "offer"` — already synthesized ("New offer" rows from durable `Offer` rows, KB-FEED-SYNTH).
- `kind: "issue"` — already synthesized (`ISSUE_RESOLUTION_FEED_COPY` from the durable `Issue` table,
  UX-2026-07-16).
- `kind: "sos"` (×2) — already synthesized (`sosEvents` loop from the durable `SosEvent` table, UX17-01).
- `kind: "broadcast"` — evaluated and left unfixed as a non-sibling, not silently dropped: this is the
  rider-side "New delivery nearby" ping. Unlike `riders_available` (the customer has no pull-based way to
  check "did a rider come online"), a rider who misses this push still sees the exact same order on the
  live board (WS `board:new_order` + the REST `openQ` poll) the moment they open the app — the board is
  already the durable, always-current source of truth for "is there a job available," so a missed
  broadcast push is not a blocker in the way a missed `riders_available` push was. Not logged as a
  KNOWN_BUGS.md OPEN row since it isn't a defect (evaluated the same way UX20's sibling-sweep left
  `home.tsx:124`'s `meQ.data?.onHold` unfixed after reasoning through the actual consequence).

**Result: every sibling identified was fixed this run (or explicitly evaluated and left as a non-bug with
reasoning recorded above). No new ledger OPEN rows.**

---

## 5. Notes on scope and process

- The hunt (`Workflow` lane `"ux"`) ran 4 finder lenses → 3-skeptic adversarial verify per candidate → a
  repo-wide sibling-sweep per survivor. 2 candidates found, both survived verification (verify votes:
  REAL/REAL/REAL for UX21-01; REAL/refuted/REAL — 2-of-3 majority — for UX21-02); 2 of 4 lenses returned
  zero findings (empty-result agents, not errors).
- Every file:line cited by the hunt was independently re-opened and re-read by the orchestrating session
  before writing each fix — the evidence quoted in the findings table above was taken from that
  independent read, not from the hunt's own description.
- `KycSubmitButton.tsx`'s sole prior export (`KycSubmitButton`, a `useFormStatus`-driven submit button)
  had exactly one call site; it was replaced in place by `KycApproveButton` (a self-contained
  `useTransition`-driven button with inline error text) rather than kept alongside it, since the old
  `<form>` wrapper it depended on (`useFormStatus` requires being inside a `<form>`) no longer exists at
  the call site.
- `notifyRidersAvailable`'s new audit write is deliberately in its own inner `try/catch`, separate from
  the method's outer best-effort catch — a DB hiccup on the durable-fallback write must never prevent the
  time-critical push itself from sending (regression-tested: `"still sends the push when the audit write
  itself fails"`).
- This was a fresh session with no installed dependencies. `pnpm install`, `pnpm exec prisma generate`
  (in `apps/api`), and `pnpm --filter @lynia/shared build` all had to run before `pnpm
  typecheck`/`pnpm lint`/`pnpm build`/`pnpm test` could resolve `@lynia/shared` and `@prisma/client`
  imports across the monorepo — done once, up front, before any fix work.

## 6. Needs-human-confirmation

None this pass — every finding was verified directly against current code with quoted evidence before
being fixed.

## 7. Deferred / not fixed

None. Both findings from this pass were fixed in this run, along with every sibling the sweep found. One
adjacent, differently-consequenced push kind (`kind: "broadcast"`) was evaluated and left as a non-bug —
see the sibling-sweep section above for the reasoning (the rider board is already a durable, pull-based
source of truth for new jobs, unlike the customer-side "riders online" signal this pass fixed).
