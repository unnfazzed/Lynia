# Documentation Sync Report

**Run date:** 2026-07-07 · **Base commit:** `e49e14adc6b64f52535edd51812f645e12bfde9f` · **Scope:** full repo (no prior `.last-doc-sync` marker — first run)

## Method

Every doc under `docs/`, `packages/design/`, plus root/app-level READMEs and `CONTRIBUTING.md`, was
classified before being checked. The repo's own `docs/README.md` table already tags each doc 🟢 Living
(spec/current) vs 📋 Review log (decision history). Per the reconciliation authority hierarchy, only
🟢 Living docs — the ones making ongoing, falsifiable claims about current behavior — were ground against
code/config. 📋 Review logs (`CEO-REVIEW.md`, `ENG-REVIEW.md`, `DESIGN-REVIEW.md`,
`INDRIVE-UX-REVIEW.md`, `COMPETITOR-REVIEW.md`) and dated audit snapshots (`BUG-HUNT.md`,
`MOCKUP-ALIGNMENT-REVIEW.md`, `docs/plans/*`, and the dated "Round N" log entries embedded inside
`LAUNCH-READINESS.md` §6) were treated as historical decision records and were **not** rewritten, even
where they now describe a superseded state — that's what a dated log is supposed to preserve.

19 subagents (a mix of doc-scoped and section-scoped) fanned out to ground claims against code. Every
STALE_DOC fix below was independently re-verified by reading the cited file before editing.

## Summary

| Class | Count | Action |
|---|---|---|
| STALE_DOC | 30 | Fixed — see below |
| CODE_BUG | 4 | **Not** doc-edited — reported as tickets |
| ORPHAN | 1 | **Not** doc-edited — flagged for a human decision |
| AMBIGUOUS | ~8 | Noted, no action (see "Ambiguous / lower-confidence" below) |

Docs re-audited with **zero discrepancies found**: `docs/PRICING.md`, `docs/OBSERVABILITY.md`,
`docs/SECRET-ROTATION.md`, `docs/IR-RUNBOOK.md`, `docs/SECURITY-OPS.md`, root `SECURITY.md`.

---

## STALE_DOC — fixed

### docs/ARCHITECTURE.md (highest-severity cluster)
- **§7 state machine — cancellation rights were exactly reversed.** The diagram and prose said a rider
  can cancel any time before `delivered` and a customer only up to `en_route_pickup`. Code
  (`packages/shared/src/enums.ts:83-100`, `order-lifecycle.service.ts:454`) is the opposite:
  `RIDER_CANCELLABLE_STATUSES` stops at `en_route_pickup`; `CUSTOMER_CANCELLABLE_STATUSES` runs through
  `en_route_dropoff`. This is the finding most likely to have misled an on-call engineer or support
  agent about who can back out of a job post-pickup. Fixed diagram edges + rules prose.
