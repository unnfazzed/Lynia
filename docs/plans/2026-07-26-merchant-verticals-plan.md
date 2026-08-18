# Merchant Verticals — Build, Design & Deployment Plan

**Status:** P0 COMPLETE (2026-07-27, see §0c) · **superseded as the execution plan (2026-07-28)** —
the design track landed (July 2026 design update in `packages/design/`) and the founder moved to a
**joint Restaurants + Send launch**. Execution now runs per
`docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md`, which restates §0a's phased GTM and
the P1–P5 phase table; this doc's §0b locked decisions, §2 repo strategy, §4 test gates and §7
money-safety non-negotiables remain binding as amended there.
**Target launch:** ~~Restaurants vertical, Sept–Oct 2026~~ → one joint launch, see the 2026-07-28 plan
**Source pack:** `LyniaGo_Merchant_Handoff` (`00_START_HERE`, `01_CONCEPT`, `02_MERCHANT_SPEC`, `03_BUILD_PLAN`)
**Scope of this doc:** how the merchant build is structured in the repo, how it is designed, tested and
deployed, and — above all — **how it ships without ever putting the live Express product at risk.**

> Where this doc and the code disagree, **the code wins** — reconcile and flag it.

---

## 0a. Office-hours review outcome (2026-07-27) — ground truth and decisions

An office-hours concept review pressure-tested this plan before execution. Full record:
`~/.gstack/projects/unnfazzed-Lynia/root-claude-feature-planning-deployment-wkbc92-design-20260727-071004.md`
(adversarially reviewed, 8/10). Corrections and decisions binding on this plan:

- **Ground truth correction: Express is NOT live.** The handoff pack's premise ("the live
  Express product, the only revenue product") is ahead of reality: Express is built and
  deployed but **pre-launch, awaiting Google Play approval, with zero users**. Everything in
  this plan that protects "live Express" applies from the moment Express launches; until
  then the protection posture is still followed (it is free) but the real risk being managed
  is sequencing, not regression.
- **Decision: Approach A — full build, full steam** (founder's call over the session's
  spine-first recommendation, on the rider-utilization argument: the targeted rider fleet
  needs multi-vertical order density to retain, so Restaurants is Express's supply-retention
  strategy). P0→P5 execute in sequence per this plan.
- **Go-to-market milestones (now part of the plan):** Play approval → launch weekend
  targeting **100 registered riders** → **500 riders by end of August** → **September:
  onboard 5+ named pilot restaurants** → mid-October Restaurants launch.
- **Geographic strategy: density-first around the Harare CBD.** Riders already concentrate
  in the CBD; pilot merchants are recruited from the restaurants around those concentration
  zones so Express + Restaurants order flow overlaps one tight radius. Dispatch radius and
  delivery-fee assumptions tune for dense-urban distances first.
- **Founder-side cut line (trigger-based, pre-agreed):** if Play approval hasn't landed by
  mid-August, or fewer than 5 merchants are committed by **September 15**, or rider
  activation is materially behind (see the utilization metric below), then P0–P2 and the
  design track continue but **P4/P5 do not start** and the October date slips per §7's cut
  line. A downshift by rule, not a debate.
- **Merchant recruitment moves to August.** P5's "onboard 5–10 pilot restaurants" is pulled
  forward as parallel founder street-work: 5+ named, committed CBD merchants by Sept 15
  (stretch: two weeks). Each yes also captures 2–3 customer referrals (the named demand-side
  list) and the ground-truth economics (current order channel, delivery cost/turn-aways).
- **Economics ship as config, not constants.** Delivery fee, commission display, COD caps,
  float sizes are flags/config so September's merchant conversations can tune them without
  a rebuild.
- **New P0 task — rider-utilization metric:** track **orders per active rider per day**
  from Express launch day (a SQL query + weekly check suffices at pilot scale). Trigger: a
  fleet average **<1 order/active-rider/day by Sept 15** puts the utilization thesis in
  question — revisit rider-recruitment pacing and Restaurants launch scope before P5.

## 0b. Engineering review outcome (2026-07-27) — locked architecture decisions

`/plan-eng-review` ran against this plan + the repo before P0 code. All decisions locked; the
outside-voice (independent model) challenge produced three P1 corrections, accepted below.

**Locked decisions (binding on P0–P2 implementation):**

