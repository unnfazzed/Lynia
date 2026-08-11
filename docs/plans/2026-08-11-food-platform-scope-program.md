# Food-platform scope program — parity backend blockers #670–#674

Created 2026-08-11 (interactive session, user-directed, branch
`claude/food-platform-scope-073kwj`). This is the canonical spec + live tracker for the five
`BACKEND_GATED` parity blockers the mock-adoption workstream surfaced: the mocks exist, but the app
cannot adopt them by restyling because the underlying capability is not built. This file is **live
state** — each feature PR ticks its box in §5 in the same PR as the work.

Authority chain is unchanged (see `CLAUDE.md` "Pixel parity"): the gallery/kits/tokens are the
source of truth. This program **builds the app up to the mocks** — it does **not** revise mocks
down. No `docs/DESIGN-DEVIATIONS.md` entries are created by this program (all five forks resolved
to *build*, 2026-08-11).

## §1 The fork — decided 2026-08-11

The owner was asked, per hard-blocker, **build it or descope it**. All five resolved to **build**:

| # | Blocker | Decision | Notes locked with the decision |
|---|---|---|---|
| #670 | Payment-prompt push flow (`RC.pay_push/pay_wait/pay_confirmed`) | **BUILD** | Full send→pending→confirmed/declined state machine + order payment state, behind a **pluggable rails adapter** whose provider call is a **simulated/stub integration** for now (internal-testing phase — no live EcoCash/InnBucks/O'mari credentials in the repo). Real provider wiring slots into the adapter later without touching the flow. Default taken under the owner's "trust defaults" grant. |
| #671 | Food rider identity (`RC.track_secured` + food live tracker rider card) | **BUILD** | Buildable as-is. Cheapest, clearly right → shipped first. |
| #672 | Dual food + rider ratings + tag chips (`RC.delivered_rate`) | **BUILD** | Dual scores (food + rider) + tag taxonomy. Tag set = **Hot food · On time · Polite · Right order** (the mock's set). Express single-rating path stays untouched. |
| #673 | Restaurant discovery data — rating / ETA / delivery-fee / dish index | **BUILD** | Data-source mix: **rating computed from order ratings**; **ETA = merchant prep baseline + delivery estimate**; **delivery-fee merchant-set (zone default fallback)**; **dish index from menu items**. Heaviest data-model lift. |
| #674 | Seeded parity instance (`PARITY_MERCHANT_URL` / `PARITY_ADMIN_URL`) | **BUILD** | Infra: seeded authenticated backend so merchant tablet + admin *populated* states render like-for-like offline. Chrome is already aligned; this unblocks the populated-data check. |

Process choices (owner, 2026-08-11): **trust my defaults** on smaller backend sub-decisions (field
names, enum values, endpoint shape) — noted in each PR, no per-task pause; **and** keep this durable
`docs/plans/` program entry.

## §2 Non-duplication

The food-platform *backend* scope is owned by this branch. A parallel session
(`claude/multi-agent-deployment-phases-*`) owns UI *alignment* (restyling already-matched screens)
and touches `packages/design`, mobile screen JSX, and `tools/parity` codegen — **not** `apps/api`
contracts or the DB schema. Coordination rule: this program lands **backend capability + contract**
first; the screen's mock adoption (JSX restyle + `parity-status.mjs` flip from `BACKEND_GATED`)
rides the same feature PR only where it is a thin consumer change, otherwise it is handed to the
alignment lane once the backend is on `main`. Before editing any `tools/parity/*` or shared mobile
component, re-check for an open alignment PR touching the same file.

## §3 Per-feature specs

> Backend anchors (contract file · endpoint · consumer · schema) are injected per feature as its PR
> is scoped from the codebase map. Where an anchor reads `‹map›` it is filled in the feature PR.

### #671 — Food rider identity  ‹first›
- **Goal:** food orders expose the assigned rider's identity (name · plate · vehicle · rating ·
  KYC-verified) so the food live tracker's map-anchored rider card populates from live data.
- **Contract:** add rider-identity fields to the food order read shape (mirror the parcel/Express
  rider-identity shape rather than invent a new one). Source of truth = the assigned rider's
  profile + KYC record; rating = the rider's aggregate score.
