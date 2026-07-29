# Restaurants + Send — joint launch plan (2026-07-28)

**Status:** ACTIVE — this is the governing execution plan for the July 2026 design update and the
Restaurants vertical. Execution runs via the five scheduled **build loops** (§6); their work queues
are the lane checklists in §5, ticked in the same PR as the work.
**Founder decision (2026-07-28):** **Restaurants and Send (parcels) launch at the same time**, in
one binary, one launch moment. This supersedes the phased go-to-market in
`docs/plans/2026-07-26-merchant-verticals-plan.md` §0a (Express-first launch, Restaurants
mid-October) and the design-side reveal mechanics (D-02 is already revised in the design source:
both tiles from first run, no "new service" moment).
**Design source of truth:** `packages/design/` as refreshed by the PR that adds this file
(July 2026 design update). Screen truth = `packages/design/explorations/journey/All Screens
Gallery.html`; product contract = `packages/design/RESTAURANTS-DECISIONS.md` (N-01…N-23,
D-01…D-35, R-01…R-17); rider IA = `packages/design/RIDER-ONE-APP-PLAN.md`; home IA =
`packages/design/HOME-2A-MERGE-PLAN.md`; standing engineering guide = `packages/design/HANDOFF.md`.
**Still binding from the 2026-07-26 plan:** §0b locked architecture decisions, §2 repo strategy
(trunk + dormant-on-merge PRs, monorepo isolation, dependency-cruiser boundary), §4 test gates,
§7 money-safety non-negotiables (as amended by §4 below), the status-keyed-query audit
(`docs/plans/2026-07-27-status-keyed-query-audit.md`), and the sensitive-lane review doctrine in
`docs/ROUTINES.md`.

> Where this doc and the code disagree, the code wins — reconcile and flag it.

---

## 1. The strategy change and what it means

Old model: Express launches first (pending Play approval), Restaurants ships dark behind
`RESTAURANTS_ENABLED`, lights up mid-October after a pilot. New model: **one launch**. Express is
still pre-launch with zero users, which makes this cheap: there is no live cohort to migrate, no
OTA constraint, no reveal moment. The launch binary carries the full new IA (launcher home, one
rider app, food flows) with both services on from first run.

What this changes:

- **The launch gate is now the union** of Play approval + all five lanes complete (§5) + pilot
  merchants onboarded + the §7 launch checklist. Restaurants can no longer slip independently —
  it either makes the launch or the launch waits (or the founder pulls the §1 escape hatch).
- **Flags become kill switches, not reveal tools.** `RESTAURANTS_ENABLED` ships **ON** at launch.
  It stays in the code as the escape hatch: if food is not ready when Play approval + rider
  recruitment say "go", the founder may choose to flip it OFF and launch Send-only with the same
  binary (the Food tile hides, Home degrades gracefully). That is a founder decision, not a
  schedule mechanism. Per-merchant allowlisting survives for the pre-launch pilot corridor.
- **The §0a cut line is restated** (§8 below). The old "P4/P5 don't start" downshift is dead —
  everything starts now; what the tripwires guard is the launch date and the flag position.
- **Merchant recruitment stays founder street-work in August** (5+ named CBD merchants), and it
  is now on the launch critical path, not the October path.

What this does NOT change: dormant-on-merge discipline (every PR keeps CI green and changes no
flag-off behaviour), Express blast-radius isolation, the money-safety spine, merge-on-green.

## 2. What the July design update changes (the three workstreams)

1. **New customer home + IA.** Root after login = launcher home (green BrandHeader + floating
   search, service tiles Send · Food · Pharmacy "Soon" · More, LiveOrderCard per running job,
   "Send again" rail, "Restaurants near you" photo rail). Tab bar **Home | Orders | Account**;
   Orders is one list across services. The existing map composer survives unchanged as the
   **Send** destination. Today's root IS the composer (`apps/mobile/app/home.tsx`, 962 lines) and
   the app has **no tab bar anywhere** — this is an IA restructure, not a reskin.
