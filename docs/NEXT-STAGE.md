# Lynia — Next-Stage Plan: **Ship**

> The execution plan for the stage after Build/Review/Test. Companion to the status snapshot in
> `docs/PILOT-READINESS.md` (2026-06-27): that doc says *where we are*; this one says *what we do next
> and who does it*. Guided by the gstack flow (Think → Plan → Design → Build → Review → Test → **Ship**).
> Branch: `claude/next-dev-stage-planning-dkw52c`.

## Why Ship is the next stage

Build/Review/Test are done: the offer-loop runs phone-to-phone, both app sides are built, 119 API tests
are green, and the eng-plan scorecard (T0–T13) has **no remaining ❌** — every open item is gated on an
external unlock, not on code we can write today (`PILOT-READINESS.md` §scorecard). In gstack terms we have
exhausted Build; the next stage is **Ship**, and Ship has exactly one hard gate: **provisioning Google
Cloud** (the cloud is already *chosen* — GCP, 2026-06-27). Provisioning unblocks `/ship` + release, FCM
push, real object storage, OTEL export, and the production OTP path **in one stroke**.

The catch that shapes this plan: provisioning needs **founder billing/eligibility access** — it is not
codeable. So the work splits into two tracks that run in parallel.

---

## Track F — Founder (provisioning; not codeable) 🔑

The gate. Until this lands, the code-side ship-prep below can be written and merged but not end-to-end
verified against a real cloud.

### GCP provisioning runbook
Target architecture (CONCEPT §10): **Cloud Run + Cloud SQL (PostGIS) + Memorystore (Redis) + Cloud
Storage + Secret Manager**, region **`africa-south1` (Johannesburg)** — lowest latency to Harare.

1. **Create the GCP project + billing.** Apply Google for Startups Cloud credits (Accelerator: Africa for
   the larger tier). Confirm billing clears from Zimbabwe (the one eligibility risk to retire early).
2. **Enable APIs:** Cloud Run, Cloud SQL Admin, Service Networking, Memorystore (Redis), Cloud Storage,
   Secret Manager, Artifact Registry.
3. **Cloud SQL for PostgreSQL 16** with the **PostGIS** extension; private IP via Service Networking.
4. **Memorystore (Redis)** in the same VPC (BullMQ + Socket.IO pub/sub + OTP counters).
5. **Cloud Storage bucket** `lynia-media` (matches `STORAGE_BUCKET` default), uniform access, no public objects.
6. **Secret Manager** entries for `JWT_SIGNING_SECRET`, `DATABASE_URL`, `REDIS_URL`, vendor keys.
7. **Service account** for Cloud Run with: Cloud SQL Client, Secret Manager Secret Accessor, Storage
   Object Admin (scoped to the bucket).
8. **Artifact Registry** repo for the API container image.
9. Hand back: project ID, region confirmation, bucket name, the service-account JSON, and the connection
   string so Track A can wire CI deploy secrets.

### Other founder-gated unlocks (parallel, lower urgency)
- **Greenlight a dev build** (not Expo Go) → enables Phase 3 native map + on-device `/qa`.
- **WhatsApp BSP onboarding** + SMS gateway account → flips OTP off the dev `console` channel.
- **Real Didit ZIM-ID run** → measure the false-reject rate that gates rider onboarding.

---

## Track A — Code-side ship-prep (buildable now, no unlock needed)

The goal: make provisioning **execution, not discovery** — so the moment Track F lands, ship is a config
flip, not a build. Each item is self-contained, CI-verifiable, and maps to a marked seam already in the code.

