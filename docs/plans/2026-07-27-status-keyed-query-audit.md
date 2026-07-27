# Status-Keyed Query Audit — merchant blast radius (P0, §0b.7)

**Date:** 2026-07-27 · **Method:** three parallel read-only audit lanes over every file with
status-keyed Order queries (27 candidates), classifications verified against source with
file:line evidence. **Governing decision:** merchant orders travel the existing `OrderStatus`
skeleton + a nullable `merchantPhase` column (plan §0b.1), so every status-keyed query had to
be classified for whether it may act on merchant orders.

**Classes:** **(a)** MUST gain an `orderType` filter (or type-aware branch) before merchant
orders exist · **(b)** SAFE-SHARED (behavior wanted for merchant orders) · **(c)** UNREACHABLE
for merchant orders · **b-COSMETIC** correct mechanics, parcel-voiced presentation.

**Systemic finding:** no status-keyed Order query in the codebase carries any `orderType`
filter today (the only type-stamped site is Express order *creation*,
`orders.service.ts:227`, `orderType: "parcel"`). The live product is safe because merchant
orders don't exist yet; every class-(a) item below is a named task that must land **before**
the first merchant order row (P1/P2), each covered by the golden matrix.

## Class (a) — the fix list (P1/P2 tasks, each behind the golden matrix)

| # | Site | Hazard for a merchant order | Fix shape | Phase |
|---|------|------------------------------|-----------|-------|
| A-1 | `matching/offer-expiry.service.ts:156` (reconcile sweep) → `matching.service.ts:203` (`expireOrder` CAS) | Force-expired on Express 90s auction timing + Express "raise your price" push | `orderType: "parcel"` on the sweep (makes `expireOrder` unreachable-for-merchant) | P1 |
| A-2 | `offers/offers.service.ts:26-33` + `:105-110` (`makeOffer` guards) | Express riders can bid into a merchant order's id | Reject non-parcel in the guard + locked re-read | P1 |
| A-3 | `orders/orders.service.ts:484-489` + `:549` (rider bid boards, incl. raw SQL) | Merchant orders listed on the Express bid board (also leaks ids into A-2) | `orderType = 'parcel'` in both queries | P1 |
| A-4 | `orders/order-lifecycle.service.ts:919-944` (`cloneForRebroadcast`) | Rider-cancelled merchant order re-opened at `open_for_offers` and auto-auctioned to Express riders | Parcel-only guard; merchant rider-cancel routes to P2 lifecycle reassignment handling (the `DispatchStrategy` seam itself is P4) | P2 |
| A-5 | `orders/order-lifecycle.service.ts:133-137` (delivered sweep) + `:951-955` (`completeOrder`) + `:532-546` (`rate()`) | Auto-close debits **Express ride commission** (`:983`) + trips/reliability on merchant orders | Type branch in `completeOrder`: merchant closure books merchant-ledger accrual, not `chargeCommission` | P2 |
| A-6 | `notifications/notifications.service.ts:93-108` + `:126-142` (`STATUS_NOTICES`, expiry copy) | Parcel/auction push copy ("Your parcel was delivered", "raise it and send again") to merchant customers | Type-aware notice tables (merchant copy set) | P2 |
| A-7 | `notifications/notifications-feed.service.ts:171-192, 311-390, 442, 574` (feed synthesis + deep links) | Merchant orders render Express feed copy and deep-link to Express screens | Type-aware feed notices + routes | P2 |
| A-8 | `admin/admin.service.ts:76-78, 96, 132-137` (pilot funnel) | Every merchant order counted as an Express auction broadcast — corrupts `offersPerBroadcast`, `expiryRatePct` | `orderType: "parcel"` in funnel queries | P1 |
| A-9 | `admin/admin.service.ts:109-112` (fares-today KPI) + `admin-customers.service.ts:46-50, 93` (spend metrics) | Sums merchant `agreedFare` (basket semantics TBD) into parcel fare KPIs | Split or filter by type once merchant fare fields land | P1 |
| A-10 | `settlements/settlements.service.ts:90` + `:138` (commission console fallback projection) | Un-charged merchant orders projected at parcel bid-floor commission math | Type filter; merchant commission reads its own ledger | P2 |
| A-11 | `orders/order-lifecycle.transitions.ts:34-280` (verification spec table) | Models a single-type machine — would "verify" merchant orders against Express edges | Add the type/merchantPhase dimension (or parallel merchant table) with the P2 transition service | P2 |

**a-adjacent (money-semantics caveats, decide with P1 schema):** `issues.service.ts:275-277`
(refund cap = parcel fare; merchant refunds may cap at basket), `admin-orders.service.ts:218-262`
(`adjudicateDelivered`) and `:349-387` (`adjustFare`) both compute commission on parcel
bid-floor semantics — must branch if merchant commission basis differs.

