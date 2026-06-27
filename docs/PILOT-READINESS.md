# Lynia — Pilot-Readiness Checkpoint

> Current-state status for a CEO/eng review. **Supersedes the verdict in
> `docs/CEO-REVIEW-CHECKPOINT.md`** (2026-06-26), which predates the build work below — its top findings
> ("core loop can't complete a delivery", "mobile not recommended next") are now **closed**.
> Date: 2026-06-27. Branch: `claude/ceo-review-prep-975vdb`.

## Verdict (read this first)

The product is now **functionally complete and end-to-end demoable in code**: a full delivery runs
phone-to-phone — customer posts → riders bid → customer selects → rider drives the lifecycle → OTP
hand-off → both reach completion → rate. Both app sides are built and the backend lifecycle is whole and
tested. **What remains is no longer buildable-now engineering.** The **cloud is now chosen — Google
Cloud** (2026-06-27; rationale in Decision gates), which closes the long-open T0 *pick-a-cloud* decision;
what's left on that front is **provisioning execution**, not a choice. The other external unlock is a
**device build** (Phase 3 / `/qa`). The revenue model (§6) is also **decided** — rider commission, 0% for
~6–8 months, infrastructure built later. Everything that does *not* depend on those unlocks is done.

This flips the prior checkpoint: the two things it gated on — the **delivery-lifecycle hole** and **no
visible surface** — are both resolved, and the **revenue decision** it flagged is now made.

---

## What changed since the 2026-06-26 checkpoint

The prior checkpoint's blocking finding was that the loop stopped at `assigned`. Since then, merged to
`main` (CI-gated throughout):

- **Delivery lifecycle completed** — status progression `assigned → confirmed → en_route_pickup →
  picked_up → en_route_dropoff → delivered → completed`, the **delivery-OTP hand-off** (writes/verifies
  `otp_hash`, 5-attempt lockout, FOR UPDATE row-lock), **rating** (T3), and **cancellation / no-show
  cooldown** (T4). BullMQ auto-close + a DB reconciler close stale trips.
- **Mobile app, both sides** — customer journey (auth → create → offers → §5c tracking → rate) and rider
  role (KYC → online board → bid → drive → OTP) on Expo + the typed contract-driven client.
- **Two first-principles eng reviews** with P0 fixes — auth `x-user-id` spoof holes guarded, a
  concurrent-refresh race fixed, a pre-assignment PII leak sealed, the rider online-invariant enforced.
- **Design consultation + mockups** — `docs/DESIGN.md` extended to the full two-sided journey;
  `docs/design/` all-flows PNG boards.
- **DT12/DT10/DT11 flows** — the §5c 7-step stepper, empty-states, profile, trip **history**, full
  `/auth/me`, the **not-verified rider gate**, and a **payment-agnostic earnings ledger**.
- **Comprehensive post-build review** — independent eng + adversarial + static-design passes; fixed a
  systemic error-state-honesty P1 and the rider-gate staleness. Backend confirmed clean (history/`me`
  authz + PII).
- **DT4 offer best-match sort** — `rankOffers` (`@lynia/shared`, unit-tested) + a re-sort selector and a
  RECOMMENDED marker (design D-d). The **last buildable-now code gap — now closed.**
- **Revenue model decided (§6)** — rider commission, 0% for ~6–8 months, infra later (see Decision gates).
- **Test count** 21 → 72 → 112 → **119** API tests; mobile typecheck in the CI gate.

## Updated eng-plan scorecard (T0–T13)

| ID | Task | Was (06-26) | Now (06-27) |
|----|------|-------------|-------------|
| T0 | Vendor + billing spikes (cloud, WhatsApp BSP, real ZIM-ID KYC) | ⏳ pending | ◐ **cloud chosen: GCP** — GCP project provisioning + billing, WhatsApp BSP, real ZIM-ID KYC remain (external) |
| T1 | Atomic offer-selection (guarded CAS + liveness) | ✅ proven | ✅ proven |
| T2 | Server-side offer-expiry (BullMQ) | ✅ | ✅ |
| T3 | Order auto-close on rating deadlock | ❌ not built | ✅ **done** (rating + auto-close + reconciler) |
| T4 | No-show / cancellation reputation + cooldown | ❌ not built | ✅ **done** |
| T5 | API authorization (JWT-claim scoping) | ✅ | ✅ **hardened** (spoof holes closed) |
| T6 | OTP auth (mint → send → verify → JWT) | ◐ partial | ◐ partial — **WhatsApp/SMS still stubbed (external)** |
| T7 | KYC + manual-review backstop | ✅ | ✅ |
| T8 | Error/rescue for external calls | ◐ partial | ◐ partial |
| T9 | Metrics instrumentation | ◐ partial | ◐ partial — **OTEL needs a collector (external)** |
| T10 | PostGIS nearby-rider + indexes | ✅ proven | ✅ proven (+ Tier-2 geo int test) |
| T11 | GPS-drop / permission-revoked handling | ❌ not built | ◐ **partial** (stream gating + stale handling; full degradation device-gated) |
| T12 | Empty-state UX (no offers / no riders) | ❌ not built | ✅ **done** (`EmptyState`, gates, expired/no-orders) |
| T13 | Cloud portability adapters + exit-test | ◐ partial | ◐ partial — **GCP now primary** (`CLOUD_PROVIDER=gcp`); stand-up on GCP is provisioning; Azure adapter kept green in CI as the portability proof |

