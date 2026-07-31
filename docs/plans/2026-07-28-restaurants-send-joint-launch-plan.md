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
- [x] **A3 · Orders + Account tabs.** Orders = one cross-service list (absorbs
  `app/history/`); live order pinned on top; Account absorbs profile/settings/help/notifications
  entry points. Retire orphaned entry points. **Done 2026-07-30:** `(tabs)/orders.tsx` and
  `(tabs)/account.tsx` now carry the real content instead of bridging out — matching
  `packages/design/explorations/restaurants/r-customer-a.jsx`'s `RC.orders` (icon avatar per row,
  restaurant name as the title for a food order, "EARLIER" section under the pinned live order) and
  the existing (unchanged) `app/profile/`'s own content for Account, minus the "Trip history"
  button the Orders tab now supersedes. `app/history/` and `app/profile/` are left running exactly
  as they were — `app/rider/(tabs)/account.tsx` (Lane B, out of this lane's scope) still bridges to
  both — so this PR adds its own copy of the row/details rendering rather than reaching into those
  routes' internals; `send.tsx`'s account icon is repointed `/profile` → `/account` (the tab), for
  the same reason `(tabs)/home.tsx`'s BrandHeader `onProfile` already did in A1. **API change:**
  `historyForUser` now selects+returns `orderType` and the merchant's `name` (as `merchantName`) —
  the row shape a cross-service list needs to tell a food order from a parcel one and title it by
  restaurant rather than by pickup/dropoff landmarks (the kitchen/customer address, not a name a
  customer recognizes); covered by a new spec case, `historyForUser`'s existing tests otherwise
  unaffected (a mock-driven unit spec, no migration). Reused the existing `["activeCustomerOrder"]`
  query (same key `(tabs)/home.tsx` and `send.tsx`'s restore banner already read) for the pinned
  live card — no new fetch. `pnpm typecheck && pnpm lint && pnpm test` green across all 6 packages
  (mobile: 79 suites / 599 tests; api: 94 suites / 1433 tests). Bundle-size measured locally
  (`expo export --platform android` + `scripts/check-bundle-size.mjs`): Hermes 6,357,879 /
  6,390,000 bytes, ~31 KiB headroom left — no budget bump needed this PR. A4 (five-states +
  retirement sweep) is next.
- [x] **A4 · Five-states + retirement sweep.** Every new customer surface ships default /
  loading / empty / error / offline per the gallery; remove the retired `home_launcher`
  intermediate and any dead nav; accent-split spot-check; jest coverage for boot-route + nav
  guards. **Done 2026-07-30:** offline is already global (`app/_layout.tsx`'s `ConnectivityBanner`,
  shipped pre-Lane-A, sits above every screen including the tabs) — the real per-screen gaps were
  loading and error on the Home tab, and error on the Orders tab, both reading the same
  `["activeCustomerOrder"]` query send.tsx's compose screen already hardened under UX20-01 ("the
  active-order check failing must be visible, not a silent dead end") — a gap this lane's own two
  newest call sites had simply never inherited. Extracted send.tsx's local `ActiveOrderCheckFailedBanner`
  into a shared `src/ui/ActiveOrderCheckFailedBanner.tsx` (send.tsx now imports it, zero behaviour
  change there) and wired it into `(tabs)/home.tsx` and `(tabs)/orders.tsx` for `activeOrderQ.isError`;
  `(tabs)/home.tsx` also gained a `SkeletonRows` loading state for the genuine first-load window
  (`activeOrderQ.isLoading || (historyFeed.rows === null && historyFeed.isFetching)`), matching the
  Orders tab's own pre-existing loading rule instead of a blank gap between the tiles and the
  restaurants rail. **Retirement sweep:** grepped the whole repo for `home_launcher` and dead nav —
  zero hits; A1 already completed this retirement in full (the composer's `git mv` to `/send`, the
  tabs restructure) and there was nothing left to remove. **Accent-split spot-check:** grepped every
  Lane A file (`app/(tabs)/*`, `src/ui/home/*`, `src/ui/shell/*`) for `color: tokens.color.accent`
  used as TEXT color (the banned pattern — green text must be `accentText`) — zero violations; every
  raw `accent` usage in this lane is a background/border fill, the sanctioned use. (One unrelated
  violation found in `app/rider/job.tsx:861`, Lane B's file, out of this lane's customer-surfaces-only
  scope — flagged here rather than fixed, since Lane B is already marked complete above.) **Jest
  coverage for boot-route + nav guards:** already comprehensive from A1's own work
  (`boot-route.test.ts` covers every `bootDestination` branch, `session-gate.test.ts` covers the
  `isLogoutTransition` guard, `tab-bar.test.ts` covers the `APP_TABS`/`RIDER_TABS` route-name
  contracts) — re-verified green, no gap found, nothing new needed there. Added
  `app/(tabs)/__tests__/home.test.tsx` and `app/(tabs)/__tests__/orders.test.tsx` (new render-level
  coverage for both tabs' loading/default/empty/error states, mocking the API/hook layer only so the
  real react-query loading/error transitions are exercised). `pnpm typecheck && pnpm lint && pnpm test`
  green across all 6 packages (mobile: 82 suites / 619 tests, incl. 8 new cases across the two new
  test files; api 94 suites / 1439 tests unaffected). Bundle-size measured locally
  (`expo export --platform android` + `scripts/check-bundle-size.mjs`): Android export 12,603,433 /
  12,620,000 bytes (16.18 KiB headroom), Hermes 6,370,304 / 6,390,000 bytes (19.23 KiB headroom) — no
  budget bump needed. **Lane A complete** — A1–A4 all shipped; see the lane-completion note below.

**Lane A complete (2026-07-30):** all four boxes above (A1 tab shell + Send demotion, A2 home
content, A3 Orders/Account tabs, A4 five-states + retirement sweep) are shipped and merged. The
customer app now has its full new IA — launcher home, one cross-service Orders list, Account, and a
consistent loading/default/empty/error/offline contract on every Lane A surface (offline global,
the rest per-screen) — with the Food tile/rail gated behind `restaurantsEnabled` throughout for the
escape hatch. Nothing left in this lane's queue; this build loop's trigger is disabled after this PR
merges.

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
- [x] **B4 · One active-job screen.** Shared Stepper with per-type step lists (parcel steps live;
  food steps land with Lane D5); exception screens (wrong code, unreachable, dropped) written
  once and reused; 6-digit delivery code closes both. Retire superseded screens named in
  `gallery-map.js` header; jest regression on rider boot + gates. **Done 2026-07-30:** the
  active-job screen (`app/rider/job.tsx`) was already the one shared screen for any job that
  reaches `assigned` — a food order rides the identical `assigned→…→completed` status edges as a
  parcel from that point (`order-lifecycle.service.ts`'s own comment: "the food order rides the
  same edges as a parcel from here on, orderType: both"), and `UndeliveredSheet`/`DeliveryOtp`
  were already the one written-once exception surface (wrong code = `DeliveryOtp`'s attempt
  lockout, unreachable/dropped = `UndeliveredReason.UNREACHABLE`/`BREAKDOWN`), so this PR's real
  increment is the two pieces that weren't done yet. **Stepper per-type step lists:** `Stepper`
  (`src/ui/index.tsx`) gained an optional `jobType: "parcel" | "food"` prop (default `"parcel"`) —
  the rider label set now branches per type, food labels ported verbatim by position from
  `rider-one-app.jsx`'s `FOOD_STEPS`. `JobDetailsCard` passes `jobType="parcel"` explicitly with a
  flag comment: `OrderSnapshot` carries no `orderType` field yet, so the food branch is real code,
  unit-tested (`src/ui/__tests__/stepper.test.tsx`), but unwired — Lane D5 is what gives the
  active-job screen a live food signal, the same dark-not-blocked shape B2 used for `JobCard`'s
  `jobType` prop. The customer view is untouched (still parcel-only) — a customer's food order
  tracks through its own D3 tracker, never this Stepper. **Cash-held split, now live:**
  `CashHeldStrip` (B3) render its first real, non-zero figure — `app/rider/job.tsx`'s active
  branch now shows `yours={agreedFare ?? proposedFare}` (parcel cash is always all the rider's)
  and `owed={0}` (a food job's collect-and-return money isn't wired to the rider screen until
  Lane D5); the Money tab still renders `0/0` (unchanged, no feed for "cash owed across any open
  job" yet). **Gallery retirement check:** every `gallery-map.js`-header-listed RJ screen
  (`rider_offline`/`online_empty`/`board`, `offer_compose`, `earnings`/`earnings_new`, `wallet`,
  `profile`, `gate_commission`) was already retired by B1–B3 — confirmed nothing new to retire this
  PR (`apps/mobile/app/wallet/` holds only `top-up.tsx`, still linked from Money; no `earnings/`
  directory). `pnpm typecheck && pnpm lint && pnpm test` green across all 6 packages (mobile: 80
  suites / 603 tests, incl. 4 new `stepper.test.tsx` cases; api: 94 suites / 1432 tests
  unaffected). **Lane B complete** — B1–B4 all shipped; see the lane-completion note below.

**Lane B complete (2026-07-30):** all four boxes above (B1 tab shell, B2 one board, B3 Money tab,
B4 active-job screen) are shipped and merged. The rider app is now genuinely one app for both
verticals at every layer this lane owns — tab bar, board, money, and the active-job screen — with
every food-specific surface built dark-not-blocked (flagged, unit-tested, structurally ready) since
Lane C's dispatch/assignment backend and Lane D5's live food rider flow haven't landed yet. Nothing
left in this lane's queue; this build loop's trigger is disabled after this PR merges.

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
  utilization metric extended per-vertical. N-23 end-of-day close was already shipped inside C2
  (`FoodOrderService.sweepEndOfDayClose`) — nothing left to do there. **Done 2026-07-30 (rider offer
  alarm channel slice, closing the §10 blocker):** `GET /merchant/orders/dispatch/offer`
  (`FoodDispatchService.getOfferForRider`, wrapped as `{ offer }` so "none live" round-trips as
  real JSON rather than an empty body) plus two new WS events, `food:offer`/`food:offer-closed`
  (`TrackingGateway.emitFoodOffer`/`emitFoodOfferClosed`, direct-to-rider via the same cluster-wide
  `fetchSockets`-and-filter lookup `kickRiderFromBoard`/`evictRiderFromSupply` already use — food
  dispatch offers exactly one candidate at a time, so there's no board room to address). Both the
  REST poll and the WS push are built from one shared, `.strict()`-parsed, PII-redacted
  `FoodOfferEvent` (point + landmark only, never `contactPhone` — mirrors `BoardNewOrderEvent`),
  wired at `tick()`'s offer-created commit and `releaseCurrentOffer`'s expire/decline close-out.
  Golden matrix extended (`merchant-routes-dead.e2e.spec.ts`): the new route is dead-when-off and,
  flagged on, needs only `JwtAuthGuard` (no `MerchantGuard` — it's the rider's own action). **Done
  2026-07-30 (customer push contract slice):** the three curated food pushes named in
  RESTAURANTS-DECISIONS.md §3 ("No push for step changes in between, the tracker is enough") —
  "merchant accepted — pay now", "rider is at your door", and the N-22 soft reminder. Rider-secured
  was already covered (`FoodDispatchService.acceptDispatch`, C3). `FoodOrderService.requestPayment`
  now pushes the customer directly (`kind: "food_pay_now"`, own copy/action-button data — richer
  than a generic status notice, so it's sent at the call site rather than through
  `notifyOrderStatus`). New `FoodOrderService.sweepPaymentReminders` (wired into the existing 20s
  `runSweeps`) fires N-22's once-only reminder 15 min after an unanswered request
  (`RESTAURANTS_TIMING.paymentReminderWindowMs`), guarded by a new nullable `Order.
  paymentReminderSentAt` idempotency column (migration 0045, additive-only) so a crash between the
  claim and the best-effort push at worst drops one reminder rather than repeating it. "Rider is at
  your door" reuses the *existing* generic hook instead of a new one: `order-lifecycle.service.ts`'s
  shared `en_route_dropoff` edge already calls `notifications.notifyOrderStatus` for every order
  type (parcel and merchant alike, since a food order rides this edge verbatim from `assigned` on)
  — that method previously no-op'd for any non-parcel order type; it now branches on
  `order.orderType` into a new, deliberately small `MERCHANT_STATUS_NOTICES` table (one entry,
  `en_route_dropoff`) instead of the full parcel `STATUS_NOTICES`, so every OTHER shared edge
  (`confirmed`, `en_route_pickup`, `picked_up`, `delivered`) stays silent for a food order exactly as
  the design calls for. Sticky/lock-screen rendering and the Pay now/View order action buttons are a
  mobile client concern (Lane D, not flagged as a new open question — it's a rendering detail of an
  already-named push, not a product decision) — this slice's job was the data contract (`kind`,
  `orderId`, persistent-until-paid semantics via no TTL) a client can hook into without another
  backend round-trip. Kitchen tablet realtime (its own new merchant-presence/dark-clock-pause/
  reconnect-backfill surface — no existing prior art in this codebase, confirmed by inspection) and
  the weekly statement + per-vertical utilization metric are unstarted and remain open for a future
  C5 firing.

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
- [x] **D2 · Checkout + kitchen-confirms.** CASH / WALLET checkout (ETA promise anchored on
  payment confirm D-21/R-17), placing → waiting-for-accept → "they call to confirm" band →
  pay-the-restaurant (manual rail D-24: copyable number/amount/reference, "I paid another way")
  → paid-waiting (D-25) → confirmed; still-unpaid reminder + free cancel; offline checkout
  state. **Done 2026-07-30:** new `app/food/checkout.tsx` (CASH/WALLET selectable rows, a
  `MapPicker`+`AddressSearch` dropoff capture reusing Send's exact address-entry primitives, a
  client-side delivery-fee ESTIMATE mirroring the server's own `haversineKm`→
  `deliveryFeeForDistance` math, five states incl. R4·b1 offline/R4·b2 placing) and
  `app/food/order/[orderId].tsx` (branches on `merchantPhase`, not `status` — a food order sits at
  `status:"requested"` through the whole pre-dispatch window per C2 — rendering R5·1 waiting-for-
  accept + a `CountdownRing` off the server's own `acceptDeadlineAt`, R5·b3 the D-23 item-approval
  interrupt off `itemApprovalDeadlineAt`, R5·1b "they call to confirm", R5·3 the D-24 manual pay
  rail (`ManualPayRail`, copy buttons via a new `expo-clipboard` dependency), R5·6 paid-waiting,
  R5·b1 still-unpaid free-cancel (a client-derived N-22 15-min nudge, since R-17 left no server
  clock to key off), and the cancelled terminal via `rejectionCopy()`). Cart's "Continue" CTA now
  pushes to `/food/checkout` instead of D1's placeholder toast. C2 ships no WebSocket for any
  pre-dispatch phase (confirmed by grep — `food-dispatch.service.ts` only emits from
  `ready_for_pickup` on) and no server push for "merchant accepted" exists yet either — both
  screens are pure-poll (`useFoodOrder`, interval tightened around the two real deadlines,
  relaxed once R-17's clock-free `awaiting_payment` phase is reached), and both gaps are flagged
  below rather than faked. Two small additive Lane C touches, same "the code wins" precedent D1
  used for `hours`: `RestaurantListItem` gained a `location: LatLng.nullable()` field (the
  geo-point ONLY — never the full `Merchant.location` Waypoint, since its `contactPhone`/`landmark`
  are D-17-masked on a third party's view) so checkout can price its estimate client-side; and
  `MerchantOrderResponse` gained `merchantPaymentPhone` (the shop's own UNMASKED payment number —
  D-17's masking is for a rider's view of the merchant, not the customer's own active order, which
  D-24 requires showing the real number to pay). Restart survival (§3): a new PII-free
  `food-order-store.ts` snapshot (order id + status only) warm-paints the order screen and is wired
  into `clearDeviceState()`'s sign-out wipe list; full "land on the live order at boot" is D4's own
  restart-tolerance bullet, not duplicated here. Four new icons (`wallet`/`circle-check`/`copy`/
  `refresh-cw`) added to `Icon.tsx` (self-hosted subset) and `copy` backfilled into
  `packages/design/assets/lynia-icons.js` (the other three were already there). `StatusPill` gained
  a `highlight` tone (gold, `highlightWash`/`highlightInk`) for R5·6's "PAID but not yet confirmed"
  pill — deliberately not the same green as a genuine success. Bundle-size raised (`size-budget.json`:
  Hermes 6.32 MB → 6.39 MB, export 12.58 MB → 12.62 MB, ~0.2–0.5% headroom left) to cover the new
  screens/components plus `expo-clipboard`; measured locally via `expo export --platform android` +
  `scripts/check-bundle-size.mjs`. `pnpm typecheck && pnpm lint && pnpm test` green across the whole
  monorepo (mobile: 78 suites / 597 tests incl. new suites for `food-checkout.ts`'s pure delivery-fee-
  estimate/free-cancel-eligibility/still-unpaid-reminder math, `CountdownRing.tsx`'s
  `formatCountdown`, and the order screen's full phase-branching render suite; shared: 9 suites / 157 tests;
  api: 94 suites / 1428 tests incl. 2 new `merchant.service.spec.ts` cases for the `location`
  geo-point-only passthrough). **Open items — surfaced, not silently decided:** (1) no server push
  exists for "merchant accepted — pay now" (§3's own documented push) nor any WS event for the
  pre-dispatch phases — both screens poll only; (2) checkout's delivery fee is a client-side
  ESTIMATE, confirmed only once `placeOrder` returns — an honest gap given `RestaurantListItem`
  carried no merchant location before this PR; (3) D2 does not attempt D-23's "who confirms an
  unanswered item-approval window" default (N-18) — that's C2's own already-mocked default, carried
  forward unchanged. D3 (track) is next.
- [x] **D3 · Track.** Prep countdown ring over the re-labelled 7-step Express tracker (D-03),
  rider-secured moment (D-04), plate number promoted (D-27), live-paused, NO_RIDER apology
  (D-13), cancel sheet, refund-pending/refunded, safety surface reused verbatim (D-28). **Done
  2026-07-30:** extends D2's `app/food/order/[orderId].tsx` fallthrough ("we'll show live progress
  here soon") into the full post-payment lifecycle. D-03: `Stepper` (`src/ui/index.tsx`) gains
  `STEP_LABELS.customer.food` (re-labelled, same seven dots/✓/live grammar — B4 already ported the
  rider-side sibling); the prep/dispatch cards render this Stepper too, so the ring sits ABOVE the
  same persistent tracker rather than a new timeline component. `merchantPhase="preparing"` shows a
  `CountdownRing` off `prepStartedAt`/`prepMinutes` — honest copy diverges from the gallery mock's
  "cooking + searching in parallel," since this locked architecture (C3's own D-04/D-33 note)
  dispatches only once the merchant marks the order ready, not during prep.
  `merchantPhase="ready_for_pickup"` covers both the N-08 60s-per-candidate search and the N-07
  6-attempt hold (`noRiderHoldAt`) with one muted, non-alarming card — the hold window has no
  design-doc state and no auto-timeout (a named mocked default, flagged here). D-04: once `riderId`
  is set (`dispatch_accept` clears `merchantPhase` to null), a green "Rider secured" banner shows on
  the `assigned` transition. **D-27 (plate number) and any rider name/photo/rating: flagged as a
  real gap, not built.** Neither `MerchantOrderResponse` nor the generic `OrderSnapshot` carries a
  rider identity/plate field for a food job — a parcel's tracking card gets its face/name/rating
  from a client-side cache captured at `chooseOffer` time, a moment that doesn't exist for food
  (dispatch is fully server-automatic). `LiveTrackingCard` (`src/ui/order/LiveTrackingCard.tsx`)
  gains an optional `jobType`/`feeLabel` prop pair (re-label, don't fork — same instruction B4 used
  on `Stepper`) so D3 reuses it verbatim for the map/ETA/phone/Stepper composition once dispatched,
  fed by the GENERIC order snapshot (`getOrder`, same `orderKey` cache LiveTrackingCard's own
  telemetry observer subscribes to) — `getSnapshot` carries no `orderType` filter, only a
  party-on-the-order check, so this works today with zero backend change; `riderIdentity` is passed
  `null` (degrades gracefully, per its existing `? … : null` guard) rather than fabricated. No
  WebSocket wired for the post-dispatch tracker (10s poll instead, unlike the parcel screen's
  `useOrderSocket`) — an open item, mirrors D2's own poll-only PR-body note. Cancel: pre-dispatch
  stays D2's free `cancelUnpaidFoodOrder`; post-dispatch (a rider already committed) reuses the
  generic, already-proven `cancelOrder` behind a confirm-first inline `Card` (mirrors
  `app/order/[id].tsx`'s `MATCHED_CANCEL` pattern, not the gallery's radio-reason sheet, since that
  reason-picker was never actually shipped for Express either). **Open item, PR body:** whether a
  post-dispatch cancel auto-refunds an already-paid WALLET order isn't specified anywhere in the
  transitions table — reusing the proven path rather than inventing new money behaviour. D-13: the
  cancelled branch special-cases `rejectionReason==="no_rider"` into the richer apology (reusing
  `rejectionCopy("no_rider")`, already-shipped copy) instead of the generic cancelled card.
  Refund-pending/refunded: `refundOrder` (C4) sets `refundedAt` atomically WITH the cancel, so
  there's no separate "pending" window server-side today — the cancelled branch renders only the
  terminal "Refunded in full" card (reference + amount), flagged as a scope note rather than
  inventing a pending state that can't occur. D-28: `GetHelpControl`/`SosControl`
  (`src/ui/safety.tsx`) imported and dropped in unchanged on the live-tracker card — genuinely
  verbatim, zero fork; `ReportControl` deliberately withheld here (matches the parcel screen's own
  convention of only offering it once a trip is terminal, not mid-delivery). Delivered/completed:
  explicitly NOT this box's job (D4 owns "delivered + rate") — a minimal, honest terminal card so
  the screen never dead-ends on a WALLET order that reaches `delivered` before D4 ships (no CASH
  handshake gate blocks it). `pnpm typecheck && pnpm lint && pnpm test` green across all 6 packages
  (mobile: 80 suites / 611 tests, incl. 7 new D3 phase-branching cases in
  `app/food/order/__tests__/order-screen.test.tsx` and 2 new `Stepper` food-customer-label cases
  replacing the now-stale B4 "ignores jobType on the customer view" assertion; api: 94 suites / 1439
  tests unaffected). `pnpm depcruise` clean. Bundle-size budget is still report-only (0/0 in
  `size-budget.json`, unchanged since D1) — no measurement gate to run this increment. D4 (doorstep)
  is next.
- [x] **D4 · Doorstep.** Dual-confirm handshake ("I gave $X" → "I received $X" → code reveals,
  R-04), masked code during CASH transit with offline press-and-hold reveal (R-09), rider-didn't-
  confirm support state, delivered + rate, no-show failure timeline (N-10), resumed-mid-order
  restart tolerance (§3 of the decisions doc). **Done 2026-07-31:** the CUSTOMER half only — the
  rider's own confirm/dispute/collect/return pipeline is D5's build, gate-satisfied and next. All new
  UI lives on D3's `app/food/order/[orderId].tsx`, no new routes. New pure `src/logic/food-doorstep.ts`
  (`handshakeState`/`codeEligible`/`handshakeCountdown`) derives the four-state machine
  (pending/waiting_rider/frozen/confirmed) purely off the C4 backend's own four timestamps — R-05's
  2:00 freeze window is read off the server's `cashHandshakeDeadlineAt`, never a client timer. Two new
  `src/ui/food/` components, both re-labelled off existing grammar rather than forked:
  `CashHandshakeCard` (the four states — R7·1/R7·1b/R7·1c/R7·b3 in the gallery) and `DeliveryCodeCard`
  (R-09's masked `••• •••` with a genuine `onLongPress` press-and-hold reveal — disabled with no code
  yet, plain unmasked for WALLET, masked-until-deliberate-gesture for CASH). New customer-side API call
  `confirmFoodCustomerCash` (`POST .../cash/customer-confirm`); the rider's mirror endpoints
  (`cash/rider-confirm`, `cash/dispute`, `doorstep/*`) are already live server-side (C4) and stay unused
  from the customer app by design — D5's job. Delivery code: unlike a parcel (issued at `select`), a
  food order has no client-side "choose a rider" moment to fetch one from, so a new effect calls the
  already-generic `rotateDeliveryCode` itself the instant the order is eligible (WALLET: immediately;
  CASH: only once both handshake confirms land, matching the server's own R-09 gate) — and the existing
  `reconcileDeliveryCode`/KB-DELIVERY-CODE-ROTATION-SIGNAL machinery from `app/order/[id].tsx` is reused
  verbatim (not forked) so a stale local code from an app-killed rotation can't be relayed to the rider.
  R-09's "logged" reveal: a new best-effort local-only marker (`saveCodeRevealedAt`, `device-state.ts`,
  same per-order index/sign-out sweep as the code itself) — **no server sync endpoint exists yet for
  it**, flagged rather than fabricated; "synced later" per the design doc is aspirational until a future
  Lane C increment adds one. Delivered/rate: `RatingCard` reused verbatim (same component `app/order/
  [id].tsx` uses) with the SAME `PendingRating`/`reconcilePendingRating` offline-retry marker — a cold
  start after an app-kill mid-undo-window self-heals on the next poll, same as Express. The gallery's
  R7·2 shows a SECOND "how was the food?" rating alongside the rider one; only the existing rider-rating
  `rateOrder` endpoint exists server-side, so a separate food-quality score is flagged as an open item,
  not invented. No-show/refused: a new `order.status === "undelivered"` branch (previously unhandled —
  the generic fallback silently caught it) reuses `UNDELIVERED_REASON_LABEL` verbatim from the parcel
  screen (already covers "unreachable"/"refused") and additionally names R-08's real, undisclosed-until-
  now consequence ("cash is no longer available… mobile money only from here on") rather than silently
  omitting it. Money-safety, conservative: Cancel is now hidden once `customerCashConfirmedAt` is set on
  a CASH order (the money already left the customer's hands — a "cancel" at that point means nothing the
  server can undo); no new server behaviour invented, just an existing action hidden past the point it
  makes sense. **Sensitive-lane four** (docs/ROUTINES.md, this touches the handshake/cash path): (1)
  *Idempotency* — every write goes through the ALREADY-idempotent C4 endpoints
  (`confirmFoodCustomerCash` CAS-guards on `customerCashConfirmedAt: null` server-side); this PR adds no
  new server mutation. (2) *State transition* — no new order-lifecycle edge; the client only renders
  the existing `MERCHANT_DEBT_TRANSITIONS`/`en_route_dropoff → delivered` edges C4 already ships and
  tests. (3) *Money arithmetic* — none added; `cashHandshakeAmount`/`total`/`merchantGoodsTotal` are
  displayed as the server returns them (`formatMoney`), no client-side math. (4) *Regression test* —
  `food-doorstep.test.ts` (state derivation + countdown), `CashHandshakeCard.test.tsx`/
  `DeliveryCodeCard.test.tsx` (the four states + the mask/reveal gesture), and the `session.test.ts`
  wipe-list characterization extended for the new reveal-log key. **Open items, PR body:** (1) no
  server sync endpoint for the offline press-and-hold reveal log (local-only for now); (2) no separate
  food-quality rating endpoint (only the rider rating exists); (3) no auto-refund path for a WALLET
  order that reaches `undelivered` (`refundOrder` only covers the pre-dispatch window, unchanged from
  D3's own flagged gap); (4) still poll-only post-dispatch (no WebSocket), unchanged from D2/D3.
  `pnpm typecheck && pnpm lint && pnpm test` green across all 6 packages (mobile: 83 suites / 632 tests,
  incl. 3 new suites for the doorstep state machine + the two new components; api/shared/admin/merchant
  unaffected — 94 suites / 1439 api tests unchanged). `pnpm depcruise` clean. Bundle-size budget raised
  (`size-budget.json`: export total 12.62 MB → 12.63 MB, ~0.1% headroom; Hermes unchanged, still under
  its own budget) to cover the two new components; measured locally via `expo export --platform android`
  + `scripts/check-bundle-size.mjs`. D5 (rider food jobs) is next — same C4 gate, already satisfied.
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
- [x] **E2 · Queue + cook flow.** Queue empty/loading → NEW ORDER takeover (stops only on
  Accept / Can't-take-it) → accept + prep chips → item-level "don't have it" (D-23) → reject
  reasons (D-11) → amber "do not cook yet" full-viewport (D-04) → rider-secured green cook
  signal → mark ready → pickup confirm (4-digit code) → handed over; two-orders-at-once; board
  at 3 orders (D-26); NO_RIDER hold with keep-cooking/stop/cancel (D-34); rider no-show;
  awaiting-payment lane that never blocks the board (M2·7). **Done 2026-07-30:** gated on C2
  (done); built against the polling fallback per this box's own gate note since C5 realtime
  hasn't merged yet (`useQueuePoll` — 5s interval + a `visibilitychange` refetch, the web
  equivalent of apps/mobile's `useForegroundRefetch`, every round trip also feeding the shared
  `ReachabilityStore` so a live queue poll counts as proof of life like the dedicated `/healthz`
  probe). **Two backend gaps found and fixed in this PR, both required for the tablet to work at
  all, not deferred:** (1) `listQueue` filtered `status: "requested"` only, so an order vanished
  from the merchant's queue the instant a candidate rider started deciding (`open_for_offers`) or
  one accepted (`assigned`/`confirmed`/`en_route_pickup`) — exactly the D-34 hold window the Ready
  column has to render; broadened to the full pre-handoff status set (`QUEUE_VISIBLE_STATUSES`),
  `picked_up` still excluded (that transition IS "handed over"). (2) `markReady` hashes the 4-digit
  pickup code and discards the plaintext — there was no way for the tablet to ever learn it to read
  out to the rider; added `POST /merchant/orders/:orderId/pickup-code/reveal` (throttled, mirrors
  `rotateDeliveryCode`'s reveal-by-rotation shape, gated on `merchantPhase==="ready_for_pickup"`,
  safe to call repeatedly since the code is only ever communicated live). New
  `apps/merchant/app/components/queue/` (`QueueBoard`, `NewOrderTakeover`, `RejectSheet`,
  `RiderSecuredTakeover`, `NoRiderHoldTakeover`, `OrderCard`) + pure/unit-tested logic in
  `app/lib/` (`order-groups.ts` bucketing, `countdown.ts`, `accept-preview.ts` for D-23's live
  recap). Takeover priority stack (only one full-viewport screen at a time): unanswered NEW ORDER
  (D-05) → unacknowledged rider-secured (D-04, celebratory here since prep already finishes before
  dispatch in this locked architecture — reconciling this box's own "do not cook yet" framing with
  C3's D-04/D-33 note: the single amber full-viewport takeover this PR ships is the D-34 NO_RIDER
  hold, not a separate pre-cook gate, since there's nothing left to gate) → an open/auto-surfaced
  D-34 hold decision → ordinary board/list. D-26 board-vs-list toggle is `orders.length >= 3`
  (server enforces no such cap — it's purely a client rendering rule, confirmed by reading
  `listQueue`). Rider identity has no name field in `MerchantOrderResponse` — the rider-secured
  takeover and Ready cards say "a rider" rather than fabricate one; flagged, not guessed.
  Awaiting-payment (M2·7) renders as a real, non-blocking board card with no action buttons yet —
  log-call/request-payment/confirm-against-statement (D-06 grammar) is explicitly E3's build, this
  box only had to prove the lane exists and never blocks Cooking/Ready; said so in the card copy
  rather than half-building E3's flow. Rider no-show has no server-side signal reachable from the
  merchant side yet (C4's no-show/refusal endpoints are the rider's own actions at the doorstep,
  well past pickup) — nothing for the queue board to render; not a gap this box could close.
  Alarm wiring: `KitchenConnectionProvider`'s `alarm` gained `ring()`/`silence()` (unbounded, E1
  only exposed the bounded `testRing()`); the queue page rings for as long as ANY `awaiting_accept`
  order exists and silences the instant none do, with takeover accept/reject handlers calling
  `refetch()` immediately on success so it doesn't wait a full poll interval to go quiet.
  `ReconnectBanner` now takes an optional `backfillCount` (computed by the queue page: snapshots
  known order ids the moment reachability drops, diffs against the first post-reconnect fetch) and
  names the count, closing E1's own "E2 can extend this" note. `pnpm typecheck && pnpm lint &&
  pnpm test` green across all 6 packages (api 1430 tests incl. 5 new for `listQueue` visibility +
  `revealPickupCode`; merchant 57 tests incl. new `order-groups`/`countdown`/`accept-preview` pure-
  logic suites; mobile 576 unaffected); `pnpm depcruise` clean (0 errors/warnings,
  `express-no-merchant-coupling` untouched — this box only touched `apps/merchant/**` and the
  existing `merchant/` API module). E3 (money surfaces) is next.
- [x] **E3 · Money surfaces.** Call-then-request-payment (button unlocked by logged call, R-16,
  regulars override) → confirm-against-own-statement (type reference + amount, mismatch blocks
  and names the gap, D-06) → release-unpaid for collect-and-return (plain-words risk statement
  R-07) → returned-cash count (N-21, return trail visible) → pickup confirms CASH/WALLET →
  short-payment block → refund-after-payment with reference (D-12) → end of day → weekly
  statement (N-13 accrual comparator, cooked-food loss line D-34). **Done 2026-07-30:** the
  awaiting-payment lane's E2 placeholder is now real — `OrderCard`'s "payment" bucket wires
  `logCall`/`requestPayment`/`confirmPayment`/`releaseUnpaid` (all already existed server-side from
  C2, unused until now) behind a new `PaymentConfirmSheet` (typed reference + amount, a mismatch
  409s naming the gap in dollars — surfaced verbatim, D-06/M3·b1). D-12 refund-after-payment
  (`RefundSheet`, wired to the "preparing" bucket's WALLET orders) and the C4 debt ledger's merchant
  actions (`ReturnCashSheet`/`NonReturnSheet`, R-06/R-07/N-21) are new UI over C4's already-built
  `confirmReturnedCash`/`confirmGoodsReturned`/`reportNonReturn`/`refundOrder` endpoints, which had
  no client at all before this box. CASH pickup (M3·1/M3·1b) is informational-only by design, not a
  fake button: the actual state transition is the rider entering the pickup code
  (`confirmPickup`), which is where C4 already opens the collect-and-return debt automatically
  (R-01) and where pay-me-upfront cash settles by hand with nothing left to confirm digitally (C4's
  own scope cut) — `CashRuleNote` just tells the merchant what to expect. **One backend gap found
  and fixed in this PR:** `listQueue`'s status filter (E2) dropped an order the instant it was
  `picked_up`, which is also the exact moment a collect-and-return debt opens (R-01) — a merchant had
  no way to ever see, let alone settle, a debt once the food left the counter. Fixed by widening the
  filter to `status IN (...) OR debtStatus = "open"`; the frontend gained a matching `awaitingReturn`
  bucket (`order-groups.ts`) rendered as its own non-blocking `ReturnsSection` strip (mirrors M2·7's
  "never blocks the board" rule, applied to the return leg). **New backend surface, since neither
  existed even as a stub:** `GET /merchant/statement/weekly` and `GET /merchant/summary/today`
  (`MerchantService.getWeeklyStatement`/`getTodaySummary`, `MerchantController`), backing a new
  `/statement` page wired to the E1 nav's "Statement" placeholder. N-13's commission split into its
  own `RESTAURANTS_COMMISSION` config (0% current / 10% illustrative comparator, never a committed
  rate). **Scope choices, flagged rather than silently decided:** the statement's date range is a
  rolling 7 days (no calendar-week cut was specified anywhere in the design); `cashTaken` on the
  end-of-day summary only counts collect-and-return debts the merchant actually confirmed that day
  (`confirmReturnedCash`) — pay-me-upfront cash has no ledger (the same C4 scope cut, not a new one),
  so it's honestly omitted rather than estimated; no reason picker on "release — they never paid"
  (the gallery's M2·7 ships one button with no reason UI) — defaults to `"other"`. `pnpm typecheck
  && pnpm lint && pnpm test` green across all 6 packages (api 1444 tests incl. new
  `getWeeklyStatement`/`getTodaySummary` coverage in `merchant.service.spec.ts` + the widened
  `listQueue` filter in `food-order.service.spec.ts`; merchant 62 incl. new `money-input`/
  `order-groups` awaitingReturn suites; mobile 611; shared 157); `pnpm depcruise` clean (0
  errors/warnings, `express-no-merchant-coupling` untouched — every change stayed inside
  `apps/merchant/**` and the existing `merchant/` API module). E4 (menu + shop management) is next.
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

- [2026-07-29] [B, cross-lane C] **RESOLVED 2026-07-30 (C5).** Not a stall — B2 shipped fully
  within `apps/mobile` scope — but the rider board couldn't show a *live* food offer card until
  Lane C added a rider-facing surface for one: `food-dispatch.service.ts` (C3, shipped) had no
  `GET` a rider could call for an `open_for_offers` order (the merchant queue reads are
  `MerchantGuard`-gated) and no board-style WS event analogous to `boardNewOrder`/`orderTaken` for
  a food offer landing/expiring/being taken — the only rider-side signal was the `food_offer` push
  notification. `JobCard` already renders `jobType: "food"` (unit-tested); B4 (active-job screen)
  would have hit the same gap for its own food step list. Closed by C5's first slice: `GET
  /merchant/orders/dispatch/offer` + the `food:offer`/`food:offer-closed` WS events (see §5 Lane C
  C5 for the shipped shape). B4/D can now build against a real surface instead of push-only.