- **§7 — missing `undelivered` terminal state.** `markUndelivered()` (`order-lifecycle.service.ts:283-337`)
  is a real guarded-CAS terminal transition from `picked_up`/`en_route_dropoff`, wired to
  `POST .../undelivered`. Added to the diagram, terminal-state list, and rules prose.
  (Also added to `docs/CONCEPT.md`'s status-flow sentence.)
- **§7 — `assigned → confirmed : rider confirms items` edge label was wrong.** That transition is a
  plain status CAS; the actual item-confirmation call (`confirmItems`) is gated to `en_route_pickup`
  and explicitly does **not** change order status (code comment says so). Retargeted the label to the
  `en_route_pickup → picked_up` edge and clarified in prose.
- **§9 KYC — biggest single stale cluster.** `KycStatus` has grown a 4th value, `expired`
  (`schema.prisma:61-68`), with its own online-gate refusal reason and a `POST /riders/kyc/retry`
  resubmit flow (2-attempt lock, A-02) — none of it in the doc. `applyKycResult`/`adminSetKyc` also
  gained a `reason`/`reasonCode` parameter the doc's call sketches omitted. Updated the intro paragraph,
  sequence diagram, and the gating/webhook-signature bullets (the webhook also has an undocumented
  legacy `X-Signature` raw-body fallback alongside the canonical `X-Signature-V2` path).
- **§8 — OTP dev/QA escape hatch description imprecise.** Doc said "only for allowlisted test numbers";
  code returns the code inline for *any* phone in dev/test and only restricts to the allowlist in
  production. Clarified.
- **§10 — `rider:location` ordering was backwards.** Doc said persist-then-emit; code deliberately
  emits first, persists second (explicit "Emit-before-persist (P1-1a)" comment,
  `tracking.gateway.ts:271-292`) so the live push isn't gated on the DB write. Fixed, and noted the
  server-side ≤1/sec coalescing that wasn't mentioned at all.
- **§13 — "one `Rating` per order (unique)" was stale.** Actual constraint is
  `@@unique([orderId, byProfileId])` (`schema.prisma:361-374`), deliberately allowing a customer→rider
  *and* a rider→customer rating per order (per the schema's own comment). Fixed.
- **§4/§1 — admin API mislabeled "read" / "read-only" in five places** (two Mermaid diagrams + one
  edge label + one module table row + one component-table row). `admin.controller.ts` exposes 10+
  mutating routes (hold/lift, suspend/ban, fare override, cancel, audit-actions) behind
  `JwtAuthGuard`+`AdminGuard`. Dropped the "read" qualifier everywhere it appeared.
- **§4 — `SecretsModule` diagram labeled "env / Key Vault".** No Key Vault (or any non-Env) secrets
  adapter exists anywhere in the repo — only `EnvSecrets`. Changed label to "env".

### docs/SECURITY.md
- **8 stale `file:line` citations** in the P0–P2 implementation-status subsections (the exact lines
  moved as the surrounding code grew): P0-1 JWT guard (`env.ts:33,67` → `:57,139-144`), P0-2 admin auth
  (stale "no middleware.ts" parenthetical + `api.ts:15` → `:26`), P0-3 WAF (`lb.tf:46` → `:60`), P1-3
  CORS (`tracking.gateway.ts:64` → `:79`), P1-4 OTP logging (`otp-sender.ts:94,105` → `:96,109`), P2-1
  SQL (`sql.tf:32` → `:34`), P2-3 JWT alg pin (`token.service.ts:28` → `:50,53`), P2-4 launch guards
  (`env.ts:39,45` → `:159-176`). A security doc with wrong file:line citations is exactly the kind of
  staleness that costs an incident responder time — all eight re-verified by reading the cited code
  before fixing.
- **§3 STRIDE table was out of sync with §5's own implementation-status table.** JWT spoofing,
  IDOR/tampering, admin repudiation, OTP log disclosure, and DoS rows all still said "⚠️ gap" after §5
  (added later in the same doc) marked the underlying items done or partially done. Refreshed the
  STRIDE Status column to match §5 (admin repudiation and DoS are now correctly shown 🟡 partial, not a
  flat gap, since IAP/SSO and `terraform apply` are still outstanding founder/platform steps).

### docs/LAUNCH-READINESS.md
- **§2 legend undercounted rounds.** "Rounds 1–2 executed" when §6 documents three, including Round 3
  (explicitly the first clean round). Fixed to "Rounds 1–3".
- **LR1 — e2e suite location.** Doc said `apps/api/test/e2e/`; that directory doesn't exist — the four
  `*-authz.e2e.spec.ts` files are co-located under `src/**`. Fixed.
- **LR5 — auto-pause "Do" text was describing scheduling work for an endpoint that no longer exists.**
  `POST /admin/cash/settlements/auto-pause` and the rest of the old weekly-settlement engine were
  removed when the model moved to prepaid per-ride commission (code comment confirms it); only a
  read-only `GET /admin/cash/settlements` survives. Rewrote the bullet — there's nothing left to
  schedule.
- **LR18 — exit-test claims content lives in `DESIGN-REVIEW.md`; it doesn't.** The refund-dead-write
  flag and per-journey state matrices are actually in this doc's own §6 Round-2/3 log. Retargeted the
  cross-reference.
- **LR19 — "token drift is already CI-guarded" contradicted both the actual CI config and this doc's
  own LR4 section two pages earlier**, which correctly hedges that `_adherence.oxlintrc.json` merely
  "suggests" future CI wiring. No lint script or workflow actually references that config. Softened the
  claim to describe the true (authored-but-disconnected) state.

### docs/PILOT-READINESS.md
- **T6 — "WhatsApp/SMS still stubbed."** `WhatsAppOtpSender` (`otp-sender.ts:45-86`) is a complete Meta
  Graph API implementation, gated only on vendor credentials — not a stub. Only `SmsOtpSender` is
  actually a stub (`TODO: call the SMS gateway`). Fixed to attribute the gap to SMS only.
- **D3 rating-on-tap — unmount behavior described backwards.** Doc said "unmount clears the pending
  submit"; the code (and its own inline comment) does the opposite — unmount **flushes** (submits) a
  still-armed rating; only explicit Undo cancels it (`RatingCard.tsx:30-35`). Fixed.

### docs/CONCEPT.md
- Order-status-flow sentence was missing the `undelivered` terminal state (see ARCHITECTURE.md finding
  above — same root cause, code has grown a status the docs hadn't caught up to).
- Pricing placeholder said "$1.50 + $0.50/km"; the actual constant is $0.60/km
  (`packages/shared/src/pricing.ts`). Fixed.

### docs/DESIGN.md
- Drift section wrongly claimed the customer-side §5c stepper wasn't built — it is
  (`app/order/[id].tsx` renders `<Stepper view="customer" />`). Only the rider side isn't wired (see
  CODE_BUG below). Reworded to be accurate about which side is actually missing.
- DT10 status row said notifications/support weren't built; both shipped 2026-07-06
  (`app/notifications/index.tsx`, `app/help/index.tsx`), after the table's 2026-06-27 snapshot date.
  Updated.
- Drift section listed `note` (create-order field) as having no UI; `app/home.tsx` now has a bound
  "Note for the rider" field. Dropped it from the no-UI list (`itemPhotoUrl`/`comment`/`reason` remain
  accurate).
- Drift section said sign-out "lives on home today"; it already lives on profile/settings, matching
  DT12's own "done" claim elsewhere in the same doc. Fixed the stale prose.

### docs/DESIGN-SYSTEM.md
- The "repo-side product tickets" list presented five items (contact-phone enforcement, 409 rollback
  copy, OTP lockout+re-issue, one-round-per-rider hiding, phone-reveal gating) as still-outstanding
  app-logic work. All five are implemented, with file citations. Rewrote to reflect what shipped, with
  bounded-timeout error handling flagged as the one item still open.

### CONTRIBUTING.md
- "CI runs on every PR... in two jobs" — it's three (`security`, `build`, `schema`); the `security` job
  (pnpm audit + gitleaks) wasn't listed at all. Added the row.
- The `build` job's step list was missing `lint`, which runs between `typecheck` and `build` in
  `ci.yml`. Added.

### infra/terraform/README.md
- Secrets row was missing `PII_ENCRYPTION_KEY` (generated by `secrets.tf`, referenced in
  `release.yml`'s `SECRETS=` string alongside the three that were listed). Added.
- "set `ipv4_enabled = false`" named an internal Terraform resource attribute, not the variable a user
  actually sets — the real `terraform.tfvars` knob is `db_public_ip_enabled` (`variables.tf:112`).
  Fixed.

### packages/design/ (minor factual drift)
- `COVERAGE.md`: "12 reusable components" → 14 (actual count of named exports in `components/**`).
- `components/typography/typography.prompt.md`: Heading spec said "24px / 800"; no 800 weight exists
  anywhere in the token set (`--weight-bold: 700`), and the same doc's own visual-foundations section
  already said 700. Fixed.
- `readme.md`: tokens/ file list was missing `icons.css`, which exists on disk and is listed in
  `HANDOFF.md`'s own file tree. Added.
- `ui_kits/mobile/README.md`: primitives list was missing `Icon` and `OfflineBanner`, both of which
  `ui_kits/mobile/app.js` actually imports and renders from `_ds_bundle.js`. Added.

---

## CODE_BUG — reported, docs left untouched

These are cases where the doc reflects a real, deliberate intent and the *code* is what's out of step.
Per the reconciliation rule, these are tickets, not doc edits.

1. **Missing global `ValidationPipe` backstop (security-relevant).** `docs/SECURITY.md`'s P1-3 item is
   marked fully ✅ and its own roadmap text calls for a global `ValidationPipe`
   (`whitelist/forbidNonWhitelisted/transform`) so a controller that forgets its `ZodBody` pipe still
   can't accept unexpected fields. A repo-wide grep for `ValidationPipe`/`forbidNonWhitelisted` in
   `apps/api/src` returns zero matches. The per-route zod `.strict()` schemas work, but only for routes
   that remembered to opt in — there is no backstop for one that doesn't. Worth a real ticket.
2. **CONTRIBUTING.md's local-setup instructions don't actually work as written.** `cp .env.example
   apps/api/.env` only gets read by the Prisma CLI (`prisma.config.ts` calls `process.loadEnvFile()`).
   `apps/api/src/main.ts` and `apps/api/prisma/seed.ts` never load `.env` at all, and `DATABASE_URL` has
   no schema default — so following the doc's own steps 7–8 (`pnpm db:seed`, `pnpm dev`) crashes on
   boot with "Invalid environment configuration." Either wire `process.loadEnvFile()` into `main.ts`/
   `seed.ts`, or change the docs to instruct exporting the vars into the shell.
3. **Rider-side §5c stepper never wired**, despite `docs/DESIGN.md`'s DT12 row claiming "done ... §5c
   stepper (both sides)." The `Stepper` component already supports `view="rider"`
   (`apps/mobile/src/ui/index.tsx:280-283`) but `apps/mobile/app/rider/job.tsx` only renders
   `StatusPill`. One-line fix: wire `<Stepper view="rider" />` in, matching what `order/[id].tsx`
   already does for the customer.
4. *(Lower-confidence, noted alongside #1 above but distinct):* the P1-2 roadmap text in
   `docs/SECURITY.md` prescribes `@nestjs/throttler`; the shipped control is a bespoke
   `ThrottleGuard` reusing the existing Redis `OtpStore`. Functionally equivalent and arguably better,
   but worth a maintainer's eyes if the doc's literal prescription matters to them — not treated as a
   real gap since the acceptance criterion (429 on flood) is met.

## ORPHAN — flagged for a human decision, not silently edited

- **`docs/CONCEPT.md` §3/§4 — declared-value cap and prohibited-items list.** Listed as a "must ship"
  MVP trust feature (max ~US$100–150/item cap, banned categories) under a doc whose banner claims the
  MVP has shipped. No trace anywhere in code: `declaredValue` is a passthrough field with no min/max
  validation, and no prohibited-items constant exists. This reads like a real gap rather than a
  documented future cut — flagging for a product decision (build it, or explicitly mark deferred) rather
  than assuming either answer.

## Ambiguous / lower-confidence (no action)

A handful of findings didn't clear the bar for either a doc fix or a ticket — noted here so they're not
silently dropped, but nothing was changed:
- `docs/CONCEPT.md` §9's "deploy defaults `KYC_PROVIDER=didit`" claim is true at the *deploy-workflow*
  level (`release.yml` sets it) but the app's own schema default is `stub` — plausibly intentional
  (safe-by-default in code, explicit override at deploy time) rather than wrong.
- `docs/LAUNCH-READINESS.md` LR11's load-test scenario list is broader than what's actually scripted
  (no WS/tracking-room or admin-read k6 scenarios exist yet) — the scorecard's terse "harness authored"
  isn't false, just optimistic about coverage.
- `docs/LAUNCH-READINESS.md` LR21's "CI release job... provisioned + deployed" framing can't be fully
  confirmed from code alone — `release.yml` is gated behind a `GCP_DEPLOY_ENABLED` repo variable not
  visible in-repo.
- A few `docs/ARCHITECTURE.md` §10 WS events (`presence:stale`, `bid:expired`, `order:taken`,
  `job:cancelled`, `order:rebroadcast`) and the §11 upload size cap (8 MiB) are real but undocumented —
  these are omissions, not false claims, so left as a follow-up rather than an edit in this pass.
- `packages/design/components/core/Card.d.ts` has a stale docstring (12px radius, hairline border) that
  contradicts both the actual `Card.jsx` and its own `Card.prompt.md` sibling — not in the scoped doc
  list for this run, flagging for a future pass.

## Coverage note

This run prioritized the docs classified 🟢 Living in `docs/README.md`'s own table, plus root/app
READMEs and the design-package docs. `docs/ARCHITECTURE.md`'s system-context / monorepo-layout /
GCP-deployment / module-map subsections (roughly §1–§5, excluding the admin-API mislabeling and
Secrets-module fixes already captured above) and `docs/PILOT-READINESS.md`'s T0–T13 scorecard were
each independently re-verified by a dedicated pass and came back clean (15/16 and 14/15 claims verified
respectively, both already folded into this report). `docs/LOAD-MODEL.md`, `docs/DATA-RETENTION.md`,
`docs/QA-DEVICE-CHECKLIST.md`, and `apps/api/load/README.md` were checked and came back clean.
`docs/plans/*.md` and the 📋 review-log docs were intentionally out of scope (decision history, not
living specs) — a future run should still spot-check whether any of them have quietly become the *only*
place a still-true claim lives, the way the LR18/LR19 exit-test cross-references had.
