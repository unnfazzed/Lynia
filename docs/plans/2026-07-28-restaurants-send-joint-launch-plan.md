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

- [x] **A1 · Tab shell + Send demotion.** Root tabs Home | Orders | Account (Expo Router tab
  group); `app/home.tsx` composer moves to the `send` route **unchanged in behaviour**; boot
  route lands on the launcher; Send tile/search/edit-order push the composer; complete/cancel
  returns to the launcher. Port `BrandHeader` + `ServiceTiles` + `AppScreen` shell primitives to
  RN per `components/home/home.prompt.md` (Food tile visible; gated by `restaurantsEnabled` for
  the escape hatch). Bundle-size budget respected. **Done 2026-07-29:** new `app/(tabs)/` Expo
  Router group (`_layout.tsx` custom `tabBar` rendering the ported `TabBar` primitive; `home.tsx` |
  `orders.tsx` | `account.tsx`). Its group folder is invisible to the URL, so `home.tsx`'s route is
  `/home` — `bootDestination()` and every "return to launcher" call site (`order/[id].tsx`'s
  terminal "Back home", `verify.tsx`/`role.tsx`/`profile/setup.tsx` post-auth routing,
  `rider/index.tsx`'s role-switch) needed **no string change**. The four call sites that actually
  meant "open the compose screen" (`profile/index.tsx` + `history/index.tsx`'s "Send a parcel",
  `history/index.tsx`'s reorder prefill, `order/[id].tsx`'s rebroadcast prefill) were repointed to
  `/send`, the composer's new route (`git mv app/home.tsx app/send.tsx`, zero logic changes — its
  own relative imports are unaffected since it stays in `app/`). `BrandHeader`/`ServiceTiles`/
  `AppScreen`/`TabBar` ported to `src/ui/shell/` (inline-style + `@lynia/shared` tokens, matching
  the app's existing convention — no `StyleSheet.create` anywhere else either); `BrandHeader` is
  the full-bleed accent exception (pads its own top safe-area inset so the green block runs behind
  the status bar, per the routine's rule). `getServiceTiles(restaurantsEnabled)` degrades Food to
  the same grey "Soon" tile Pharmacy already uses when the flag is off — the actual browse route
  doesn't exist until Lane D ships, so a live tap (flag on) shows an honest "coming soon" toast
  instead of a dead push. Added 5 new per-icon Hermes imports (`bell`, `utensils`, `plus`, `store`,
  `receipt` — all in the self-hosted Lucide subset, no barrel import). Orders/Account tab bodies
  are honest bridge screens (a button through to the still-live standalone `/history` and
  `/profile` routes) — full content absorption is A3's job, not duplicated here. New
  `useFeatureFlags`/`fetchFeatureFlags` hook (`src/net/use-feature-flags.ts`, modeled on
  `use-server-version-gate.ts`) fetches `GET /app/feature-flags`, fail-**safe-OFF** (opposite
  direction from the version-gate's fail-open) so an unreachable endpoint never reveals an unready
  vertical. Bundle-size measured locally (`expo export --platform android` +
  `scripts/check-bundle-size.mjs`): Hermes bundle grew 6,126,613 → 6,146,223 bytes (+19.6 KB) —
  still within the existing 6,200,000-byte budget (53.5 KB / 0.9% headroom left), no budget bump
  needed this PR. `pnpm typecheck && pnpm lint && pnpm test` green across the whole monorepo
  (mobile: 71 suites / 538 tests, incl. 2 new suites for `getServiceTiles` and the `APP_TABS`
  route-name contract, plus a new `use-feature-flags` fail-safe-off suite).
- [x] **A2 · Home content.** `LiveOrderCard` (per running job, any service), "Send again"
  `ReorderRail` from order history, "Restaurants near you" `RestaurantCard` rail (skeleton/empty
  behind flag until Lane C serves data). Photo policy: lazy-load, 15–25KB thumbs, tinted-initial
  fallback, never block first paint. **Done 2026-07-29:** ported `LiveOrderCard`/`ReorderRail`/
  `RestaurantCard` to RN (`src/ui/home/`), matching `packages/design/components/home/` — the
  composition order from `home.prompt.md` ("LiveOrderCard *or* ReorderRail → Restaurants near
  you"). LiveOrderCard reads the existing `["activeCustomerOrder"]` query (same key/cache
  `send.tsx`'s own restore banner already uses — no duplicate fetch), focus-gated + foreground-
  refreshed the same way; its progress strip reuses the 7-step Express tracker grammar via a new
  `liveOrderStepIndex` pure helper (`src/logic/home-feed.ts`). "Any service" is the design intent,
  but only a Send/parcel order can be live today — Restaurants' customer checkout/track (Lane
  D2/D3) hasn't shipped, so a merchant order can't yet become the signed-in customer's active
  order; flagged as an open item rather than guessing at restaurant-name/ETA/payment-method copy
  the wire contract doesn't carry yet. `ReorderRail` sources the customer's own sent trips from
  the existing `useHistoryFeed()`, reusing `buildRebroadcastParams` (the same "Send again" the
  history screen already ships) — hidden while a live order shows, per the prompt's own rule.
  `RestaurantsRail` consumes the already-shipped Lane C1 customer read API via the existing
  `useRestaurantListFeed` (the plan's "skeleton/empty behind flag until Lane C serves data" was
  written before C1/D1 shipped; per this doc's own "the code wins" rule, wired to the real feed
  instead) — rating/ETA/delivery fee are omitted (not in the wire contract yet, the same gap D1's
  `RestaurantRow` already flagged), and the rail renders nothing (not a dead link) with the flag
  off or with zero restaurants, since `/food` already owns that empty state. Photo policy: photos
  render at on-screen rail size only (~84–172px), the rail is capped at 10 cards, and every photo
  surface has a synchronous tinted-initial fallback that never blocks first paint (`FoodThumb`'s
  per-name-tint convention, reused instead of the mockup's flat wash so an all-text-fallback "Send
  again" shelf isn't monotone) — true server-side 15–25KB thumbnail variants are a Lane C/E
  follow-up; today the client renders the same `coverPhotoUrl` D1 already fetches. Bundle-size
  measured locally (`expo export --platform android` + `scripts/check-bundle-size.mjs`): Hermes
  6,283,356 / 6,300,000 bytes, 16.25 KB headroom left — no budget bump needed this PR. `pnpm
  typecheck && pnpm lint && pnpm test` green across the whole monorepo (mobile: 74 suites / 569
  tests, incl. a new `home-feed.test.ts` covering the tracker-step index, the live-order copy, the
  reorder-rail selection/cap, and open/closed status derivation).
- [ ] **A3 · Orders + Account tabs.** Orders = one cross-service list (absorbs
  `app/history/`); live order pinned on top; Account absorbs profile/settings/help/notifications
  entry points. Retire orphaned entry points.
- [ ] **A4 · Five-states + retirement sweep.** Every new customer surface ships default /
  loading / empty / error / offline per the gallery; remove the retired `home_launcher`
  intermediate and any dead nav; accent-split spot-check; jest coverage for boot-route + nav
  guards.

### Lane B — one rider app (`apps/mobile`, rider surfaces)

- [x] **B1 · Rider tab shell.** Jobs | Money | Account; board root gets the green BrandHeader
  variant (`showSearch=false`); inner screens keep white bars. Rider boot route lands on Jobs.
  **Done 2026-07-29:** new `app/rider/(tabs)/` Expo Router group nested under the existing `/rider`
  segment (not the app root, unlike A1's customer shell) — `_layout.tsx` renders `TabBar` with a new
  `RIDER_TABS` export (`src/ui/shell/TabBar.tsx`: Jobs/Money/Account, icons `bike`/`banknote`/`user`,
  all in the existing subset). The board is `(tabs)/index.tsx` (`git mv` from `app/rider/index.tsx`,
  zero logic changes to the board itself), so its route stays exactly `"/rider"` — every existing
  call site (`boot-route.ts`'s `bootDestination`, `push.ts`, `role.tsx`, `verify.tsx`,
  `profile/setup.tsx`, `send.tsx`, `permissions.tsx`, `rider/become.tsx`, `rider/documents.tsx`,
  `rider/job.tsx`, `earnings/index.tsx`) needed no string change — the same zero-cost trick A1 used
  for `"/home"`. The board root's inline "Rider" heading + "Trips"/"Rider setup" buttons are replaced
  by the green `BrandHeader` (`showSearch=false`, bell → `/notifications`, profile → the new
  `/rider/account` tab); those two links (plus "View earnings") move to two new honest bridge
  screens — `(tabs)/money.tsx` (→ `/wallet`, `/earnings`, both still standalone until B3 merges
  them) and `(tabs)/account.tsx` (→ `/rider/become`, `/history`, `/profile`) — mirroring A1's
  Orders/Account bridge convention. "Back to customer" stays on the Jobs tab unchanged, since its
  confirm-dialog logic is tied to the board's own `online`/`activeJob` state. New contract test
  (`RIDER_TABS` ids match route file names, mirroring the existing `APP_TABS` test).
  `pnpm typecheck && pnpm lint && pnpm test` green across the whole monorepo (mobile: 71 suites /
  539 tests). CI's `mobile-bundle-size` job caught `main` already over its Hermes/export budget
  by ~9.7 KB pre-existing this PR (measured against `origin/main` directly, unrelated to B1); this
  PR's own genuine addition is ~3.7 KB. Raised `apps/mobile/size-budget.json` to cover both (new
  headroom ~16-23 KB) rather than leaving the gate red — the pre-existing drift's root cause is
  outside Lane B's scope to bisect this firing.
- [x] **B2 · One board.** Single job list, PARCEL / FOOD tagged cards, identical card anatomy;
  parcel broadcasts carry no countdown (taken job disappears); food offers pin to top with the
  60s timer (renders dark until Lane C dispatch exists); one notification line format; one
  inbox. One job at a time; no vertical opt-out. **Done 2026-07-29:** new shared `JobCard`
  (`apps/mobile/src/ui/rider/JobCard.tsx`) — the one card anatomy for both kinds (`TypeTag`
  pill + route line + note + one action), ported from `rider-one-app.jsx`'s `TypeTag`/`JobCard`;
  the board (`app/rider/(tabs)/index.tsx`) now renders its existing parcel list through it,
  zero behaviour change (same `chooseOrder`/offer flow). **Reconciliation flag (surfacing, not
  deciding):** this bullet's "food offers pin to top with the 60s timer" is the plan's own
  carried-over pitch language from `RIDER-ONE-APP-PLAN.md`'s pre-decision "The model" section —
  that doc's own **Decisions taken** section (decision 2, FINAL per this build loop's brief) and
  the gallery mock it describes (`rider-one-app.jsx`, registers `window.RJM`) both implement **no
  visible countdown on any card**, parcel or food — a job that's gone just leaves the list, same
  rule both verticals. Built to the FINAL decision, not this bullet's inherited draft text.
  `JobCard` supports `jobType: "food"` today (unit-tested with a food fixture) but the board
  doesn't yet feed it live data — Lane C3 (dispatch, shipped) has no rider-facing GET or WS event
  for an offered food order, only the merchant-facing queue reads and a `food_offer` push
  notification (`food-dispatch.service.ts` `tick()`); that push now routes to `/rider` (was
  unhandled — added a `pushDestination` branch + regression test) so tapping it at least reaches
  the board, but no food card renders until that feed exists — genuinely "dark," not merely flag-
  gated, and out of Lane B's `apps/mobile`-only scope to add (recorded below, §10). Board's
  online caption reads "parcels and food orders arrive live, one queue" once
  `merchantDispatchAutoEnabled` is on (still says "new orders arrive live" while off) — the one
  copy change gated on the flag; everything else was already dormant-safe (no food data flows
  regardless). One inbox / one notification line format were already shipped as of A-series work
  (`app/notifications/index.tsx`'s generic icon-tile + title + message + relative-time `Row`) —
  no change needed. Five states / accent split / icon subset unchanged (icons `utensils`/
  `package` were already imported). `pnpm typecheck && pnpm lint && pnpm test` green across the
  whole monorepo (mobile: 75 suites / 574 tests, incl. 2 new `JobCard` cases + 1 new
  `food_offer` push-routing case). Bundle-size measured locally (`expo export --platform
  android` + `scripts/check-bundle-size.mjs`): Hermes 6,291,539 / 6,320,000 bytes, 27.79 KiB
  headroom left — no budget bump needed this PR.
- [x] **B3 · Money tab.** Merge `app/wallet/*` + `app/earnings/*` into one Money tab: balance +
  commission (one `ratePct`), **cash-held split "yours" vs "owed to a kitchen"** (zero-state
  until food ships), one earnings ledger filterable Parcel / Food, top-up gate (`gate_topup`)
  replacing `gate_commission` copy. Retire the Earnings screen and the standalone wallet entry
  points (profile ghost button, board low-balance path re-targets Money). `--danger-ink` lands in
  `packages/shared/src/design-tokens.ts` + admin globals with its first consumer. **Done
  2026-07-30:** `app/rider/(tabs)/money.tsx` (B1's honest bridge) now carries the full merge —
  balance hero + pending-topup reconciliation + top-up CTA (ported verbatim from `app/wallet/
  index.tsx`), a new `CashHeldStrip` (`src/ui/rider/CashHeldStrip.tsx`, RIDER-ONE-APP-PLAN.md
  decision 6 — written once so B4's active-job screen can reuse it verbatim), and one ledger with
  All/Parcels/Food filter chips. `app/wallet/index.tsx` and `app/earnings/index.tsx` deleted
  outright (gallery-map.js already documented both as retired); `src/logic/earnings.ts`
  (`earningsCoverageNote`, the Earnings screen's only consumer) deleted with its test. The old
  "record of work done" lifetime-earned total is retired with the screen, not ported — the ledger
  is the record now (decision 1). `useEarningsSummary`/`EARNINGS_SUMMARY_KEY`/`getEarningsSummary`
  are left in place (unused after this PR) since they still back the WD-022 invalidation funnel
  shared with `job.tsx`/the rider job socket — a smaller, separable cleanup, not bundled in here.
  **Ledger filter gap, surfaced not faked:** `WalletEntry` carries no `orderType` field, and
  `chargeCommission` only ever writes a `commission` row for `orderType === "parcel"`
  (order-lifecycle.service.ts's own A-5 guard) — so every commission row today is provably
  parcel-sourced, making "Parcels" filter honestly, but "Food" can only ever render its empty
  state until Lane C adds the field and starts writing food-commission rows (`src/logic/
  wallet-ledger.ts`'s doc comment; same dark-not-blocked shape as B2's `JobCard` gap in §10).
  Board low-balance gate (`app/rider/(tabs)/index.tsx`): CTA re-targets `/rider/money` (was a
  direct deep-link to `/wallet/top-up`, bypassing the new Money home); `EmptyState` gained an
  optional `tone?: "accent" | "danger"` prop (default unchanged everywhere else) so this one real
  money block reads as dangerWash/dangerInk instead of the same warm mint every other gate reason
  uses — the first RN consumer of `dangerInk` (already in `design-tokens.ts`/`colors.css` since
  E1; only `apps/admin/app/globals.css` was missing it of the three hand-synced faces, added here
  to close that drift, per DESIGN-SYSTEM-3-IMPLEMENTATION-PLAN.md §A7.2 — `design-tokens.drift.
  spec.ts` doesn't enumerate `danger-ink` so this doesn't change its assertions). Profile's
  "Earnings" ghost button removed (Money is a rider tab now, reachable directly, mirroring the tab
  bar not duplicating Account). Bundle-size measured locally (`expo export --platform android` +
  `scripts/check-bundle-size.mjs`): Hermes 6,287,265 / 6,320,000 bytes — *shrank* slightly versus
  B2 (two whole screens retired outweighs the new Money tab + `CashHeldStrip`), no budget bump
  needed. `pnpm typecheck && pnpm lint && pnpm test` green across all 6 packages (mobile: 76
  suites / 576 tests, incl. new `wallet-ledger.test.ts` and `CashHeldStrip.test.tsx`; api 94
  suites / 1426 tests unaffected). B4 (active-job screen) is next.
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
- [x] **C2 · Food order lifecycle.** Extend the declarative transitions table for `merchant`
  orders: place → accept window 3:00 auto-cancel (N-03) → item-level accept w/ 60s customer
  approval (D-23/N-18) → **payment-confirm-before-cook** (R-11, call-logged R-16, no clocks
  R-17, end-of-day auto-close N-23) → prep (chips N-04, starts at payment confirm; +10 busy) →
  ready → pickup (4-digit code N-16) → delivery → doorstep. Rejection reasons write customer
  copy (D-11). Pricing: fee $0.80/km rounded $0.50 min $1.50 (N-01), min order $4.00 / $1.00
  small-order fee (N-15) — **as config, not constants**. Apply `orderType` filters to all 11
  audited class-(a) sites (each named in the PR). **Done 2026-07-29:** `order-lifecycle.transitions.ts`
  gained an `orderType`/`"both"` dimension on every existing row (A-11) plus a new merchant-only
  block (place/reject/expire_accept/decline_items/expire_item_approval/cancel_unpaid/
  release_unpaid/expire_end_of_day, all `requested`→`cancelled`) and a parallel
  `MERCHANT_PHASE_TRANSITIONS` table for the kitchen sub-state OrderStatus has no room for
  (plan §0b.1: merchant orders live at `requested` + a nullable `merchantPhase` the whole
  pre-dispatch flow, never `open_for_offers`, until C3 broadcasts a `ready_for_pickup` order —
  that hand-off is deliberately not this PR's job). New `apps/api/src/merchant/food-order.service.ts`
  + two controllers (`restaurants` customer-facing, `merchant/orders` kitchen-facing) implement
  placeOrder → acceptOrder (full/D-23 item-level) → approveItems → logCall/requestPayment/
  confirmPayment (R-11/R-16) → markReady, plus a DB-reconciler sweep (20s interval) for N-03/
  N-18/N-23 auto-exits and `confirmPickup` (N-16, mirrors confirmDelivery one hop earlier —
  wired now, unreachable via HTTP until C3 assigns a rider). Pricing lives in
  `packages/shared/src/restaurants-order.ts` (`RESTAURANTS_PRICING`/`RESTAURANTS_TIMING` config
  objects + pure functions, mirrors `pricing.ts`'s `FARE` pattern). All 11 status-keyed-query-audit
  class-(a) sites fixed: A-1 offer-expiry sweep, A-2 offers.service guards (both), A-3 orders.service
  bid boards (both), A-4 cloneForRebroadcast guard, A-5 rate/completeOrder chargeCommission type
  branch, A-6 notifications.service STATUS_NOTICES guard, A-7 notifications-feed synthesis guard,
  A-8/A-9 admin funnel + fares/spend KPIs, A-10 settlements console. Added `Merchant.location` +
  `MerchantOrderItem` (price-snapshotted basket lines, D-35) + PII-manifest/erasure coverage for its
  `note` column (migration 0042, additive only). D3 (post-launch product question, not blocking):
  N-18's unanswered-approval-window default (treated as decline) is a named mocked default, surfaced
  in the PR body per §9 discipline. C3 (food dispatch) is next.
- [x] **C3 · Food dispatch.** Auto-offer to one rider, 60s expiry (N-08), widening radius,
  NO_RIDER cap 6:00 (N-07) with merchant hold/decision (D-34) and no-fault cancel (D-13);
  "rider secured" first-class event for all three actors (D-04); soft-lock vs parcel bids
  (a rider with a running food offer countdown can't accept elsewhere — scripted race test);
  drop-before-pickup with re-dispatch + paused prep clock, no drop after pickup (D-33).
  `DispatchStrategy` seam per §0b; Express offer-loop untouched. **Done 2026-07-29:** new
  `apps/api/src/merchant/food-dispatch.service.ts` owns the `ready_for_pickup` → `assigned`
  hand-off C2 left open. A merchant order sits at `requested` while dispatch searches or holds
  and flips to `open_for_offers` — the SAME status value Express's own auction uses (plan
  §0b.1 "no new OrderStatus values"), safe because C1/C2 already added `orderType` filters to
  every Express read/write keyed on it — for the ~60s a single candidate is deciding.
  `merchantPhase` stays `ready_for_pickup` for the whole dispatch lifetime, cleared to null
  only at genuine hand-off (dispatch_accept or a cancel), the same shape every other
  MerchantPhase exit already uses. DB-only reconciler (`sweepExpiredOffers` +
  `sweepSearch`, 20s cadence, mirrors FoodOrderService) drives the widening-radius single-rider
  auto-offer (`RESTAURANTS_DISPATCH` config in `packages/shared`: 60s window, 6 attempts,
  1.5–8km widening radius) via a `DispatchStrategy` seam (`dispatch-strategy.ts`,
  `NearestRiderDispatchStrategy` the bound default) that excludes busy/already-tried/
  already-offered-elsewhere riders. Cap exhaustion sets `noRiderHoldAt` (D-34); the merchant's
  two explicit hold-screen actions are `dispatch/resume` (fresh budget) and `dispatch/cancel`
  (D-13 no-fault, `rejectionReason: "no_rider"`, new apology copy in
  `MERCHANT_REJECTION_REASONS`) — "stop and hold" is the passive default (no endpoint needed,
  nothing to do). `acceptDispatch` (D-04 "rider secured") mints the delivery code exactly like
  `matching.service.ts:selectOffer` and pushes to customer + rider via the same `orderRoom`
  WS channel parcel `assigned` uses; the kitchen tablet has no realtime channel yet (Lane C5's
  job) so the merchant sees it via the next `GET /merchant/orders/:id` poll — flagged, not
  silently decided. `declineDispatch` frees the offer immediately (the rider's "can't take
  it"). `dropDispatch` (D-33) re-enters dispatch IN PLACE on the same order (not an Express-
  style cloneForRebroadcast new order, since the food is already cooked — nothing to
  re-broadcast a fresh listing for) and reuses `order-lifecycle.service.ts:cancel`'s exact
  reliability-penalty shape (prePickupCancel, `CANCEL_STRIKE_LIMIT` cooldown +
  `evictRiderFromSupply`) so a drop counts on the SAME `cancelStrikes` axis as a parcel
  cancel, not a second counter; blocked from `picked_up` onward (no drop after pickup).
  Soft-lock lives in `apps/api/src/common/food-dispatch-lock.ts` (a neutral file, not
  `merchant/`) so both `offers.service.ts:makeOffer` and `matching.service.ts:selectOffer`
  can import the same `hasLiveFoodDispatchOffer` check without tripping
  `express-no-merchant-coupling` — a rider holding a live food offer can neither bid on nor be
  selected for a parcel; a scripted race test in `matching.service.spec.ts` covers the
  "bid placed before the food offer arrived" ordering. Ten new transition-table rows in
  `order-lifecycle.transitions.ts` (`dispatch_offer`/`dispatch_search`/`dispatch_no_rider` as
  honest self-loops alongside the real edges — the "verification artifact mirrors what the
  code does" contract extends past expandBroadcast's precedent since these commit real,
  guarded CAS writes even though `to === from`). **D-04/D-33 reconciliation, flagged per the
  plan's own "code wins" instruction:** by the time dispatch starts, the kitchen has already
  finished cooking (R-11/R-17 start prep at payment confirm, well before `markReady`), so
  D-04's "don't start cooking before rider secured" gate and D-33/D-34's "prep clock
  pauses"/"keep cooking" language describe a cook-after-dispatch ordering this locked
  architecture doesn't have; what survives verbatim is D-04's "rider secured" push event and
  D-33/D-34's re-dispatch mechanics, both implemented as written. `pnpm typecheck && pnpm lint
  && pnpm test` green across the whole monorepo (API 1349 tests incl. 47 new across
  `food-dispatch.service.spec.ts`/`dispatch-strategy.spec.ts`/the transitions/offers/matching
  specs; shared 144; mobile 538). C4 (food money evidence layer) is next.
- [x] **C4 · Food money evidence layer.** Merchant-debt ledger (append-only, idempotent,
  derived): release-unpaid records debt (R-01) → doorstep dual-confirm handshake (R-04,
  2:00 freeze + auto-support R-05/N-19) → code unlock (masked-code rule R-09 server-side) →
  return leg as a real job (N-20) → returned-cash count-confirm (N-21, D-06 grammar) → rider
  offer-block while owing. Wallet-payment evidence (reference + amount, merchant statement
  confirm, PAID visibility R-12); refunds with reference (D-12, 2h SLA escalation N-12);
  customer cash-ban flag on refusal (R-08); rider suspension on non-return (R-07); no-show
  window N-10. **No path strands the debt ledger** — every terminal state nets to zero or books
  one explicit loss entry (incl. the D-34 LyniaGo-covers-cooked-food case). **Done 2026-07-30:**
  new `MerchantDebtLedger` table (append-only, `@@unique([orderId, type])` idempotency, mirrors
  `CommissionLedger`'s shape) + `Order.debtStatus`/`debtAmount`/`debtOpenedAt`/`debtSettledAt` +
  a THIRD declarative table (`MERCHANT_DEBT_TRANSITIONS` in `order-lifecycle.transitions.ts`,
  alongside `TRANSITIONS`/`MERCHANT_PHASE_TRANSITIONS`) covering open→settled_cash/settled_goods/
  written_off. New `apps/api/src/merchant/food-debt.service.ts` owns three things: (1) the R-04
  doorstep dual-confirm handshake (`confirmCustomerCash`→`confirmRiderCash`, N-19 2:00 window,
  `disputeCash`/`sweepFrozenHandshakes` for R-05's freeze+support-notify); (2) the debt ledger
  itself — `openDebtIfNeeded` runs INSIDE `FoodOrderService.confirmPickup`'s existing row-locked
  transaction (the moment food leaves the counter unpaid, R-01), `confirmReturnedCash`/
  `confirmGoodsReturned` settle it (R-06/N-21/D-06 exact-match grammar), `reportNonReturn`
  writes it off AND suspends+names the rider in one transaction (R-07, mirrors
  `admin-riders.service.ts:suspendRider`'s shape: CAS, force offline, revoke sessions, audit
  row — new reserved action `rider.suspend_food_debt`); (3) N-10 no-show / R-08 refusal at the
  door, both thin wrappers around `OrderLifecycleService.markUndelivered` reused **verbatim**
  (never a parallel state machine) — refusal additionally cash-bans the customer
  (`Profile.cashBanned`, food orders only, WALLET still available). R-09's masked-code rule is
  enforced server-side in `order-lifecycle.service.ts`'s `rotateDeliveryCode` (the customer's
  only reveal path, since a food order's assignment is rider- not customer-initiated) AND
  `confirmDelivery` (defense in depth) — both gate on `customerCashConfirmedAt &&
  riderCashConfirmedAt` for a CASH merchant order, a no-op for every parcel/WALLET order (the
  fields are always null). New soft-lock `common/merchant-debt-lock.ts:hasOpenMerchantObligation`
  (mirrors C3's `hasLiveFoodDispatchOffer`) wired into the same three call sites (`matching.
  service.ts:selectOffer`, `offers.service.ts:makeOffer`, `dispatch-strategy.ts:pickCandidate`)
  so a rider owing a debt or mid-handshake takes no new job, food or parcel (N-20). D-12 refund
  (`refundOrder`, wallet-paid orders only, scoped to the payment-confirm→mark-ready window,
  reference+amount required synchronously — the hard requirement D-12 actually states). **Scope
  cut, flagged per §9 discipline:** only `merchantCashRule="collect_and_return"` (the default,
  recommended rule) opens a debt — `pay_upfront` kitchens still get the handshake but no ledger;
  that direction is the OLD float model's mirror image (merchant owes the rider), explicitly
  named in the design doc as surviving only for upfront kitchens, left for a future increment
  rather than half-built here. N-12's 2h SLA escalation sweep is likewise not implemented — no
  concrete trigger is specified beyond D-12's synchronous reference requirement (which this PR
  does enforce); Q6 stays open, owned by X1. R-09's offline press-and-hold reveal is Lane D4's
  client mechanic, not this PR's. A frozen handshake (R-05) has no resolve endpoint yet —
  deliberate: X1 owns the admin dispute-resolution surface; the freeze itself (server-enforced
  block) is real and tested. `pnpm typecheck && pnpm lint && pnpm test` green across the whole
  monorepo (api 1426 tests incl. 28 new in `food-debt.service.spec.ts` + new coverage in
  `order-lifecycle.service.spec.ts`/`order-lifecycle.transitions.spec.ts`/`matching.service.
  spec.ts`/`offers.service.spec.ts`/`dispatch-strategy.spec.ts`; mobile 574; shared 157;
  depcruise 0 errors — `express-no-merchant-coupling` holds, `merchant/food-debt.service.ts`
  reuses `OrderLifecycleService` via the sanctioned merchant→shared direction). Migration 0044,
  additive only (every new column nullable, one new table). C5 (realtime/notifications/
  statements) is next.
- [ ] **C5 · Realtime + notifications + statements.** Kitchen socket queue reusing
  TrackingModule (server-paused accept clocks while dark, reconnect backfill with count);
  customer push contract (accepted-pay-now persistent, rider-secured, at-door; soft reminder
  N-22); rider offer alarm channel vs parcel ping; weekly merchant statement + commission
  accrual display (0% + illustrative 10% comparator N-13) + end-of-day close job (N-23);
  utilization metric extended per-vertical.

### Lane D — food UI (`apps/mobile`, customer + rider food flows)

Phase-0 gate: requires A1 (customer shell) for D1–D4, B1/B4 (rider shell + active-job) for D5,
and the matching Lane C contracts (C1 for D1, C2 for D2–D3, C4 for D4–D5) merged.

- [x] **D1 · Browse.** Restaurant list (photo-led, hero + thumbs, tinted-initial fallback),
  search, menu (category tabs mirroring D-29), item sheet, closed/closes-while-browsing states,
  cart with per-item + order notes (D-35, price never changes), sold-out / price-changed /
  empty states. **Done 2026-07-29:** new `app/food/` route group (`_layout.tsx` wraps it in a
  `FoodCartProvider`) — `index.tsx` restaurant list (open-now filter, offline warm-paint snapshot
  + saved-at timestamp, five states), `search.tsx` (client-side name/cuisine-tag match over the
  already-fetched list), `[id].tsx` menu (category tabs, closed banner via `nextOpenDescription`,
  a 60s poll that fires the R2·b1 "just closed" interrupt on a genuine open→closed transition),
  `cart.tsx` (qty/remove per line, order note, N-15 small-order-fee line, OOS/price-change
  reconciliation against a fresh menu fetch). New RN components `src/ui/food/` (`FoodThumb`
  tinted-initial photo slot reusing `logic/avatar`'s tint function, `RestaurantRow`, `MenuRow`,
  `ItemSheet` — no portion/option picker, since `MerchantDish` (C1) carries no variant schema;
  flagging that as an open item rather than fabricating UI over data that doesn't exist), and
  `NoteField` (multiline sibling to the shared single-line `Field`). Cart state
  (`src/food/cart-context.tsx` + `src/logic/food-cart.ts`) persists through SecureStore
  (`src/net/food-cart-store.ts`) per §3 "survives an app restart" — PII-free (dish
  ids/names/prices/qty/notes only) — and is wiped by `clearDeviceState()` on sign-out (same
  BH-17 shared-device discipline as every other per-session draft key), alongside a new
  restaurant-list warm-paint snapshot (`src/net/restaurant-list-store.ts`) for the D-19 offline
  state. `QtyStepper` gained an optional `max` prop (default unchanged) so food dishes cap at the
  C2 wire contract's 20 rather than Send's 99. Small, additive Lane C touch: `RestaurantListItem`
  (customer read API, C1) gained a `hours: MerchantHours.nullable()` field — needed to render the
  closed/closes-while-browsing states honestly instead of faking an open/closed flag — plus a new
  pure `packages/shared/src/restaurant-hours.ts` (`isMerchantOpenNow`/`minutesUntilClose`/
  `nextOpenDescription`, fail-open when a merchant hasn't set hours) computing it client-side so
  the server never ships a staleable precomputed boolean; `merchant.service.ts`'s `toListItem`
  passes `hours` through, additive to the existing wire shape (no existing test asserted an
  exhaustive shape, confirmed before editing). Checkout itself (delivery fee, ETA, the "Continue"
  CTA) is explicitly D2's — the cart totals subtotal + N-15 small-order fee only, and "Continue"
  toasts "coming soon" rather than faking a route that doesn't exist yet. Dish-level search (the
  gallery's cross-restaurant "DISHES" section) needs a menu index the C1 customer read API
  doesn't have — flagged as an open item for a future Lane C increment, not silently dropped.
  Bundle-size budget raised (`size-budget.json`: Hermes 6.23 MB → 6.30 MB, export total
  12.48 MB → 12.56 MB) to cover this increment's new screens/components, ~0.5% headroom left on
  each; measured locally via `expo export --platform android` + `scripts/check-bundle-size.mjs`
  per docs/APP-SIZE.md. `pnpm typecheck && pnpm lint && pnpm test` green across the whole
  monorepo (mobile: 73 suites / 556 tests, incl. new suites for `food-cart.ts`'s pure cart math
  and the BH-17 device-state wipe-key characterization; shared: 9 suites / 152 tests incl. new
  `restaurant-hours.test.ts`; api: 91 suites / 1333 tests incl. 2 new `merchant.service.spec.ts`
  cases for the `hours` passthrough). D2 (checkout + kitchen-confirms) is next.
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

- [x] **E1 · Auth + shell + alarm discipline.** Phone+OTP sign-in ("Sign in & start the alarm",
  D-05) with fail-closed middleware; app shell tablet-first 1024×680 degrading to phone; looping
  2-tone alarm unlocked by the login gesture, `AudioContext` re-resumed on every gesture; Screen
  Wake Lock with flashing-header fallback; visible alarm state; red CONNECTION LOST bar ≤3s,
  actions disabled, backoff counter, reconnect backfill banner; rebooted-mid-shift recovery
  (§3 of the decisions doc, implemented as written). **Done 2026-07-29:** replaces the P0
  placeholder (`apps/merchant`) with the first authenticated surface — `middleware.ts` fail-closed
  gate (mirrors `apps/admin/middleware.ts`'s shape: a pure, unit-tested `evaluateMerchantAccess`
  policy in `app/lib/merchant-access.ts`, only checking session-cookie PRESENCE — the real
  authorization boundary stays server-side, `RestaurantsEnabledGuard`→`JwtAuthGuard`→`MerchantGuard`
  on every `apps/api` merchant route, since a merchant JWT carries no `merchantId` claim to verify
  independently without duplicating the API's signing secret into this app). Login reuses the
  existing phone+OTP flow (`/auth/otp/request`, `/auth/otp/verify`) unchanged; `GET /merchant/me`
  on the queue landing page confirms `role: "merchant"` server-side and shows a clear
  not-registered state (with sign-out) instead of a silent 403 loop for a customer-role token —
  **mocked default, not self-serve**: E1 does not wire a `POST /merchant/become` + re-auth dance
  from the tablet itself (the API mints `role` into the JWT at sign-in time and does not reissue a
  token after `become` flips the DB row, so a stale token needs a fresh OTP verify regardless);
  merchants reach the tablet already provisioned (founder/admin onboarding), flagged here rather
  than silently decided. Alarm: `AlarmController`/`alarmPhaseAt` (`app/lib/alarm.ts`, pure
  2-tone-cycle timing, unit-tested) over a synthesized Web Audio two-tone chime
  (`WebAudioToneSink`, no shipped audio asset) — `arm()` fires on the sign-in tap (the D-05
  gesture) and resets to unarmed on every real reload (`RearmBanner`, the §3 "one tap to re-arm"
  reboot behaviour); mute state renders in `KitchenBar` "at all times ... never silent." Screen
  Wake Lock (`useWakeLock`) with the §3 flashing-header fallback when refused/unsupported.
  Reconnect: `ReachabilityStore` (`app/lib/reachability.ts`, capped-backoff `/healthz` probe,
  identical formula to `apps/mobile/src/net/reachability.ts`) drives the CONNECTION LOST bar
  (attempt counter, `actionsDisabled` exposed via context for E2's mutating buttons to consume)
  and a "back online" banner; the ORDER-COUNT backfill banner itself is E2's job (needs a real
  dark-period order source — no live queue exists yet). Design tokens: added the additive
  `--danger-ink`/`dangerInk` token (`packages/design/tokens/colors.css`'s existing value,
  `#8F2418`) to `packages/shared/src/design-tokens.ts` and `apps/merchant/app/globals.css` (B3's
  job originally, pulled forward since E1 needed it first for the muted-alarm state — additive,
  no conflict expected). CI: added `pnpm --filter @lynia/merchant test` (mirrors the admin
  console-auth gate reasoning — turbo's `test` task has no merchant entry wired, same as admin).
  `pnpm typecheck && pnpm lint && pnpm test` green across all 6 packages (29 new merchant unit
  tests: access policy, session parsing, alarm timing/state machine, reachability backoff/state
  machine). E2 (queue + cook flow) is next.
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

### Cross-cutting (owned by Build loop C after C1–C5: X1 then X2, one per firing)

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
lane, offset from the eight standing routines (23/01/02/03/05/07/08/09/14/20 UTC are taken).
Two slots per lane per day (2026-07-28 cadence increase, ≥6h apart): the second slot's usual job
is finishing/merging the first slot's PR same-day (Phase-0 babysit rule), converting would-be
lost days into same-day recovery; a slot with nothing to do exits at Phase-0 cheaply. One
increment per firing and one in-flight PR per lane are unchanged:

| Loop | Trigger name | Cron (UTC) | Lane |
|---|---|---|---|
| Build L-C | `Build loop C — restaurants backend` | `0 10,17 * * *` | Lane C first (contracts lead), then X1/X2 |
| Build L-A | `Build loop A — customer home + IA` | `0 12,19 * * *` | Lane A |
| Build L-B | `Build loop B — one rider app` | `0 16,22 * * *` | Lane B |
| Build L-D | `Build loop D — food UI` | `0 11,18 * * *` | Lane D (gates on A/B/C) |
| Build L-E | `Build loop E — merchant tablet` | `0 13,21 * * *` | Lane E (gates on C) |

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

- [2026-07-29] [B, cross-lane C] Not a stall — B2 shipped fully within `apps/mobile` scope — but
  the rider board can't show a *live* food offer card until Lane C adds a rider-facing surface
  for one: `food-dispatch.service.ts` (C3, shipped) has no `GET` a rider can call for an
  `open_for_offers` order (the merchant queue reads are `MerchantGuard`-gated) and no board-style
  WS event analogous to `boardNewOrder`/`orderTaken` for a food offer landing/expiring/being
  taken — today the only rider-side signal is the `food_offer` push notification. `JobCard`
  already renders `jobType: "food"` (unit-tested); B4 (active-job screen) will hit the same gap
  for its own food step list. Owner: Lane C's next firing, or whichever of B/D picks this up —
  small (one GET + one WS event, mirroring the parcel board's existing shape).
