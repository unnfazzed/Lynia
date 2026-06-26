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

## Messaging / OTP delivery

- **Real WhatsApp BSP + SMS gateway.** OTP currently ships via the `console` channel (dev) with WhatsApp/SMS
  senders stubbed (`apps/api/src/auth/otp-sender.ts`). _Trigger:_ WhatsApp BSP onboarding decision /
  provider selected. The send-adapter seam is already in place — this is wiring, not redesign.

## Cloud / infrastructure (Azure-gated)

- **Azure/GCP cloud adapter SDKs** — real Blob / GCS object storage and signed-URL generation (storage
  adapter stubs in `apps/api/src/adapters/storage/`). _Trigger:_ cloud chosen + provisioned (blocked on the
  CEO-review T0 billing/eligibility spikes).
- **FCM push notifications** — `firebase-admin` integration (currently a stub). _Trigger:_ cloud provisioned
  + mobile app consuming pushes.
- **OpenTelemetry wiring** — NodeSDK + OTLP exporter (`TODO(lane D+)`); the API exposes OTEL config but does
  not yet export traces. _Trigger:_ a collector endpoint exists to point at.

## Product surface

- **Mobile app flows (phase 1+).** The Expo app is a static map-home shell; the backend it talks to is
  feature-complete. Phase 1 = navigation + API client + token storage + OTP login + customer
  create-order → see offers → accept. Later = rider go-online/nearby/offer + live tracking. _Trigger:_
  prioritized for CEO-review demo or pilot.
- **Admin ops tooling.** The dashboard is a read-only overview. Missing: KYC review queue (approve/decline
  via the existing `POST /admin/riders/:id/kyc`), rider management, order drill-down, live tracking view.
  _Trigger:_ first real Didit riders onboarding (the manual KYC backstop needs a UI).

## Testing

- **Tier-2 geo integration test.** Raw PostGIS queries `nearbyRiders` / `updateRiderLocation`
  (`apps/api/src/tracking/tracking.service.ts`) are not unit-testable (raw SQL) and currently uncovered.
  _Trigger:_ closes the last coverage gap from the test-hardening lane; runs in the existing `test:int`
  CI job against the PostGIS service — small, self-contained.