1. **State model (1A):** merchant orders reuse the existing `OrderStatus` skeleton + a new
   nullable **`merchantPhase`** enum column for merchant-only sub-states. No new `OrderStatus`
   values; `one_active_ride` (migration `0001_init` :150) keeps covering merchant orders
   unchanged.
2. **FloatLedger is purely derived (2A):** no stored `balanceAfter` (deliberate divergence from
   `CommissionLedger` — the plan's "derived, never stored" non-negotiable wins; document with a
   schema comment). Headroom = SUM over unresolved entries, partial-indexed.
3. **Flags (3A):** env kill switches via the existing `env.ts` z.enum pattern
   (`RESTAURANTS_ENABLED`, `MERCHANT_DISPATCH_AUTO_ENABLED`, `MERCHANT_WALLET_ENABLED`),
   mirrored in `packages/shared`; cohort gating on `Merchant`/`Profile` domain rows
   (`Merchant.pilotEnabled`). No flags table. **Plus (outside voice #4): a named P0 deliverable —
   a server flags/config endpoint (the `/wallet/config` precedent) so mobile can read flag state;
   "remote config" for the app = this endpoint.**
4. **Golden test (4A):** extend `offer-loop.int.spec.ts` + `order-lifecycle.int.spec.ts` into a
   flags-absent / flags-off matrix + a merchant-routes-404-when-disabled spec, **plus a
   seeded-cohort leg** (pilot merchant/profile rows seeded, vertical on) so the matrix tests the
   state production will actually run.
5. **FloatLedger idempotency at the DB (5A, corrected by outside voice #2):**
   **`UNIQUE (order_id, type, rider_id)`** partial unique via raw-SQL migration (WD-015
   pattern). Three columns, not two — reassignment legitimately writes a second RESERVE for a
   different rider on the same order.
6. **Concurrency proofs deferred (6B, founder's call, risk accepted)** — the merchantPhase
   pair-guard race and concurrent-RESERVE race are covered by unit tests + the P4 E2E gate, not
   dedicated int-spec proofs. **Mitigation accepted (outside voice #3): the reserve transaction
   takes `SELECT … FOR UPDATE` on the rider row**, closing the same-rider race by serialization
   (the wallet's existing pattern). Pair-coherence (no `status=delivered` with a live
   `merchantPhase`) is added to the P2 gate invariants.
7. **Non-negotiable #4 re-scoped (outside voice #1 — the big correction):** "never refactor live
   Express" was fiction under decision 1: Express machinery keys on status with no type filter
   (`offer-expiry.service.ts` sweep, notifications, the lifecycle CAS table), so merchant orders
   sit inside its blast radius by construction. New wording: **"Express edits are limited to
   `orderType` filters, each enumerated by a P0 status-keyed-query audit and covered by the
   golden matrix."** The P0 audit (grep every status-keyed read/write on `orders`) is a named
   P0 task; discovering this mid-P2 was the failure mode.
8. **Dormant-code protection (outside voice #7):** merchant test suites become **required CI
   checks from the first P1 PR** (not P4), and `docs/KNOWN_BUGS.md` gets a merchant lane in the
   dedupe protocol — the repo's auto-merge routines must never rewrite an untested dormant money
   path.
9. **Staging rehearsals get a synthetic-data step (outside voice #5):** prod is empty pre-launch,
   so "no long lock on a prod-sized clone" requires a seeded synthetic dataset (orders at
   ~100k-row scale) as part of P0 staging arming.
10. **P3 pre-decision (outside voice #9):** the merchant dashboard's install mode (browser tab vs
    installed PWA/TWA vs a merchant role in the existing Expo app) is an explicit design-track
    decision before P3 — Wake Lock/audio/WS survival on cheap Android tablets is a product
    constraint, not polish. Tablet ownership + data cost land in the merchant onboarding
    checklist.
11. **Float funding definition (outside voice #10):** whose money the float is (rider self-funded
    at v1 per the concept, platform-advanced later) is added to the design track's economics
    questions and the merchant/rider onboarding copy — headroom sizing and WRITE_OFF loss
    allocation both hinge on it.
12. **Cut-line addition (outside voice #8):** the founder-side cut line (§0a) also triggers on
    Play **closed-testing/production-access gates** (new developer accounts: 12 testers /
    14 days) — the second (merchant) binary submission stacks on the first's approval.

## 0c. P0 execution record (2026-07-27) — done, open, next

P0 engineering is **complete and merged**: PRs #402 (status-keyed-query audit + utilization
tripwire + synthetic staging seed), #403 (flag registry + public `GET /app/feature-flags` +
golden matrix + boundary rule), #404 (`apps/merchant` scaffold), #408 (main restored to
green after the dependabot incident — lucide icon, find-my-way advisory, and a **measured
720 KB Sentry bundle regression** now pinned + dependabot-ignored; merchant flags wired into
both deploy workflows so **launch is a repo-Variable flip**), #411+#413 (gated
`terraform apply` from CI, twice security-reviewed, dormant until armed).

Full narrative, verification state, and the ordered step lists (staging exit gate, gated-
apply arming, design reconciliation, P1 task order):
**`docs/plans/2026-07-27-p0-execution-report.md`**. The Design Lab brief handed to the
founder is preserved verbatim at **`docs/plans/2026-07-27-merchant-design-brief.md`**.

Open at time of writing: the **P0 exit gate** (staging migration rehearsal — founder-gated
on `GCP_STAGING_ENABLED`; P1 migrations do not ship before it), the **design track**
(founder in Claude Design Lab; output reconciles against `packages/design` before P3/P4),
and the optional **gated-apply arming** (ordered steps in the workflow header).

## 0. The one-line summary

Merchant verticals ship as **new order types inside the existing app**, built on **trunk-based development
behind feature flags**, designed **ahead of the build** against the vendored design system, and **dark-launched
to production for weeks** before a **config flip** — not a deploy — turns them on for a pilot corridor.

---

## 1. Strategy decision: trunk-based + feature flags

The instinct for "don't break the live app" is to isolate months of work on a long-lived branch. **This is the
wrong call, and it is not what the platforms this product is modelled on actually do.**

- **Uber, DoorDash, Grab, Gojek and Airbnb all merge continuously to a single trunk** and hide unreleased work
  behind feature flags / gates rather than branches. A months-long feature branch rots, diverges from Express,
  and ends in one high-risk big-bang merge — the exact outcome "don't affect the live app" is trying to avoid.
  (Uber built *Piranha* specifically to delete stale flags afterwards — the flag, not the branch, is the unit
  of isolation.)
- **The safety comes from the flag being OFF in production**, not from the code living elsewhere. New code
  reaches `main` continuously, dormant, exercised on staging, and reaches no user until a cohort is enabled.
  This is DoorDash's "dark launch" and Gojek's experiment-platform model.
- **This repo is already a trunk-based pipeline.** `ci.yml` runs on every PR; `deploy-staging.yml` deploys every
  merge to `main`; `release.yml` promotes the same image to a prod canary; `CLAUDE.md` mandates squash-merge on
  green. A mega-branch fights the repo's own conventions.
- **Physical isolation is reserved for the genuinely new surface.** The merchant dashboard is a brand-new
  `apps/merchant` Next.js app on its own deploy pipeline — it cannot break Express even when it is broken.

**Decision: trunk-based development, small PRs, every merchant path behind a flag that is OFF in production
until the pilot.**

---

## 2. Repo strategy

### 2.1 Branching

- Short-lived PR branches → squash-merge to `main` on green, per existing convention.
- **No long-lived integration branch.** The "epic" view is a GitHub milestone/label, not a branch.
- Every PR is independently mergeable and **dormant on merge** — it changes no observable behaviour with flags
  off. If a PR cannot be made dormant, it is too big; split it.

### 2.2 The feature-flag layer (build FIRST, in P0)

There is **no flag system in the repo today** — configuration lives in `apps/api/src/config/env.ts`. Building it
is therefore the first task, before any feature code:

- A small **server-side flag registry**, mirrored in `packages/shared` so client and server agree on flag names
  and an order-type/`verticalType` guard makes merchant code paths unreachable when disabled.
- **Granularity that matches the cohort rollout model:**
  - a **global kill switch per vertical** (`RESTAURANTS_ENABLED`),
  - a **per-merchant / per-cohort allowlist**, so the pilot is 5–10 named restaurants and specific pilot
    rider/customer devices — never "on for the world",
  - an **independent flag per risky sub-path** (AUTO dispatch, wallet payment, delivery-failed/return flow) so
    one can be killed without killing the vertical.
- Flags are **removed** once a path is permanently live — stale flags are technical debt with a security edge.

### 2.3 Monorepo isolation — keeping Express blast-radius at zero

| Surface | Placement | Why |
|---|---|---|
| Merchant dashboard | **new `apps/merchant`** (Next.js, mirroring `apps/admin`'s `app/` router layout) | own Cloud Run service + deploy workflow; cannot take down the API |
| Merchant backend | **new NestJS modules** (`merchant`, `dispatch`, `float-ledger`, merchant order paths) | additive only — never edits live `offers` / `matching` / Express order paths |
| Contracts | `packages/shared` (zod + enums) | a contract mismatch becomes a compile error, not a runtime surprise |
| UI primitives | `packages/design` | one visual language across admin / mobile / merchant |

**Enforce the boundary mechanically.** The repo already runs **dependency-cruiser** (`.dependency-cruiser.cjs`
plus a known-violations baseline). Add a rule that merchant modules may depend on shared primitives but **live
Express modules must not depend on merchant code** — coupling can then only ever point one way, and CI proves it.

`OrderType.merchant` is **already a reserved seam** in the schema — extend that enum path, never invent a
parallel one.

---

## 3. Design track — where product design fits

Design runs **ahead of the build, not inside it.** Every UI phase is gated on an approved design, so engineering
implements a decided design rather than inventing UI mid-build. This mirrors how Airbnb (DLS), Uber (Base) and
DoorDash (Prism) sequence system-first design work.

### 3.1 What already exists (design is not starting from zero)

- **`packages/design/`** — the visual source of truth: CSS-variable tokens, React primitives
  (`components/core|feedback|forms|journey|typography`), brand assets, and the **`ui_kits/`** + `guidelines/`
  specimens.
- **`packages/shared/src/design-tokens.ts`** — the app token contract consumed by `apps/mobile` and
  `apps/admin`; `apps/merchant` consumes the same one.
- **`docs/DESIGN.md`** — the living design/UX spec (customer + rider IA, interaction-state and empty-state
  matrices). Merchant screens extend this doc; they do not start a new one.
- **`packages/design/handoff/design-tokens.ts`** — the handoff artifact to feed into external design tooling.

The system is a deliberate **Grab-style clean-utility** language. Note the **accent split** when designing
anything green: fills/graphics → `accent`; button fills → `cta`; **anything a user reads → `accentText`**.

### 3.2 The Claude Design Lab pipeline

Design Lab is the **divergence + mockup engine** — fast exploration and visual iteration. It produces standalone
mockups, while the product ships from `packages/design` into `apps/merchant` and `apps/mobile`. The handoff
between the two is where teams typically create drift, so it is explicit here:

```
1. DIVERGE   — Claude Design Lab: generate + iterate merchant dashboard,
               3-tab customer flow, checkout (CASH/WALLET), rider offer screens.
               Seed it with packages/design/handoff/design-tokens.ts so the
               mockups explore in OUR visual language, not a generic one.
                          ↓
2. RECONCILE — resolve every mockup to real tokens + existing components in
               packages/design. Anything that cannot resolve is either a
               deliberate new primitive (add it to the system) or drift (drop it).
                          ↓
3. FORMALIZE — gstack /design-consultation → /design-html produces
               production-quality, design-system-native HTML/CSS.
               /design-review does the QA pass (spacing, hierarchy, AI-slop).
                          ↓
4. BUILD     — engineering implements the approved spec. /design-review on the
               running UI, then /qa for browser testing.
```

**Rule: Design Lab output is an input to the design system, never a bypass of it.** A mockup that ignores the
tokens creates a second, drifting UI — the failure mode this pipeline exists to prevent.

### 3.3 Design gates

| Design deliverable | Approved before | Notes |
|---|---|---|
| Merchant dashboard (live queue, accept/reject + prep time, confirms, catalog, hours) | **P3** | the highest-stakes surface |
| Customer Restaurants flow (tab, merchant list, catalog, cart, checkout CASH/WALLET) | **P3/P4** | reuses existing tracking + rating screens |
| Rider AUTO-offer, pay-merchant confirm, float widget, delivery-code capture | **P4** | extends the rider IA in `docs/DESIGN.md` |
| Pharmacy prescription upload + pharmacist review | **P6 only** | do not design now — regulatory-gated |

### 3.4 The two screens where design *is* money-safety

These deserve disproportionate iteration; they are validation problems that begin as design problems.

1. **Evidence-bearing confirm screens.** Merchant "wallet received → enter txn ref + amount" and "cash received →
   confirm exact amount". The design must make short-payment and spoofed-SMS mistakes *hard*: expected amount
   shown prominently, reference required, never a bare "confirm" button. Merchant rule to surface in the UI copy:
   **only your own statement counts, never a customer-shown SMS.**
2. **The merchant live-order queue.** Looping audio alert (unlocked by the login tap), Screen Wake Lock,
   heartbeat, and an unmissable "connection lost" banner. It runs on a cheap tablet in a noisy kitchen — the
   new-order state and legibility *are* the merchant product.

---

## 4. Test strategy — the gates are law

Layered so that money-safety and Express safety are proven before any UI exists.

1. **The Express golden regression test — the single most important safety artifact.** An end-to-end test
   asserting the live offer-loop and hashed-OTP delivery path behave **identically with merchant flags on and
   off**. Runs on every PR and every deploy. If merchant work ever perturbs Express, it goes red before merge.
   *(Built/verified in P0.)*
2. **Money invariants (P1–P2), before any UI:**
   - per order, `sum(FloatLedger) = 0` **or** exactly one booked `WRITE_OFF` equal to the fronted amount;
   - no order rests non-terminal with committed float past its timeout;
   - every wallet `REJECTED`/`CANCELLED`/`NO_RIDER` order either never took payment (pre-accept) or has a
     matching refund entry;
   - `Merchant.accruedCommission` (derived, never a stored counter) equals the weekly statement; every reversal
     has an offsetting entry.
3. **State-machine exhaustiveness (P2):** every exception path (`DELIVERY_FAILED`, `RETURN_TO_MERCHANT`,
   `REFUND_PENDING`/`REFUNDED`, `PAYING`) reaches a terminal state; the dual-confirm SLA force-advance fires
   (no deadlock); a simulated rider-offline reassigns.
4. **Migration rehearsal (every migration):** applies **and rolls back** on a prod-sized staging Cloud SQL clone
   with **no long lock on `orders`**.
5. **End-to-end on staging (P4):** cash and wallet orders each complete customer→rider→merchant with correct
   ledger entries; `NO_RIDER` fires within the wall-clock cap and before "kitchen fired"; a scripted AUTO-vs-
   Express race proves the offer soft-lock + `one_active_ride`.
6. **Real-device money test (P5):** a deliberate no-show books a clean `WRITE_OFF` + customer flag on real
   hardware **before any real merchant transacts.**
7. **CI wiring:** merchant suites + the dependency-cruiser boundary rule become **required checks** in `ci.yml`.

---

## 5. Deployment strategy

> **`apps/merchant`'s own Cloud Run deploy pipeline (the §2.3 "own deploy workflow" piece) is now built
> — see `docs/plans/2026-merchant-console-deployment.md`.** Dockerfile, `deploy-merchant.yml`, and the
> Terraform edge (mirroring the admin console's, but public — no IAP) are merged and dormant behind
> `GCP_MERCHANT_ENABLED` / `merchant_enabled` until the founder arms them. This is orthogonal to the
> backend flags below: standing up the dashboard's URL is not the same as flipping the vertical live.

The pipeline already has the tiers — `deploy-staging.yml` → release-please → prod canary → `rollback.yml` +
`deploy-autoheal.yml`. Merchant *backend* work (the NestJS modules behind `apps/api`) rides these rails
rather than inventing new ones.

- **Dark launch continuously.** Merchant code deploys to production behind OFF flags from week 2. It is *in*
  production, reachable by nobody. **Launch day is therefore a config flip, not a deploy** — the risky code has
  already been running silently for weeks.
- **Expand/contract migrations only.** New columns nullable with app-level defaults; new capability in new
  tables; rehearsed on the staging clone; applied in **Express off-hours**. No renames or drops in v1.
- **Cohort rollout.** Enable Restaurants for 5–10 pilot merchants and named pilot rider/customer devices in
  **one corridor**, watch the canary and the money invariants, then widen. The kill switch reverts instantly
  with zero deploy.
- **Mobile is the long pole — plan the binary now.** In P0, audit which app surfaces are **EAS-Update (OTA)
  shippable vs. binary-forcing** (`mobile-ota.yml` vs `mobile-release.yml`). Camera/prescription capture forces a
  binary and store review takes days. So: **submit the feature-flagged binary ~Wk6 (early Sept)** with Express +
  Restaurants tabs, Restaurants **dormant behind remote config**, flipped on for the pilot after approval.
  **Ship without the Pharmacies tab** (App-Review + regulatory risk) — Pharmacies is the P6 fast-follow.
- **Rollback is a flag, not a redeploy.** Incident response is "flip off"; `rollback.yml` + autoheal remain the
  infra-level backstop.

---

## 6. Phase plan (engineering + design tracks)

| Phase | Engineering | Design (runs ahead) | Exit gate |
|---|---|---|---|
| **P0** | Staging Cloud SQL clone + staging deploy; close the 3 source unknowns (§8); **build the flag registry**; dependency-cruiser boundary rule; scaffold `apps/merchant`; stand up the **Express golden regression test**; **rider-utilization metric** (orders/active-rider/day, §0a); **status-keyed-query audit** (§0b.7); **server flags/config endpoint** (§0b.3); **synthetic staging dataset** (§0b.9) | `/design-consultation` on the merchant vertical; confirm `packages/design` covers dashboard + new tabs or extend it; **Design Lab: first divergent mockups** | No-op migration applies **and** rolls back on staging; audit answers written down; **Express green and untouched** |
| **P1** | Additive migration set; **`FloatLedger`** + merchant `CommissionLedger` (clone the existing append-only, idempotent, signed shape) | Lock **customer Restaurants flow** + **merchant dashboard** → reconcile to tokens → `/design-html` → `/design-review` | Migration: no long lock on a prod-sized clone; a full cash order's float nets to zero; derived balances match hand-computed |
| **P2** | **The spine, before any UI:** one guarded `OrderTransitionService` (transition table + row-level locking, `UPDATE … WHERE status=EXPECTED`); every failure path; per-state timeouts via the BullMQ reconciler + rider heartbeat; per-customer COD controls (reuse `onHold` + strikes) | Design **rider** AUTO-offer / pay-merchant / float-widget screens while eng builds the spine | **Non-negotiable:** every exception path terminates; every terminal state nets the float or books one `WRITE_OFF`; **no path strands float**; dual-confirm cannot deadlock |
| **P3** | `apps/merchant`: login, WebSocket queue (reuse TrackingModule) + page audio + wake lock + connection banner, accept/reject + prep time, **evidence-bearing confirms**, refund path, catalog + hours editor, weekly commission view | `/design-review` on the running dashboard | Tablet reboot → banner within heartbeat; new order rings after one login tap; **scripted spoofed-SMS confirm blocked** by amount/ref check; post-accept reject produces `REFUND_PENDING` |
| **P4** | `DispatchStrategy` seam + tick + `DispatchDecision` log (**Express offer-loop untouched**); nearest-ETA ranking; float precheck at PLACED; bounded latency + wall-clock cap + "rider secured" signal; offer soft-lock + AUTO fee floor; customer Express+Restaurants tabs; rider AUTO offers, float widget, masked customer contact; **delivery-code POD only** | `/design-review` + `/qa` on customer + rider surfaces | E2E on staging: cash **and** wallet complete with correct ledger entries; `NO_RIDER` within cap; AUTO offer soft-locks the rider out of an Express accept in a scripted race |
| **P5** | **Submit the flagged binary (~Wk6)**; onboard 5–10 pilot restaurants (Didit on owner + physical-premises check during catalog seeding); tune float / delivery-fee / COD caps; closed pilot in one corridor → fix → **launch** | Pilot-feedback design fixes only | Money invariants pass **on real devices**; deliberate no-show books a clean `WRITE_OFF` + customer flag; store build on all pilot riders **≥3 days** before launch |
| **P6** (post-launch) | Pharmacies (gated on MCAZ/PCZ + DPA/POTRAZ sign-off): `Script` entity + perceptual-hash dedup + expiry, `PharmacistAccount` + Rx-review hours, `AMENDMENT → CUSTOMER_RECONFIRM`, prescription-image data protection, strict recipient-verified POD. **Then** fold Express onto shared rails, off-hours, behind a flag. Batching only when the `DispatchDecision` log shows the density trigger | Pharmacy screens designed **only now** | — |

---

## 7. Non-negotiables and the cut line

**The money-safety spine — never cut:**

1. **Money is a ledger, not a flag** — append-only, idempotent, signed; balances **derived**, never stored counters.
2. **Every terminal state resolves money cleanly**, including `DELIVERY_FAILED` / `RETURN_TO_MERCHANT`. **No order
   may strand a rider's float.**
3. **Payment confirmations carry evidence** (txn reference + amount), never a bare boolean.
4. **Express edits are limited to `orderType` filters** — each enumerated by the P0
   status-keyed-query audit and covered by the golden matrix (re-scoped at eng review, §0b.7;
   the old absolute "never refactor live Express" was unimplementable under the shared-table
   state model). AUTO dispatch and merchant POD remain parallel additions behind flags.
5. **Additive, expand/contract migrations only**, rehearsed on a staging clone, deployed in Express off-hours.

**Cut line if the schedule slips — sacrifice in this order:**

1. Batching *(already cut; also blocked by the `one_active_ride` constraint)*
2. Pharmacies tab in the binary *(already cut; regulatory + App-Review)*
3. Ops-admin dashboard mode *(use Prisma Studio/SQL for a 5–15 merchant pilot)*
4. Wallet payment — **ship cash-only**, de-risking the refund/evidence surface
5. Move the launch to early Nov — **a slipped date beats an untested cash-handling flow**

> **Cut features, never the money spine.**

---

## 8. Open questions to close in P0 (read the source, don't re-derive)

1. Can the **delivery-OTP verify path** serve a merchant order **without touching Express completion logic**?
2. Exactly which **mobile surfaces are EAS-Update-shippable** vs. force a new binary?
3. Is **`CommissionLedger` generic enough to instantiate `FloatLedger`**, or does float want its own table
   copying the shape?

**Repo facts already confirmed — do not re-derive:** `one_active_ride` partial-unique index prevents double
active assignment (30s heartbeat liveness in the select); the hashed-OTP delivery code is reusable (rotate,
5-attempt cap, row-locked, CI-asserted); uploads are GCS **V4 signed URLs** (private baseline); `OrderType.merchant`
is reserved and `OrderStatus` is a guarded-CAS machine including an `undelivered` terminal; `Profile.onHold` +
strike/cooldown exist; BullMQ has an `offer-expiry` worker and a stale-trip reconciler; the TrackingModule
WebSocket gateway exists; `CommissionLedger` **already has reversal/adjustment**.

---

## 9. First actions on approval (all of P0 lands on `main`, flag-dormant)

1. Stand up the **staging Cloud SQL clone** + staging backend (`deploy-staging.yml` is built for this and is
   currently dormant behind `GCP_STAGING_ENABLED`).
2. **Read three source paths** to close §8's unknowns and write the answers down.
3. **Build the feature-flag registry + the dependency-cruiser boundary rule** — the safety substrate everything
   else hides behind.
4. **Scaffold `apps/merchant`** and stand up the **Express golden regression test**.
5. **Kick off `/design-consultation`** and seed Claude Design Lab with
   `packages/design/handoff/design-tokens.ts`.

Each is a small, independently-mergeable, flag-dormant PR — so even P0 reaches `main` without touching Express.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1* | CLEAR | *covered by `/office-hours` 2026-07-27 (design doc APPROVED, 8/10 adversarial) |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | CLEAR | outside voice (Claude subagent — Codex CLI absent): 12 findings, 3 P1 accepted as corrections |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 6 issues (4 architecture, 1 code quality, 1 tests), all decided; 0 critical gaps open |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | scheduled inside P0–P1 design track (plan §6) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not applicable pre-code |

**CROSS-MODEL:** the outside voice confirmed the review's reuse map and flag/ledger decisions, and
overturned two of them in part: non-negotiable #4 re-scoped to orderType-filter edits (§0b.7) and
the FloatLedger unique key widened to (order_id, type, rider_id) (§0b.5). Both accepted by the
founder. The 6B risk (no dedicated concurrency proofs) was mitigated with rider-row `FOR UPDATE`
rather than reversed.

**VERDICT:** ENG CLEARED (CEO covered by office hours) — ready to implement P0.

NO UNRESOLVED DECISIONS