2. **One rider app.** Tab bar **Jobs | Money | Account**. One board receives parcel + food jobs
   (tagged cards; food offers pin with a 60s timer, parcel broadcasts have no countdown). One
   active-job screen on the shared Stepper with per-type steps. One **Money** tab: prepaid
   commission balance (both services, one `ratePct`), cash-held split ("yours" vs "owed to a
   kitchen"), one filterable ledger, top-up gate. **Retired:** the weekly-15% "Earnings" model,
   the standalone Earnings screen, the standalone wallet entry point, the old board/offline/
   online-empty, `offer_compose`, `profile`, `gate_commission` (see `gallery-map.js` header).
3. **Restaurants vertical (net-new).** Customer food flow (~46 screens), rider food jobs
   (18 screens), merchant kitchen tablet (39 screens, `apps/merchant`, web, tablet-first
   1024×680). The money model is deliberate and non-Uber-Eats-shaped — see §4.

Tokens: unchanged except one additive `--danger-ink` primitive. (The zip also flipped the
`--action-primary` alias to `--accent`, contradicting its own handoff and the sunlight-contrast
rule; reverted during sync — flagged for designer confirmation, see the PR body.)

## 3. Where the repo actually is (recon 2026-07-28)

Already built (do not rebuild):

- **Send product end-to-end** (composer → auction → tracking → delivery code, rider bid/job flow,
  safety flows, admin console). Correct per the handoff; it moves house, it does not change.
- **`Order.orderType`** (`parcel | merchant`) in schema + shared enums — the P0 seam.
- **Feature flags**: `RESTAURANTS_ENABLED`, `MERCHANT_DISPATCH_AUTO_ENABLED`,
  `MERCHANT_WALLET_ENABLED` (fail-safe OFF) + public `GET /app/feature-flags`
  (`restaurantsEnabled`) as the mobile remote config.
- **Prepaid commission wallet** (shipped 2026-07-15): API `wallet/` module (config, balance,
  ledger, topups, integrity job), Prisma `CommissionAccount`/`CommissionLedger`/`TopUp`, policy in
  `packages/shared/src/policy.ts` (rate 0% at launch, env-flipped), online gate
  (`commission_low_balance`) enforced server + client. The weekly-settlement engine is already
  removed (admin `/cash` is a read-only prepaid view). **Caveat:** the three top-up rails are NOT
  integrated — `app/wallet/top-up.tsx` is a "call support" screen; the only credit path is admin
  manual credit. That is acceptable at launch scale (see `TODOS.md` wallet items) — the Money tab
  re-homes this UI, it does not build rails.
- **`apps/merchant`**: 8-file Next.js scaffold, no auth (deliberate), CI-integrated.
  `merchant-routes-dead.e2e.spec.ts` + `express-no-merchant-coupling` depcruise rule actively
  prove the merchant API surface dead while dormant.
- **Status-keyed-query audit**: the 11 class-(a) sites that must gain `orderType` filters before
  the first merchant order row, each a named task.

Not built (the actual work): everything in §5. Notably **no merchant API module exists at all**
(only a bare `Merchant{id,name}` model), and the mobile app has no tab navigation.

## 4. Money-model deltas vs the 2026-07-26 plan (design revisions R-01…R-17)

The old plan's P1–P4 assumed rider-fronts-cash + `FloatLedger` + float prechecks + COD caps +
payment windows. The design contract revised all of that late — **the mockups already reflect the
revisions**, and the build lanes implement the revised model:

| Old plan assumed | Design contract now says |
|---|---|
| Rider fronts food cost; `FloatLedger` tracks float | **Cash is collect-and-return (R-01):** rider fronts nothing, takes food against a **recorded merchant debt**, collects at the door, keeps the delivery fee, returns the goods value immediately; no new offers until the merchant confirms the returned cash (N-20/N-21). "Pay me upfront" survives only as a per-shop merchant setting (R-03). |
| Float precheck at PLACED; headroom UI | **Deleted (R-10).** No float/headroom concept anywhere; upfront kitchens rely on rider self-declaration. |
| COD caps, first-order cash cap | **Dropped (R-02).** Controls are the doorstep dual-confirm handshake (R-04, N-19), customer cash-ban on refusal (R-08), rider suspension on non-return (R-07). |
| Wallet payment window (10:00), rail rings | **No payment clocks (R-16/R-17).** Kitchen calls first (logged), then requests payment; merchant confirms against their own statement **before cooking** (R-11); end-of-day close is the only automatic exit (N-23). LyniaGo never holds food money — "wallet" for food = customer pays the merchant's own rail; the app carries references + evidence, never funds. |
| Photo/signature POD options | Delivery code only (D-14), masked during transit on CASH orders until the handshake (R-09). |

**What survives untouched:** money is an append-only, idempotent, evidence-bearing ledger with
derived balances; every terminal state resolves money cleanly; payment confirmations carry
reference + amount; Express edits limited to `orderType` filters; expand/contract migrations only.
The `FloatLedger` concept is **replaced** by a **merchant-debt ledger** (release-unpaid →
dual-confirm handshake → return leg → returned-cash confirm), same engineering shape (append-only,
signed, idempotent, derived balances), different domain object. §0b decisions that referenced
FloatLedger transfer to the debt ledger.

## 5. Execution lanes and work queues

Five lanes, five loops (§6). Each unchecked box is one PR-sized increment: implement → five
states → tests → PR → merge on green → tick the box in the same PR. Order within a lane is
binding; lanes run in parallel with Phase-0 dependency gates. Keep every increment dormant-off
where it touches food paths (flags stay OFF in CI/staging until the launch flip).

### Lane A — customer home + IA (`apps/mobile`, customer surfaces)

- [ ] **A1 · Tab shell + Send demotion.** Root tabs Home | Orders | Account (Expo Router tab
  group); `app/home.tsx` composer moves to the `send` route **unchanged in behaviour**; boot
  route lands on the launcher; Send tile/search/edit-order push the composer; complete/cancel
  returns to the launcher. Port `BrandHeader` + `ServiceTiles` + `AppScreen` shell primitives to
  RN per `components/home/home.prompt.md` (Food tile visible; gated by `restaurantsEnabled` for
  the escape hatch). Bundle-size budget respected.
- [ ] **A2 · Home content.** `LiveOrderCard` (per running job, any service), "Send again"
  `ReorderRail` from order history, "Restaurants near you" `RestaurantCard` rail (skeleton/empty
  behind flag until Lane C serves data). Photo policy: lazy-load, 15–25KB thumbs, tinted-initial
  fallback, never block first paint.
- [ ] **A3 · Orders + Account tabs.** Orders = one cross-service list (absorbs
  `app/history/`); live order pinned on top; Account absorbs profile/settings/help/notifications
  entry points. Retire orphaned entry points.
- [ ] **A4 · Five-states + retirement sweep.** Every new customer surface ships default /
  loading / empty / error / offline per the gallery; remove the retired `home_launcher`
  intermediate and any dead nav; accent-split spot-check; jest coverage for boot-route + nav
  guards.

### Lane B — one rider app (`apps/mobile`, rider surfaces)

- [ ] **B1 · Rider tab shell.** Jobs | Money | Account; board root gets the green BrandHeader
  variant (`showSearch=false`); inner screens keep white bars. Rider boot route lands on Jobs.
- [ ] **B2 · One board.** Single job list, PARCEL / FOOD tagged cards, identical card anatomy;
  parcel broadcasts carry no countdown (taken job disappears); food offers pin to top with the
  60s timer (renders dark until Lane C dispatch exists); one notification line format; one
  inbox. One job at a time; no vertical opt-out.
- [ ] **B3 · Money tab.** Merge `app/wallet/*` + `app/earnings/*` into one Money tab: balance +
  commission (one `ratePct`), **cash-held split "yours" vs "owed to a kitchen"** (zero-state
  until food ships), one earnings ledger filterable Parcel / Food, top-up gate (`gate_topup`)
  replacing `gate_commission` copy. Retire the Earnings screen and the standalone wallet entry
  points (profile ghost button, board low-balance path re-targets Money). `--danger-ink` lands in
  `packages/shared/src/design-tokens.ts` + admin globals with its first consumer.
- [ ] **B4 · One active-job screen.** Shared Stepper with per-type step lists (parcel steps live;
  food steps land with Lane D5); exception screens (wrong code, unreachable, dropped) written
  once and reused; 6-digit delivery code closes both. Retire superseded screens named in
  `gallery-map.js` header; jest regression on rider boot + gates.

### Lane C — restaurants backend (`apps/api` + `packages/shared`)

Every C increment is sensitive-lane by definition: PR body must answer the four doctrine
questions (idempotency key, lifecycle edge vs the transitions table, money-seam arithmetic,
regression test). All routes/flag-gated; `merchant-routes-dead` golden matrix updated to assert
dead-when-off rather than dead-always.

- [x] **C1 · Merchant domain + auth + menu.** Expand `Merchant` (profile D-30, hours, cash rule
  R-03, masked phone D-17); merchant auth (phone + OTP, reusing the existing auth patterns,
  fail-closed); menu schema + CRUD (categories D-29, dishes with photo-required draft state
  D-31, OOS with daily auto-reset N-14, busy mode N-17); upload/compress pipeline reusing
  `uploads/` (≤300KB dish, ≤250KB banner D-32). Customer read API: restaurant list/menu (flag +
  allowlist gated). **Done 2026-07-29:** `Merchant` expanded + `MerchantCategory`/`MerchantDish`
  added (migrations 0040/0041, unique index built CONCURRENTLY per CONTRIBUTING); merchant auth
  is `POST /merchant/become` upgrading an existing customer profile in place (role="merchant"),
  reusing the untouched phone+OTP flow — mirrors `becomeRider` exactly, no parallel OTP surface.
  New `apps/api/src/merchant/` module (`MerchantController` self-service CRUD +
  `RestaurantsController` customer read API) registered unconditionally in AppModule; every route
  sits behind `RestaurantsEnabledGuard` (checked first, ahead of JwtAuthGuard/MerchantGuard) so the
  vertical fails safe OFF (503) with no DB/DI change needed to re-enable. `pilotEnabled` is the
  seeded-cohort allowlist field the 2026-07-27 status-keyed-query-audit's "P0 exit-gate status"
  deferred to "the first P1 PR" — this is that PR; the customer read API filters on it. Golden
  matrix (`merchant-routes-dead.e2e.spec.ts`) converted dead-always → dead-when-off: a structural
  guard-chain tripwire (any future `/merchant`|`/restaurants` controller must carry
  `RestaurantsEnabledGuard`) plus real HTTP legs proving 503 off, 401/403/200 on. Dish/banner
  uploads reuse `uploads/` with D-32's own size caps. `express-no-merchant-coupling` holds (no
  import edge added). C2 (order lifecycle) is next.