## Class (c) — unreachable for merchant orders (verified)

`matching.service.ts:100` + `:124-141` (bid-acceptance chain — enterable only through an
existing Offer row, which A-2/A-3 fixes make impossible for merchant orders),
`matching.service.ts:281-294` (`expandBroadcast` — jobs enqueued only by the Express
create/announce path; status gate no-ops otherwise). Candidate files containing **no**
status-keyed Order queries at all: `riders/rider.service.ts` (rider kyc/account status only),
`health/health.service.ts` (health verdicts), `wallet/wallet-integrity.service.ts` (commission
models only), `orders/lifecycle.controller.ts` (thin routes), `kyc/*`, `admin/admin.shared.ts`
(display maps), `adapters/payments/stub-payment-rail.ts` (payment status).

**Count reconciliation:** 27 candidate *files* → every status-keyed Order site in them
classified: **11 (a)** + 3 a-adjacent money caveats + the (b)/(b-COSMETIC) list above +
the (c) list here; 8 candidate files contained no Order-status queries on inspection.

## Class (b) — shared by construction (verified, no change needed)

Forward rider CAS steps + cancel matrix + undelivered path (`order-lifecycle.service.ts:179-435,
720-747`), delivery-code verify + rotate (`:350-372, 1004-1024` — see OTP below), pickup/drop
proof attach, tracking auth + presence watchdogs (`tracking.service.ts:182-243`), privacy
erasure active-order gate (`privacy.service.ts:147-182` — correct **by accident of shared
statuses**; keep it that way), admin force-cancel, stuck-order detection, phone-reveal windows,
rider standing/liveOrders metrics, wallet-integrity (no Order queries at all).
**b-COSMETIC backlog (P3, non-blocking):** admin timeline labels, TripRow shapes, parcel-voiced
copy on shared surfaces.

## P0 unknowns — closed

**1. Delivery-OTP verify (`order-lifecycle.service.ts:344`, `POST /orders/:orderId/deliver`).**
Guards: row lock, caller = assigned rider, `status === "en_route_dropoff"`, 5-attempt cap,
constant-time hash compare. **No orderType assumption — reusable for merchant orders
unmodified.** Two provenance facts: (i) `otpHash` is written only by Express `selectOffer` and
by `rotateDeliveryCode` (`:1003-1027`), which works for ANY assigned order — the merchant
assignment path mints its code via rotate (or its own writer). (ii) The post-commit
`scheduleAutoClose` chains into `completeOrder` = task A-5; the verify is safe, its closure
needs the type branch.

**2. OTA vs binary (mobile).** Neither mobile workflow has path filters; the split is enforced
by expo-updates **fingerprint runtimeVersion** (`app.config.ts:45`). OTA-able: pure JS/TS —
**the Restaurants tabs are OTA-able**, and even prescription photo capture is OTA-able today
(`expo-image-picker` + camera permission already in the binary, `app.config.ts:84-90`;
**supersedes plan §5's "camera/prescription capture forces a binary"** — that assumed the
permission wasn't provisioned yet; per the repo's reconcile-and-flag rule, the code wins).
Binary-forcing: any native module addition, any `app.config.ts` change (plugins, permissions,
android block — precedents documented at `:79-81`, `:109-111`), SDK upgrades. Consequence for
the plan: **the ~Wk6 binary submission is about having *a* recent binary + store presence, not
about the tabs** — tab rollout itself can ship OTA behind the flags endpoint. One hazard:
`EXPO_PUBLIC_*` values are inlined into OTA bundles and must match the production binary
(`mobile-ota.yml:45-47`).

**3. FloatLedger table shape.** Closed at eng review (§0b.2/§0b.5): own table, purely derived,
`UNIQUE (order_id, type, rider_id)` partial index, rider-row `FOR UPDATE` on reserve.

## P0 exit-gate status

- **OPEN — founder-gated:** the no-op migration apply+rollback rehearsal requires the staging
  tier (`GCP_STAGING_ENABLED`, terraform + DNS per `docs/LAUNCH-EXECUTION-RUNBOOK.md` §8e).
  The synthetic dataset for it is ready (`scripts/seed-synthetic-orders.sql`, staging
  allow-list guarded). Rehearsal runs as soon as staging is armed; P1 migrations do not ship
  before it.
- **Deliberate deferral vs §0b.4:** the golden matrix's **seeded-cohort leg** needs the
  `Merchant` table and ships with the first P1 schema PR, not P0 (P0 bans schema changes).
  **This paragraph is the tracking record**; the golden-matrix spec (lands in the next P0 PR)
  carries a TODO pointing back here and at §0b.4.