- **Consumer:** `LiveTrackingCard` / food live tracker adopts `RC.track_secured` rider block.
- **Guardrail:** flip `RC.track_secured` off `BACKEND_GATED` in `tools/parity/parity-status.mjs`;
  wire the app target in `tools/parity/app-targets.mjs`.
- **Test:** food order with an assigned+KYC'd rider returns the identity block; unassigned returns
  null block (no card). Regression: parcel rider card unchanged.

### #672 — Dual food + rider ratings + tags
- **Goal:** delivered/rate state (`RC.delivered_rate`) collects two scores (food + rider) + tag
  chips + submit footer.
- **Contract:** extend `rateOrder` to accept `{ foodScore, riderScore, tags[] }` for food orders
  while preserving the single-score shape for Express parcels (do **not** mutate the shared
  `RatingCard` tap-to-arm/undo contract used by Express). Tag taxonomy stored as a controlled
  vocabulary: `hot_food`, `on_time`, `polite`, `right_order` (labels: Hot food / On time / Polite /
  Right order).
- **Consumer:** food delivered screen renders dual stars + tag chip row + a "Submit rating" footer
  (mock `RC.delivered_rate`). The mock replaces the shared card's tap-to-arm/undo auto-commit with an
  explicit submit — a structural rebuild with low-connectivity resilience implications, so the
  **backend contract + persistence lands here (this PR); the dual-UI pixel adoption is handed to the
  alignment lane** per §2 (a new food-only `FoodRatingCard`, leaving the shared Express `RatingCard`
  untouched). `rateOrder` already carries `RateRequest`, so the client sends `foodScore`+`tags` with
  no client-fn change once the UI collects them.
- **Test:** food rate persists `foodScore`+`tags` and the rider aggregate uses `score` alone; the
  parcel path persists `foodScore:null`+`tags:[]`; the wire enum rejects an unknown tag.
- **Backend delivered 2026-08-11:** `Rating.foodScore` (nullable) + `Rating.tags` (text[]) columns
  (migration `0047_food_dual_rating`); `RateRequest` gains optional `foodScore` + `tags`
  (`FoodRatingTag` = hot_food/on_time/polite/right_order); `rate()` persists both without touching
  the rider reputation aggregate or its fraud/reliability logic.

### #673 — Restaurant discovery data model  ‹heaviest›
- **Goal:** food home / list / search cards draw rating, ETA, delivery-fee, the Nearest/fee/rating
  filter chips, the "N places · 25–45 min" count line, and search's cross-restaurant **DISHES**
  section — instead of the monogram + "Open now" fallback.
- **Contract (C1 customer read API):**
  - `rating` — computed aggregate from delivered-order food ratings (rolling; null until first N).
  - `etaMinutes` — merchant prep baseline (merchant-set field) + delivery-leg estimate (distance/zone).
  - `deliveryFee` — merchant-set field, zone default fallback.
  - `dishIndex` — searchable index built from menu items, enabling the cross-restaurant DISHES search.
  - list filters: Nearest / fee / rating sort; count line derives from result set + ETA range.
- **Consumer:** browse/list/search cards adopt the mock; remove the "Open now"/monogram fallback
  where real data now exists (per "not drawn ⇒ not rendered" — "Open now" badge is a fallback, not
  a mock element).
- **Test:** discovery endpoint returns rating/ETA/fee for a seeded restaurant; dish search returns
  cross-restaurant matches; sort by each filter; a restaurant with no ratings yet omits the rating
  (card degrades gracefully, still no invented "Open now").