- [ ] **C2 · Food order lifecycle.** Extend the declarative transitions table for `merchant`
  orders: place → accept window 3:00 auto-cancel (N-03) → item-level accept w/ 60s customer
  approval (D-23/N-18) → **payment-confirm-before-cook** (R-11, call-logged R-16, no clocks
  R-17, end-of-day auto-close N-23) → prep (chips N-04, starts at payment confirm; +10 busy) →
  ready → pickup (4-digit code N-16) → delivery → doorstep. Rejection reasons write customer
  copy (D-11). Pricing: fee $0.80/km rounded $0.50 min $1.50 (N-01), min order $4.00 / $1.00
  small-order fee (N-15) — **as config, not constants**. Apply `orderType` filters to all 11
  audited class-(a) sites (each named in the PR).
- [ ] **C3 · Food dispatch.** Auto-offer to one rider, 60s expiry (N-08), widening radius,
  NO_RIDER cap 6:00 (N-07) with merchant hold/decision (D-34) and no-fault cancel (D-13);
  "rider secured" first-class event for all three actors (D-04); soft-lock vs parcel bids
  (a rider with a running food offer countdown can't accept elsewhere — scripted race test);
  drop-before-pickup with re-dispatch + paused prep clock, no drop after pickup (D-33).
  `DispatchStrategy` seam per §0b; Express offer-loop untouched.
- [ ] **C4 · Food money evidence layer.** Merchant-debt ledger (append-only, idempotent,
  derived): release-unpaid records debt (R-01) → doorstep dual-confirm handshake (R-04,
  2:00 freeze + auto-support R-05/N-19) → code unlock (masked-code rule R-09 server-side) →
  return leg as a real job (N-20) → returned-cash count-confirm (N-21, D-06 grammar) → rider
  offer-block while owing. Wallet-payment evidence (reference + amount, merchant statement
  confirm, PAID visibility R-12); refunds with reference (D-12, 2h SLA escalation N-12);
  customer cash-ban flag on refusal (R-08); rider suspension on non-return (R-07); no-show
  window N-10. **No path strands the debt ledger** — every terminal state nets to zero or books
  one explicit loss entry (incl. the D-34 LyniaGo-covers-cooked-food case).
- [ ] **C5 · Realtime + notifications + statements.** Kitchen socket queue reusing
  TrackingModule (server-paused accept clocks while dark, reconnect backfill with count);
  customer push contract (accepted-pay-now persistent, rider-secured, at-door; soft reminder
  N-22); rider offer alarm channel vs parcel ping; weekly merchant statement + commission
  accrual display (0% + illustrative 10% comparator N-13) + end-of-day close job (N-23);
  utilization metric extended per-vertical.

### Lane D — food UI (`apps/mobile`, customer + rider food flows)

Phase-0 gate: requires A1 (customer shell) for D1–D4, B1/B4 (rider shell + active-job) for D5,
and the matching Lane C contracts (C1 for D1, C2 for D2–D3, C4 for D4–D5) merged.

- [ ] **D1 · Browse.** Restaurant list (photo-led, hero + thumbs, tinted-initial fallback),
  search, menu (category tabs mirroring D-29), item sheet, closed/closes-while-browsing states,
  cart with per-item + order notes (D-35, price never changes), sold-out / price-changed /
  empty states.
- [ ] **D2 · Checkout + kitchen-confirms.** CASH / WALLET checkout (ETA promise anchored on
  payment confirm D-21/R-17), placing → waiting-for-accept → "they call to confirm" band →
  pay-the-restaurant (manual rail D-24: copyable number/amount/reference, "I paid another way")
  → paid-waiting (D-25) → confirmed; still-unpaid reminder + free cancel; offline checkout
  state.
- [ ] **D3 · Track.** Prep countdown ring over the re-labelled 7-step Express tracker (D-03),
  rider-secured moment (D-04), plate number promoted (D-27), live-paused, NO_RIDER apology
  (D-13), cancel sheet, refund-pending/refunded, safety surface reused verbatim (D-28).
- [ ] **D4 · Doorstep.** Dual-confirm handshake ("I gave $X" → "I received $X" → code reveals,
  R-04), masked code during CASH transit with offline press-and-hold reveal (R-09), rider-didn't-
  confirm support state, delivered + rate, no-show failure timeline (N-10), resumed-mid-order
  restart tolerance (§3 of the decisions doc).
- [ ] **D5 · Rider food jobs.** Offer variants (collect-and-return default / upfront-kitchen
  self-declare R-10 / PAID R-12), accept → navigate → pickup code (N-16) → collect → navigate →
  doorstep handshake → collect cash → return-the-cash leg → hand-back confirm; drop rules
  (D-33), unreachable-customer wait + call log, wrong code, resumed-mid-delivery; cash-held
  split live on the Money tab.

### Lane E — merchant kitchen tablet (`apps/merchant`)

Phase-0 gate: requires the matching Lane C contracts (C1 for E1/E4, C2/C5 for E2, C4 for E3).

- [ ] **E1 · Auth + shell + alarm discipline.** Phone+OTP sign-in ("Sign in & start the alarm",
  D-05) with fail-closed middleware; app shell tablet-first 1024×680 degrading to phone; looping
  2-tone alarm unlocked by the login gesture, `AudioContext` re-resumed on every gesture; Screen
  Wake Lock with flashing-header fallback; visible alarm state; red CONNECTION LOST bar ≤3s,
  actions disabled, backoff counter, reconnect backfill banner; rebooted-mid-shift recovery
  (§3 of the decisions doc, implemented as written).
- [ ] **E2 · Queue + cook flow.** Queue empty/loading → NEW ORDER takeover (stops only on
  Accept / Can't-take-it) → accept + prep chips → item-level "don't have it" (D-23) → reject
  reasons (D-11) → amber "do not cook yet" full-viewport (D-04) → rider-secured green cook
  signal → mark ready → pickup confirm (4-digit code) → handed over; two-orders-at-once; board
  at 3 orders (D-26); NO_RIDER hold with keep-cooking/stop/cancel (D-34); rider no-show;
  awaiting-payment lane that never blocks the board (M2·7).
- [ ] **E3 · Money surfaces.** Call-then-request-payment (button unlocked by logged call, R-16,
  regulars override) → confirm-against-own-statement (type reference + amount, mismatch blocks
  and names the gap, D-06) → release-unpaid for collect-and-return (plain-words risk statement
  R-07) → returned-cash count (N-21, return trail visible) → pickup confirms CASH/WALLET →
  short-payment block → refund-after-payment with reference (D-12) → end of day → weekly
  statement (N-13 accrual comparator, cooked-food loss line D-34).
- [ ] **E4 · Menu + shop management.** Categories (create/rename/reorder/time-limit/hide/
  delete-when-empty, first-run four starters, D-29); dish editor with photo-required drafts
  (D-31) + crop/compress with offline queue (D-32); OOS sheet (rest-of-today default, N-14);
  hours; busy mode (N-17); shop profile with live customer-view miniature, cover/logo/tags/
  price level (D-30) and the cash-rule setting (R-03, plain-words trade-off).

### Cross-cutting (owned by whichever lane hits it first; named here so nobody assumes it away)

- [ ] **X1 · Admin alignment.** Admin console: merchant list/detail, food-order visibility in
  `/orders` (type filter), debt-ledger + handshake dispute views for support, cash-ban/suspension
  actions with audit trail. (The stale weekly-15% admin `cash.html` in the design kit is already
  superseded by the shipped prepaid `/cash` page — no work, verified.)
- [ ] **X2 · Launch-flip rehearsal.** Staging run: flags ON end-to-end golden pass (cash and
  wallet food order complete with correct ledger entries; NO_RIDER inside cap; race test
  parcel-bid vs food-offer), then flags OFF regression (Express golden matrix still green,
  merchant routes dead). Documented as a repeatable checklist in
  `docs/LAUNCH-EXECUTION-RUNBOOK.md`.

## 6. Build loops — the execution engine

Five scheduled loops (CCR triggers, fresh session per firing, this repo's environment), one per
lane, offset from the eight standing routines (23/01/02/03/05/07/08/09/14/20 UTC are taken):

| Loop | Trigger name | Cron (UTC) | Lane |
|---|---|---|---|
| Build L-C | `Build loop C — restaurants backend` | `0 10 * * *` | Lane C first (contracts lead) |
| Build L-A | `Build loop A — customer home + IA` | `0 12 * * *` | Lane A |
| Build L-B | `Build loop B — one rider app` | `0 16 * * *` | Lane B |
| Build L-D | `Build loop D — food UI` | `0 18 * * *` | Lane D (gates on A/B/C) |
| Build L-E | `Build loop E — merchant tablet` | `0 21 * * *` | Lane E (gates on C) |

Protocol (full prompts mirrored in `docs/routines/build-loops-restaurants-send.md`):

1. **Phase 0 — orient.** Fresh clone, read this plan on `main`. If this plan is missing on
   `main`, find the open PR titled "Restaurants + Send joint launch" — merge it if green, else
   exit quietly. Read open `claude/*` PRs: if an unmerged PR from **your own lane** exists,
   babysit it to merge (fix CI, resolve comments) **instead of starting new work** — one
   in-flight PR per lane, ever. Check your lane's Phase-0 dependency gate; if unmet, exit
   quietly (the earlier lane's loop owns the gap).
2. **One increment per firing.** Take the first unchecked box in your lane, implement it to the
   design contract (the gallery is screen truth; `RESTAURANTS-DECISIONS.md` is product truth;
   five states per screen; accent split; icons only from the regenerated subset). Small
   adjacent items may batch into one PR when they share files.
3. **Ship.** `pnpm typecheck && pnpm lint && pnpm test` green locally → branch
   `claude/build-<lane><n>-<date>` → PR (body: what/why, design references, the sensitive-lane
   four answers when money/trust paths are touched, open product questions surfaced as
   checklists per §9 — never silently decided) → tick your checkbox in §5 **in the same PR** →
   auto-merge on green per repo policy. Never merge on red; fix forward.
4. **Terminate.** When your lane's boxes are all ticked: run your lane's slice of X2, write a
   completion note in this plan (same PR), and **disable your own trigger** via
   `update_trigger {enabled: false}`. If blocked ≥2 consecutive firings on the same item,
   record the blocker in §10 and keep exiting quietly rather than thrashing.

The PR-health watchdog (`0 2,8,14,20`) babysits build-loop PRs like any other; the nightly bug
routines inherit merged build work through their normal Phase-0 ledger reads.

## 7. Launch gate (all must hold before the flip)

- [ ] Lanes A–E complete; X1, X2 done (staging golden pass both flag positions).
- [ ] Play approval for the joint binary (submission owner: founder; the binary ships with
  flags remote-read so a post-approval flip needs no resubmission).
- [ ] ≥5 named, committed CBD pilot merchants onboarded with seeded menus + photos (founder
  street-work, August); each with the tablet signed in and the alarm test passed.
- [ ] Rider fleet per §0a milestones (100 launch-weekend → 500 by end of August), utilization
  metric live per-vertical.
- [ ] `docs/QA-DEVICE-CHECKLIST.md` pass on real devices, extended with: doorstep handshake
  (incl. offline press-and-hold reveal), merchant alarm/wake-lock/reboot, return-cash leg,
  kitchen reconnect backfill.
- [ ] Money invariants on real devices: deliberate no-show → clean loss entry + customer flag;
  short-payment blocked; debt ledger nets zero on a full cash order.
- [ ] Support runbook updated (R-05 auto-call path staffed; refund SLA escalation owner).

## 8. Tripwires (restating §0a for the joint launch)

- **Play approval slips past mid-August** → launch date moves with it (both products wait; the
  binary is one).
- **<5 committed merchants by Sept 15** → founder decision: hold the launch for supply, or
  launch with `RESTAURANTS_ENABLED=false` (escape hatch, §1) and flip when supply lands.
- **Rider activation materially behind** (<1 order/active-rider/day fleet average once live) →
  revisit recruitment pacing before adding demand-side spend; the joint launch itself is the
  utilization play.
- **Cut order if schedule pressure forces it** (unchanged in spirit): batching (already out) →
  wallet-payment polish (manual rail D-24 is the floor — cash + manual reference always work) →
  admin conveniences (X1 dispute views can trail launch by days with SQL as backstop) → date.
  **Never cut the money spine or the handshake.**

## 9. Open product questions — surface, don't decide

Carried in every relevant PR body as a checklist (per the handoff instruction). Mocked defaults
ship unless the founder overrides; each PR that implements a mocked default names it.

| # | Question | Mocked default shipping | Affects |
|---|---|---|---|
| Q1 | Delivery fee per order or per km band? | Per-km, $0.50 rounding, min $1.50 (N-01), **as config** | C2 |
| Q2 | Multi-drop: two collect-mode debts at once? | One open debt hard limit (N-20) | C3/C4 |
| Q3 | Merchant sees rider return history before release? | Visible ("212 returns, 0 missed") | C4/E3 |
| Q4 | Returned-cash count interrupts the queue or waits? | Waits quietly; rider stays blocked | E2/E3 |
| Q5 | 2:00 handshake window right for gate/complex drops? | 2:00 (N-19), config | C4/D4 |
| Q6 | Refund past 2h SLA — who chases, any merchant penalty? | Escalate to support, no penalty (N-12) | C4/X1 |
| Q7 | Bidding while a food offer counts down — allowed? | Blocked (soft-lock, C3) | C3/B2 |
| Q8 | Rider Q: batching parcels+food? | No — one job at a time (decision 3, rider plan) | C3 |

`RIDER-ONE-APP-PLAN.md` decisions 1–7 are **taken** (founder, Jul 2026) and are not reopened.

## 10. Open blockers (loops write here)

*(empty — loops append `- [date] [lane] blocker — owner` entries)*
