# Lynia — Pilot-Readiness Checkpoint

> Current-state status for a CEO/eng review. **Supersedes the verdict in the build-checkpoint review**
> (`docs/CEO-REVIEW.md` §2, 2026-06-26), which predates the build work below — its top findings
> ("core loop can't complete a delivery", "mobile not recommended next") are now **closed**.
> Date: 2026-06-27, **updated 2026-06-29**. Branch: `claude/ceo-review-prep-975vdb`.

## 🟢 Update — 2026-06-29: the cloud gate is closed; the API is live

Since the 06-27 snapshot below, the **Ship stage executed end to end.** The open gate at the time —
GCP provisioning — is now **done**, and the API is **live and CI-deployed**:

- **GCP provisioned** (project `lynia-500911`) entirely as Terraform (`infra/terraform/`): Cloud Run +
  Cloud SQL (PostGIS) + Memorystore (Redis) + Cloud Storage + Secret Manager in `africa-south1`. CI auth
  is **keyless** via Workload Identity Federation (no SA key).
- **API live behind an external HTTPS load balancer** (global ALB + managed cert) at a custom domain,
  **`https://lyniago.lyniafinance.com`** → `{"status":"ok","db":true,"redis":true}`. Cloud Run ingress is
  **locked to the LB** (`internal-and-cloud-load-balancing`); the WS backend timeout is raised to 3600s so
  tracking sockets survive a full delivery.
- **`/ship` happened** — `.github/workflows/release.yml` builds the API image → Artifact Registry, runs
  `prisma migrate deploy` via the Cloud SQL Auth Proxy, and deploys to Cloud Run on push to `main`
  (docs-only changes skipped). Track A shipped: A1 release job, A2 GCS V4 signed URLs, A4 FCM adapter,
  A5 OTEL exporter.
- **Mobile cut over to the live API** — REST + Socket.IO target the LB over HTTPS/WSS.
- **Full flow is testable now, vendor-free** — an opt-in, fail-safe **QA test mode** lets the whole
  customer + rider journey run against the live deployment without the WhatsApp/Didit vendors.

**What's left is no longer a code gate.** The remaining work is **founder/vendor wiring** — WhatsApp BSP
(production OTP), a real Didit ZIM-ID KYC run, and a Firebase project (live FCM send) — each a
*create account → set secret → flip flag* step (an account, a key, an org decision — not code), plus the
**dev build** for on-device `/qa`. The 06-27 snapshot below is preserved for history; read the gate/checklist
sections through this update.

---

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
- **Design consultation** — `docs/DESIGN.md` extended to the full two-sided journey
  (reviewed in `docs/DESIGN-REVIEW.md`).
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
| **Revenue model** (§6) | ✅ **decided (2026-06-27)** — rider commission (% of agreed fare), **0% for ~6–8 months**, settlement/commission **infra built later** (CONCEPT §6). No pilot blocker; the commission build is deferred with a ~6–8-month trigger. | Product/founder decision |

As of the 06-29 update, the cloud decision is not just **closed (Google Cloud)** — it is **executed**: the
project is provisioned and the API is live. The remaining gates are the **dev build** and the
**founder/vendor wiring** (WhatsApp BSP, Didit, Firebase — each an account/key/org decision, not code),
itemised in the Ship checklist below.

## Ship / cloud-provisioning checklist (✅ provisioned + deployed — 2026-06-29)

Pre-staged so T0 → ship was execution, not discovery. Now mostly done; the open items are vendor/founder
wiring, not code:

- [x] **Cloud chosen + provisioned** — **Google Cloud** (decided 06-27, provisioned 06-29). GCP project
      `lynia-500911` stood up as Terraform (`infra/terraform/`): Cloud Run + Cloud SQL (PostGIS) + Memorystore
      + Cloud Storage + Secret Manager in `africa-south1`. Billing/eligibility from Zimbabwe cleared.
- [x] **Object storage adapter** wired to real GCS + V4 signed URLs (A2; `apps/api/src/adapters/storage/gcs.storage.ts`,
      ADC `signBlob` — no private key). _Live round-trip needs the first real upload (rider KYC / item photo)._
- [x] **Secrets** in Secret Manager (`DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_SECRET`), injected at deploy via `--set-secrets`.
- [x] **FCM push adapter** (A4) — `firebase-admin` behind the seam, ADC creds, payload mapper unit-tested.
      _Remaining (founder + feature):_ a Firebase project + device-token registration / send call-sites.
- [ ] **Production OTP** — WhatsApp BSP onboarding + SMS gateway behind the `otp-sender.ts` seam (console
      is dev-only today). **Founder action** — set up a WhatsApp BSP account, then `OTP_CHANNEL=whatsapp`.
- [x] **HTTPS for device builds** — external HTTPS load balancer + managed cert at `lyniago.lyniafinance.com`;
      mobile cut over to HTTPS/WSS.
- [x] **OpenTelemetry exporter** (A5) — NodeSDK + OTLP/HTTP, no-op until `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
      _Remaining:_ point it at a collector (deferred by CEO review — pilot volume doesn't need it yet).
- [ ] **Real ZIM-ID KYC run** through Didit (measure the false-reject rate — gates rider onboarding).
      **Founder action** — create a Didit account + key. (The integration is built; `KYC_PROVIDER=didit`.)
- [x] **Portability check** (T13) — GCP is the primary deploy target; the Azure adapter stays green in CI as
      the D7 portability proof.
- [x] **CI release job** (`/ship`) — `.github/workflows/release.yml` builds → migrates → deploys to Cloud Run
      on push to `main`. Keyless via Workload Identity Federation.

## Recommended sequence

1. ✅ **Revenue model (§6) — decided** (rider commission, 0% for ~6–8 months, infra later). The economics
   story now exists; no infra to build for the pilot.
2. ✅ **Cloud picked + provisioned + deployed — Google Cloud (chosen 06-27, live 06-29).** The API is up at
   `https://lyniago.lyniafinance.com` and CI-deployed; ship, storage, OTEL, and push adapters are all wired.
   *The cheapest high-leverage move — now banked.*
3. **Founder/vendor wiring (start now, long lead time):** WhatsApp BSP (OTP) + a real Didit ZIM-ID run, in
   parallel — each a *create account → set secret → flip flag* step. The full flow is exercisable today
   vendor-free via the opt-in QA test mode.
4. **Greenlight a dev build** — then Phase 3 native map + `/qa` on a real device.
5. Mobile profile-edit + notifications + a Firebase project fold in next (profile-update endpoint, device-token
   registration, live FCM send).
6. **~6–8 months out:** build the commission/settlement infrastructure when monetization begins (CONCEPT §6).

**Bottom line (06-29):** the engineering spine and both app surfaces are built and CI-green, **the API is
live on GCP**, and the product can complete a delivery end to end against the live deployment (vendor-free
via QA mode). The revenue model is decided. The path to a real pilot now runs through **founder/vendor
wiring (WhatsApp BSP, Didit) and a device build**, not through more feature code or any cloud gate.
