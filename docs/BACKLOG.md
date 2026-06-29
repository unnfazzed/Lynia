# Backlog — deferred work

Items intentionally scoped out of the current build, to be actioned in the future. Each notes **why**
it was deferred and the **trigger** that should pull it into scope. Kept here so nothing is lost between
sprints. (Order within a section is rough priority, not a commitment.)

> Convention: when an item is actioned, move it out of this file and into the change's PR description.

---

## Pricing engine

The pilot fare model (`packages/shared/src/pricing.ts`, wired in `apps/api/src/orders/orders.service.ts`)
is deliberately simple: a flat `base + perKm·distance` over **straight-line** distance, floored at a minimum.

- **Road distance instead of haversine.** Today distance is great-circle (`haversineKm`), a fair proxy but
  it ignores rivers, one-ways, and bridges. _Trigger:_ a routing/Directions provider chosen at the pricing
  T0 spike. _Shape:_ swap the distance source feeding `quoteFare`; `suggestFare` is unchanged.
- **Dynamic multipliers** — surge (demand/supply), time-of-day, traffic, and vehicle/parcel class. Today the
  per-km rate is flat. _Trigger:_ enough live trip data to calibrate without gouging. _Shape:_ additive
  multiplier(s) inside `suggestFare`.
- **Fare cap / sanity bounds.** No upper bound on a suggested fare today (the $150 pilot cap is on
  `declaredValue`, the item's worth — not the fare). _Trigger:_ first real long-distance order; decide a
  policy before it ships.
- **Per-corridor / per-city rates.** `FARE` constants are single-region (Harare USD). _Trigger:_ expansion
  beyond the pilot corridor. _Shape:_ make `FARE` lookup-by-region.

## Revenue infrastructure (commission) — §6 decided, build deferred

The revenue model is **decided** (CONCEPT §6, 2026-06-27): **rider commission** — Lynia takes a % of the
agreed fare the rider is paid (inDrive-style), **0% for the first ~6–8 months**. No revenue infrastructure
is built yet, by design.

- **Commission capture + settlement.** Compute the take-rate against `agreed_fare`, record it, and settle
  rider ↔ platform. _Trigger:_ ~6–8 months post-launch, when monetization begins. The data model is already
  **payment-agnostic** (CONCEPT §5b) — this adds a commission/settlement layer, not a rewrite.
- **Earnings settlement UI.** The rider earnings ledger (`apps/mobile/app/earnings/index.tsx`) is built
  payment-agnostic (a work log, not a balance); it gains a **commission line + settlement state** when the
  above lands. _Trigger:_ same.
- **Take-rate calibration.** Set the commission % (and validate the base + per-km suggested-price guide) on
  real corridor data before charging. _Trigger:_ enough pilot trips to calibrate without gouging.

## Messaging / OTP delivery

- **Real WhatsApp BSP + SMS gateway.** OTP currently ships via the `console` channel (dev) with WhatsApp/SMS
  senders stubbed (`apps/api/src/auth/otp-sender.ts`). _Trigger:_ WhatsApp BSP onboarding decision /
  provider selected. The send-adapter seam is already in place — this is wiring, not redesign.
- **Canonicalize the phone identity (E.164).** The raw phone string is the OTP-store key, rate-limit key,
  `profile.upsert` key, and the QA allowlist match — with no normalization (`auth.controller.ts` only
  length-validates). So `+263772…`, `0772…`, `263772…` are different accounts with separate OTP/rate
  buckets (account fragmentation + a per-format rate-limit-bypass). _Trigger:_ before real signups at
  scale. _Shape:_ a `normalizePhone()` to E.164 applied once at the controller boundary; the QA allowlist
  already strips cosmetic formatting for its compare. (Flagged in the QA test-mode security review.)

## Cloud / infrastructure (GCP — ✅ provisioned + deployed 2026-06-29)

> **Cloud chosen: Google Cloud** (2026-06-27, CONCEPT §10 / PILOT-READINESS Decision gates), **provisioned
> and deployed 2026-06-29** (project `lynia-500911`, Terraform `infra/terraform/`, live at
> `https://lyniago.lyniafinance.com`). Default is `CLOUD_PROVIDER=gcp` (Cloud Run + Cloud SQL + Memorystore
> + Cloud Storage + Secret Manager); the Azure adapter is retained as the D7 portability proof. The
> provisioning gate is **closed** — what remains below is collector/feature wiring, not a cloud stand-up.
> Deferred infra hardening (drop Cloud SQL public IP, Redis `STANDARD_HA`, Cloud SQL `REGIONAL`, tighten
> bucket CORS) is tracked in `infra/terraform/README.md` and triaged in `docs/ENG-REVIEW.md` §3 (Ship).

- ✅ **GCS object-storage SDK — DONE (A2).** Real Cloud Storage uploads + V4 signed-URL generation behind the
  storage adapter (`apps/api/src/adapters/storage/gcs.storage.ts`), ADC `signBlob` (no private key), offline
  V4-signing test. _Remaining:_ first live round-trip (rider KYC selfie / item photo upload). The Azure Blob
  impl stays as the portability fallback.
- ✅ **FCM push notifications — adapter DONE (A4).** `firebase-admin` (v14 modular API) is wired behind the
  `PushAdapter` seam (`apps/api/src/adapters/push/fcm.push.ts`), selected by `PUSH_PROVIDER=fcm`, ADC creds
  on Cloud Run (no key in env), payload mapper unit-tested. _Remaining:_ device-token registration + calling
  `PUSH.send` at lifecycle transitions, and a live send (needs the Firebase project + messaging role).
- ✅ **OpenTelemetry wiring — DONE (A5).** NodeSDK + OTLP/HTTP trace exporter + http instrumentation
  (`apps/api/src/observability/otel.ts`), lazy-loaded and a no-op until `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
  _Remaining:_ point it at a collector and (optionally) add pg/redis instrumentation.

## Product surface

- ✅ **Mobile app flows (Phase 1 + Phase 2) — DONE.** Both sides shipped: customer (auth → create → offers
  → §5c tracking → rate) and rider (KYC → online board → bid → drive → OTP), plus history, profile, and a
  payment-agnostic earnings ledger. _Remaining mobile work is **Phase 3** (native map + tap-to-pin) — see
  the "Mobile app" section below. (The DT4 offer best-match sort has since shipped.)_
- **Admin ops tooling (partial).** Ops tooling has landed, but the dashboard still lacks a **KYC review
  queue** (approve/decline via `POST /admin/riders/:id/kyc`), rider management, order drill-down, and a
  live-tracking view. _Trigger:_ first real Didit riders onboarding (the manual KYC backstop needs a UI).

## Delivery lifecycle

- **Two-sided rating (rider → customer).** The lifecycle ships customer → rider only (rider reputation
  drives selection). A rider rating the customer would catch bad-recipient behaviour. _Trigger:_ enough
  trips to make customer reputation meaningful; pairs with T4 no-show data.
- **Out-of-band delivery-code delivery.** The recipient's handover code is shown to the customer once (at
  selection) and relayed by them today. _Trigger:_ SMS/WhatsApp wired (currently deferred) — then send the
  code straight to the dropoff `contactPhone`.

## Mobile app

- ✅ **HTTPS for device builds — DONE.** The API is served over HTTPS via an external load balancer +
  managed cert at `https://lyniago.lyniafinance.com`; the mobile app is cut over to HTTPS/WSS
  (`apps/mobile/app.json`). Standalone/EAS builds are no longer blocked by Android 9+/iOS ATS cleartext rules.
- **Native map + tap-to-pin (Phase 3).** Pickup/dropoff are typed coordinates today; a `react-native-maps`
  picker needs a dev build (not Expo Go). _Trigger:_ device-testing phase.
- **Reanimated/gesture-handler + FlatList.** Add the canonical Expo Router native deps when Phase 2 nav
  grows (not required by the current native `<Stack>`); switch the offers list to `FlatList` if offer
  counts grow. _Trigger:_ Phase 2 build on a device.
- **a11y + background socket.** `hitSlop`/labels on all touch targets; close the tracking socket on
  `AppState` background to save battery/data on constrained devices. _Trigger:_ device QA pass.

## Testing

- ✅ **Tier-2 geo integration test — DONE.** The raw PostGIS `nearbyRiders` / `updateRiderLocation`
  queries (`apps/api/src/tracking/tracking.service.ts`) are now covered by the `test:int` CI job against
  the PostGIS service. (API suite is at 112 tests.)

## Post-build review findings (2026-06-27, deferred items)

From the comprehensive eng + static-design review. The P1 error-state honesty and the rider-gate staleness
were fixed in the same pass; these are the consciously-deferred remainder.

- ✅ **Skeleton loaders over spinners — DONE (generic + row).** `Skeleton`/`SkeletonCard`/`SkeletonList`
  and a row-shaped `SkeletonRow`/`SkeletonRows` shipped in the mobile UI kit; the six content screens use
  them instead of `ActivityIndicator`. _Remaining (carried to `/qa`):_ per-screen fidelity — a
  `SkeletonStepper` for the §5c tracking/job screens and a tall accent summary skeleton for earnings, so
  the placeholder mirrors those shapes with no reflow. _Trigger:_ the on-device `/qa` polish pass (reflow
  is only judgeable on a real device).
- **Harden the `x-user-id` dev fallback** in `apps/api/src/common/current-user.decorator.ts`. Latent (not
  exploitable on the JWT-guarded routes), but it should be gated to non-production or removed. _Trigger:_
  touches every controller's auth assumption — do it as its own careful pass with the auth tests in view.
- **`onAccent` design token.** White-on-accent text is a hardcoded `"#fff"` in several places; the shared
  tokens have no inverse/on-accent colour. _Trigger:_ add `color.onAccent` to `design-tokens.ts` when next
  touching the shared palette.
- **Surface contract-only fields.** `note`/`itemPhotoUrl` on create, `comment` on rating, `reason` on
  cancel exist in the contracts with no UI (also in the DESIGN.md drift list). _Trigger:_ per-flow decision;
  item photo also needs cloud object storage (T0).
- **Rider pickup-photo step.** §5c rider step 4 is "Mark collected (+ pickup photo)"; the built advance has
  no capture. _Trigger:_ pairs with object storage (T0) + the dev build.
- **Pair the §5c stepper tables.** The built `Stepper` renders a 7th `completed` step for the rider view; the
  DESIGN.md §5c rider table stops at 6. _Trigger:_ trim the rider view to 6 or add the row to the spec —
  reconcile in the post-Phase-3 `/design-review`.