| # | Task | Seam / file | Verifiable now? |
|---|------|-------------|-----------------|
| A1 | **CI release/deploy job** — build the API container, push to Artifact Registry, deploy to Cloud Run. Secrets via GitHub env (filled from Track F step 9). Gated to `main`. | `.github/workflows/` (new `release.yml`) | ✅ lint/build the workflow; deploy step no-ops without secrets |
| A2 | **GCS signed-URL wiring** — replace the placeholder URL in `createUploadUrl`/`createReadUrl` with the real `@google-cloud/storage` `getSignedUrl({action})` V4 call. | `apps/api/src/adapters/storage/gcs.storage.ts` (TODO marked) | ◐ unit-test signing shape with a fake key; live URL needs the bucket |
| A3 | **Secrets adapter** — keep env-injection as the deploy contract (D7 avoids managed-identity lock-in); document the Secret-Manager→env mapping for Cloud Run. | `apps/api/src/adapters/secrets/` | ✅ |
| A4 | **FCM push wiring** — `firebase-admin` behind the existing `fcm.push.ts` stub; mobile consumes the feed. | `apps/api/src/adapters/push/fcm.push.ts` | ◐ unit-test payload build; live send needs FCM project |
| A5 | **OTEL export** — NodeSDK + OTLP exporter pointed at `OTEL_EXPORTER_OTLP_ENDPOINT` (T9). | `apps/api/src/observability/otel.ts` | ◐ exporter init testable; traces need a collector |

> **Build order for Track A:** A1 first (it's the spine and pure-CI), then A2 (object storage is the
> first real upload dependency — rider KYC selfie / item photo), then A4/A5 once their endpoints exist.

---

## Track B — Pre-pilot hardening (buildable now, fully CI-verifiable) 🛡️

Zero external dependency, runs anytime — sensible to do **while Track F provisioning is arranged**, since
none of it is blocked. These are the consciously-deferred items from the post-build review (`BACKLOG.md`).

1. **Gate/remove the `x-user-id` dev auth fallback** (`apps/api/src/common/current-user.decorator.ts`).
   Latent (not exploitable on JWT-guarded routes) but it should be non-production-only or gone. Touches
   every controller's auth assumption — do it as its own careful pass **with the auth tests in view**.
   *Highest-value item here: it's a real pre-pilot security tightening and fully testable.*
2. **`onAccent` design token** — replace hardcoded `"#fff"` on-accent text with `color.onAccent` in
   `packages/shared/src/design-tokens.ts`; ripple to the call sites.
3. **Skeleton loaders over spinners** — a small reusable `Skeleton`; swap the bare `ActivityIndicator`
   loading branches on the list/board/stepper screens (DESIGN.md data-light spec).
4. **Surface contract-only fields** — `note`/`itemPhotoUrl` on create, `comment` on rating, `reason` on
   cancel exist in the contracts with no UI (item photo pairs with A2 object storage).

Each lands behind `/review` + `/codex` and the existing test gate, exactly as the prior build work did.

---

## Recommended sequence

1. **Now, in parallel:**
   - *Founder* kicks off Track F step 1–2 (project + billing — retire the Zimbabwe eligibility risk first).
   - *Claude* starts Track B #1 (the `x-user-id` hardening) and Track A1 (CI release job scaffold) — both
     are CI-verifiable without any cloud and keep momentum while provisioning clears.
2. **When Track F hands back project/bucket/SA (step 9):** wire A2 (GCS signed URLs) and the A1 deploy
   secrets; run a first real Cloud Run deploy → this is the literal `/ship`.
3. **Then:** A4 (FCM) + A5 (OTEL), production OTP path (WhatsApp BSP), and the real Didit KYC run.
4. **Greenlight the dev build** → Phase 3 native map + tap-to-pin → on-device `/qa` → release.

## Exit criteria for the Ship stage
- [ ] GCP project provisioned; first Cloud Run deploy green from CI (`/ship`).
- [ ] Object storage live: a rider KYC selfie / item photo round-trips through a real signed URL.
- [ ] Production OTP path live (off the `console` channel).
- [ ] `x-user-id` dev fallback gated to non-production.
- [ ] OTEL traces landing in a collector; FCM push reaching a device.
- [ ] Real Didit ZIM-ID run completed; false-reject rate measured.

## gstack skills this stage uses
`/ship` (CI + release — the headline), `/review` + `/codex` (each Track A/B PR), `/qa` (post dev-build,
on-device), `/design-review` (reconcile the §5c stepper + skeletons once Phase 3 lands).

---

**Bottom line:** the next stage is **Ship**, gated on **founder-side GCP provisioning**. While that clears,
the highest-value codeable work is **Track A1 (CI release job)** and **Track B #1 (`x-user-id` hardening)** —
both move the pilot forward today without waiting on any external unlock.