- **Refined split (2026-08-11):** ETA and delivery-fee are **distance-based and the client already
  has both endpoints** (its deliver-to + the merchant `location` on the list item) — the contract
  even documents that checkout computes the fee via `haversineKm + deliveryFeeForDistance`
  (`@lynia/shared`). So the server's genuinely-new discovery datum is the **rating** (a server
  aggregate) plus a **prep baseline** (so the client's ETA has a real prep number); the delivery
  leg + fee stay client-computed. **Deviation from the original "delivery-fee merchant-set" line:**
  the authoritative fee is the distance-based figure charged at placement (`Order.deliveryFee`); a
  merchant-set flat fee would diverge from what's actually billed, so the card shows the same
  distance estimate the customer will pay — no merchant fee field added. (Not a design-mock
  deviation; no ledger entry needed — the mock draws a fee, and it renders, just sourced honestly.)
  Split into **(a)** rating + prep baseline, **(b)** the cross-restaurant dish search index.
- **(a) delivered 2026-08-11:** `Merchant.foodRatingAvg`/`foodRatingCount` (denormalised, maintained
  in `rate()` from `foodScore` like the rider aggregate — no P1-6 weighting, a display average not a
  supply gate) + `Merchant.prepBaselineMinutes` (nullable); migration `0048_restaurant_discovery_rating`;
  `RestaurantListItem` gains `ratingAvg` (null while unrated — no fake "0"), `ratingCount`,
  `prepBaselineMinutes`.
- **(b) delivered 2026-08-11:** `GET /restaurants/search?q=` → `RestaurantSearchResponse` = PLACES
  (`RestaurantListItem[]` by name) + DISHES (`RestaurantSearchDish[]` = dish name/price/photo +
  merchant id/name, across pilot merchants' non-draft menu items via case-insensitive name/description
  match, pilot-bounded up front). No new column/migration — searches `merchant_dishes.name` directly
  (a pg_trgm index is a future scale item, not needed at pilot size); blank/1-char queries return
  empty. Client fn `searchRestaurants` added; DISHES-section pixel adoption is the alignment lane's
  (RC.search is `PENDING`). **#673 backend complete.**

### #670 — Payment-prompt push flow  ‹money path›
- **Goal:** `RC.pay_push` (send prompt) → `RC.pay_wait` (pending) → `RC.pay_confirmed`
  (confirmed) / declined.
- **Contract:** payment-prompt lifecycle on the order: `POST` send-prompt → status `PENDING` →
  webhook/poll → `CONFIRMED` | `DECLINED` | `EXPIRED`. Order gains a `paymentPrompt` sub-state
  distinct from the existing manual-reference path (both coexist; manual stays the fallback).
- **Rails adapter:** a `PaymentRailAdapter` interface (`sendPrompt`, `checkStatus`) with a
  **SimulatedRail** implementation for now (deterministic pending→confirmed for testing; a declined
  path for the declined mock). EcoCash/InnBucks/O'mari become concrete adapters later — **flagged
  for owner confirmation before any real provider call ships.**
- **Idempotency:** send-prompt is idempotent per order (no duplicate live requests); follows the
  DoorDash checkout lesson in `docs/plans/2026-08-01-low-connectivity-program.md` §3.4/3.5
  (idempotent resumable state machine, checkpoint non-idempotent side effects).
- **Consumer:** RC pay screens adopt the three states.
- **Test:** send-prompt → pending → simulated confirm flips order paid; simulated decline → declined
  state; double send-prompt is idempotent; manual-reference path still works.
- **Delivered 2026-08-11 (refined):** reused the **existing** `PaymentRail` seam
  (`apps/api/src/adapters/payments/payment-rail.interface.ts`, `initiate`/`confirm`, default binding
  the inert `StubPaymentRail`) rather than build a new adapter — `FoodOrderService` injects
  `PAYMENT_RAIL`, order id as the idempotency anchor. **Money-path safety:** the default binding stays
  the inert stub (returns `pending`, never fabricates a `confirmed`), so this can never mark an order
  paid on its own; a real EcoCash/InnBucks/O'mari client is a later binding, **flagged for owner
  confirmation before any live call** (the "SimulatedRail that auto-confirms" is a test-only fake, not
  a prod binding). Order gains `paymentPromptStatus/rail/ref/sentAt/resolvedAt` (text, wire-validated
  by `PaymentPromptStatus`/`PaymentPromptRail` — no Prisma enum), migration `0049_order_payment_prompt`
  (5 nullable cols, additive). `sendPaymentPrompt` (idempotent, cash-rejected) + `checkPaymentPrompt`
  (a `confirmed` rail result bridges the ref into `merchantPaymentReference` so the merchant's existing
  own-statement confirm is unchanged). Contract `SendPaymentPromptRequest` + 4 response fields
  (omitted-when-null). Client fns `sendFoodPaymentPrompt`/`checkFoodPaymentPrompt`. `RC.pay_push`/
  `pay_wait`/`pay_confirmed` flipped `BACKEND_GATED → PENDING` (renderable from the new order field
  now — the last three gated states are cleared). Pay-screen pixel adoption is the alignment lane's.
  **Closes #670.**

### #674 — Seeded parity instance
- **Goal:** `PARITY_MERCHANT_URL` / `PARITY_ADMIN_URL` (per `docs/SCREENSHOT-LANE.md`) point at a
  seeded, authenticated backend so merchant tablet (`RM.*`) and admin populated states render
  like-for-like offline instead of `/login` redirects / "API not connected" shells.
- **Approach:** reuse existing seed scripts/fixtures to stand up a deterministic authed instance the
  parity harness can point at; wire the two env vars; flip the `BACKEND_GATED` merchant/admin
  populated entries in `parity-status.mjs` to covered once they render.
- **Test:** parity render of a gated merchant route (e.g. `RM.board`) and an admin populated route
  produces a populated PNG, not a login/error shell.
- **Delivered 2026-08-11 (refined):** after PR #683's recalibration, the merchant/admin screen
  *structure* is already adopted (direct-DOM + structural-snapshot guardrail) — #674 is now purely the
  **verification-lane** capability, not a structure gate, so there is nothing to flip in
  `parity-status.mjs`. The real gap was **data**: `apps/api/prisma/seed.ts` seeded no merchant/food.
  Extended it with a `pilotEnabled` merchant (Sadza Republic) + a Mains menu (3 non-draft dishes, with
  the #673 `foodRatingAvg/Count` + `prepBaselineMinutes` seeded) + **4 food orders across the
  `MerchantPhase` set** (idempotent re-run guard). `serve-web.mjs` already forwards `API_BASE_URL`;
  added an explicit seeded-vs-offline log. Documented the end-to-end seeded-instance runbook in
  `docs/SCREENSHOT-LANE.md` (`pnpm db:seed` → run api → `API_BASE_URL=… serve-web` →
  `PARITY_*_URL`). No contract/schema change; no migration. The populated-PNG render itself runs where
  a Postgres + servers exist (parity CI / ops), which this container can't stand up. **Closes #674.**

### §3.6 Codebase anchors (map 2026-08-11)

Stack: **NestJS 11 + Prisma 7 (Postgres)**; wire contracts are zod schemas in
`packages/shared/src/contracts.ts` (source of truth), enums mirrored manually in
`packages/shared/src/enums.ts` ⇄ `apps/api/prisma/schema.prisma`. Contract snapshot guard
`pnpm contract:check` (`scripts/contract-snapshot.mjs`). Tests: vitest (`pnpm test`),
`pnpm typecheck`, `oxlint`, `pnpm depcruise`.

- **#671:** `Order.riderId` is the *entire* rider payload today (`contracts.ts:989-992`). No
  plate/vehicle column exists on `Rider` anywhere → **new Rider columns** (`schema.prisma` Rider,
  rating already there `:286-287`, KYC `KycStatus :106-113`). Consumer is ready: `LiveTrackingCard`
  already takes `riderIdentity` and renders `RiderMini`; food tracker passes `null` at
  `apps/mobile/src/ui/food/FoodOrderLiveTrackerView.tsx:104`. API join point: `toResponse()` in
  `apps/api/src/merchant/food-order.service.ts`.
- **#672:** `RateRequest {score 1..5, comment?}` (`contracts.ts:150-154`); `Rating` model unique per
  `(order_id, by_profile_id)` (`schema.prisma:715-723`), profile→profile only — **no food-quality
  target and no tags today.** Shared `RatingCard.tsx` (tap-to-arm + 4s undo) used by parcel AND
  food. Endpoints `POST /orders/:orderId/rating` + `/sender-rating`
  (`orders/lifecycle.controller.ts:92-110`). Extend food path only; leave Express single-score.
- **#673:** `RestaurantListItem` (`contracts.ts:810-831`) has name/photos/cuisine/priceLevel/hours/
  location — **no rating/ETA/fee/dish**. "Open now" derived client-side from `hours`
  (`restaurant-hours.ts`); fee is a client estimate (`restaurants-order.ts`), authoritative fee is
  `Order.deliveryFee :588` at placement. Monogram fallback `FoodThumb.tsx`. **No `/search` route,
  no dish index** — both net-new. Service `MerchantService.listRestaurants`
  (`merchant.service.ts:319`, mapper `toListItem :544-560`).
- **#670:** Order payment is manual-reference only — "paid" = `merchantPaymentConfirmedAt != null`
  (`schema.prisma:561-573`), enum `MerchantPaymentMethod {cash,wallet}`; **no pending/paid status
  enum on orders.** BUT the rails seam exists: `PaymentRail` interface
  (`apps/api/src/adapters/payments/payment-rail.interface.ts`, `initiate/confirm/reconcile`,
  `pending|confirmed|failed`) + `StubPaymentRail` default binding, currently wired only for wallet
  top-up (`TopUpStatus {pending,confirmed,declined,expired}` `schema.prisma:155-160`). **Reuse this
  adapter for the order-payment prompt** — do not invent a new seam. Mobile pay views exist:
  `FoodOrderAwaitingPaymentView / FoodPayWaitView / FoodPayFailedView`.
- **#674:** `PARITY_ADMIN_URL || :4311`, `PARITY_MERCHANT_URL || :4312` (`tools/parity/lib/web.mjs`);
  servers launch via `tools/parity/serve-web.mjs` with `API_BASE_URL` **unset** → offline shells;
  merchant gated routes redirect to `/login`. Seed `apps/api/prisma/seed.ts` seeds admin+customer+5
  riders+1 parcel order but **no merchant/restaurant/dish/food order** → extend seed with a
  `pilotEnabled` merchant + menu + food orders across `MerchantPhase`, set `API_BASE_URL`, point the
  two PARITY URLs. Mobile fixtures `tools/parity/mobile/fixtures/*.mjs` are shape references.

## §4 Sequencing & PR strategy

One designated branch (`claude/food-platform-scope-073kwj`); repo policy auto-merges each PR on
green. Therefore **sequential PRs**, restarting the branch from `main` after each merge (per the
"merged PR is finished" protocol). Order by cost/risk, cheapest-and-foundational first:

1. **This plan doc** (durable record) — PR 1.
2. **#671 rider identity** — small contract add, clear win.
3. **#672 dual ratings + tags** — self-contained contract extension.
4. **#673 discovery data** — heaviest; may split into (a) rating/ETA/fee fields, (b) dish index.
5. **#670 payment flow** — state machine + rails adapter (stub); money-path caution.
6. **#674 seeded parity instance** — infra; unblocks merchant/admin populated shots.

Each feature PR: contract + endpoint + test + parity-status flip (where the consumer change is
thin) → `pnpm typecheck && pnpm test` green → ready + auto-merge on green.

## §5 Live status

| # | Feature | State | PR |
|---|---|---|---|
| — | Program plan doc | ✅ landed | #679 |
| #671 | Food rider identity | ✅ merged | #679 |
| #672 | Dual ratings + tags | ✅ merged | #681 |
| #673 | Discovery data model | ✅ merged — (a) #684, (b) #686 | #684 #686 |
| #670 | Payment push flow | ✅ merged | #687 |
| #674 | Seeded parity instance | 🟡 PR open | — |

**Program complete 2026-08-11:** all five BACKEND_GATED blockers built and shipped as sequential
auto-merged PRs (#679 #681 #684 #686 #687 + this). Nothing descoped; no `docs/DESIGN-DEVIATIONS.md`
entries (the app was built up to the mocks). The three RC payment states were the last
`BACKEND_GATED` entries in the gallery — with #670 they are `PENDING` (adoptable), so **no gallery
screen remains backend-gated**. Remaining work is pixel adoption (the alignment lane) + the real
payment-rail client (#670's stub → live EcoCash/InnBucks/O'mari, gated behind owner sign-off).

Legend: ⬜ not started · 🟡 in progress · ✅ merged to `main` (guardrails green).