Every ❌ from the prior checkpoint is now ✅. Every remaining ◐/⏳ is gated on an external unlock, not on
more code we can write today.

## Decision gates

| Gate | Status / unlocks | Type |
|------|------------------|------|
| **Cloud provider** — T0 | ✅ **decided (2026-06-27) — Google Cloud.** Reachable from Zimbabwe with no country-level block; nearest region **Johannesburg `africa-south1`** (lowest latency to Harare); **Google Maps** is already a dependency; Google for Startups Cloud credits available (Accelerator: Africa for the larger tier). Default is now `CLOUD_PROVIDER=gcp`; the Azure adapter stays as the portability proof. **Unblocks** `/ship` + release, FCM push, real object storage/signed URLs, OTEL export, production OTP path — all now **provisioning execution**, not a choice. | Vendor decision — **closed** |
| **Greenlight a dev build** (not Expo Go) | ⏳ **open** → Phase 3 native map + tap-to-pin, `/qa` device pass, on-device verification of the stepper/earnings/gate | Go-ahead + device |
| **Revenue model** (§6) | ✅ **decided (2026-06-27)** — rider commission (% of agreed fare), **0% for ~6–8 months**, settlement/commission **infra built later**. No pilot blocker; the commission build is parked in BACKLOG with a ~6–8-month trigger. | Product/founder decision |

One open gate remains (**dev build**); the cloud decision is **closed (Google Cloud)** and its follow-on
work is provisioning execution. The work behind each is parked in `docs/BACKLOG.md` with its trigger.

## Ship / cloud-provisioning checklist (cloud chosen — GCP provisioning)

Pre-staged so T0 → ship is execution, not discovery. Each maps to a `BACKLOG.md` item with its seam
already in place:

- [x] **Cloud chosen** — **Google Cloud** (2026-06-27). _Remaining:_ provision the GCP project (Cloud Run +
      Cloud SQL + Memorystore + Cloud Storage) and clear billing/eligibility from Zimbabwe — the T0 execution step.
- [ ] **Object storage adapter** wired to real Blob/GCS + signed URLs (stubs in `apps/api/src/adapters/storage/`).
- [ ] **Secrets** moved to the cloud secret store (adapter seam exists).
- [ ] **FCM push** — `firebase-admin` behind the existing stub; mobile consumes pushes (unblocks the
      notifications center).
- [ ] **Production OTP** — WhatsApp BSP onboarding + SMS gateway behind the `otp-sender.ts` seam (console
      is dev-only today).
- [ ] **HTTPS for device builds** — Android 9+/iOS ATS block cleartext; required for a standalone build.
- [ ] **OpenTelemetry** — NodeSDK + OTLP exporter pointed at the collector endpoint (T9).
- [ ] **Real ZIM-ID KYC run** through Didit (measure the false-reject rate — gates rider onboarding).
- [ ] **Portability check** (T13) — GCP is now the primary deploy target; keep the Azure adapter green in CI
      as the portability proof (the second-cloud stand-up is the reverse direction now).
- [ ] **CI release job** (`/ship`) — the two CI gates are green today; add the deploy/release step.

## Recommended sequence

1. ✅ **Revenue model (§6) — decided** (rider commission, 0% for ~6–8 months, infra later). The economics
   story now exists; no infra to build for the pilot.
2. ✅ **Cloud picked — Google Cloud (2026-06-27).** _Now:_ provision the GCP project (Cloud Run + Cloud SQL
   + Memorystore + Cloud Storage) and clear billing/eligibility from Zimbabwe — this unblocks ship, push,
   storage, OTEL, and the production OTP path in one stroke; run the checklist above. *The cheapest
   high-leverage move.*
3. **Greenlight a dev build** — then Phase 3 native map + `/qa` on a real device, and finally `/ship`.
4. Mobile profile-edit + notifications fold in once the cloud lands (they need a profile-update endpoint
   and the FCM feed respectively).
5. **~6–8 months out:** build the commission/settlement infrastructure when monetization begins (BACKLOG).

**Bottom line:** the engineering spine and both app surfaces are built and CI-green; the product can
complete a delivery end to end in code, and the revenue model is decided. The path to a real pilot now
runs through **provisioning the chosen cloud (Google Cloud) and a device build**, not through more feature code.
