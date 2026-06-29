# Lynia — Next-Stage Plan: **Ship**

> The execution plan for the stage after Build/Review/Test. Companion to the status snapshot in
> `docs/PILOT-READINESS.md`: that doc says *where we are*; this one says *what we do next
> and who does it*. Guided by the gstack flow (Think → Plan → Design → Build → Review → Test → **Ship**).
> Branch: `claude/next-dev-stage-planning-dkw52c`. Date: 2026-06-27, **updated 2026-06-29**.

## 🟢 Update — 2026-06-29: Ship executed

This plan has now run. **Track F's gate cleared and Track A shipped:** the GCP project (`lynia-500911`) is
provisioned via `infra/terraform/` (keyless CI auth via Workload Identity Federation), and the API is **live
and CI-deployed** behind an external HTTPS load balancer at **`https://lyniago.lyniafinance.com`**. The
release workflow builds → migrates → deploys to Cloud Run on every push to `main`. Track A (A1 release job,
A2 GCS V4 signed URLs, A4 FCM adapter, A5 OTEL exporter) and Track B's hardening items (#1–#3) are merged.

**What's left of this stage is the founder/vendor wiring** — production OTP (WhatsApp BSP), a real Didit
ZIM-ID KYC run, and a Firebase project for live FCM — each now documented as a *create account → set secret →
flip flag* step in **`docs/FOUNDER-RUNBOOK.md`**, plus the **dev build** for on-device `/qa`. The full flow is
exercisable against the live deployment today, vendor-free, via **`docs/QA-TESTING.md`**. Read the tracks and
exit criteria below through this update.

---

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

> **Now codified as Terraform: `infra/terraform/`** (reviewed in `docs/REVIEW-GCP-PROVISIONING.md`).
> Steps 2–8 below are exactly what the module provisions — run `terraform apply`, not console clicks.
> The only non-codeable step is **step 1 (project + billing)**, the founder gate. `terraform output
> arming_guide` then prints the release-workflow arming checklist.

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

### Arm the release workflow (connects provisioning → `/ship`)
The CI release job (`.github/workflows/release.yml`, Track A1) is **built and dormant**. It runs only when
the repo variable `GCP_DEPLOY_ENABLED` is `true`. Once provisioning hands back step 9, set these in
**repo Settings → Secrets and variables → Actions**, then push to `main` to deploy:

| Kind | Name | Value |
|------|------|-------|
| Variable | `GCP_DEPLOY_ENABLED` | `true` (the arming switch) |
| Variable | `GCP_PROJECT_ID` | the provisioned project id |
| Variable | `GCP_REGION` | `africa-south1` |
| Variable | `GCP_ARTIFACT_REPO` | Artifact Registry repo name (e.g. `lynia`) |
| Variable | `CLOUD_RUN_SERVICE` | `lynia-api` |
| Variable | `CLOUD_SQL_INSTANCE` | connection name `project:region:instance` |
| Variable | `VPC_CONNECTOR` | Serverless VPC Access connector (`lynia-connector`) — lets Cloud Run reach Redis |
| Variable | `CLOUD_RUN_SERVICE_ACCOUNT` | runtime SA email (`lynia-run@…`) — run as the scoped identity |
| Variable | `GCP_WORKLOAD_IDENTITY_PROVIDER` | WIF provider resource name — **keyless** CI auth |
| Variable | `GCP_SERVICE_ACCOUNT` | deployer SA email (`lynia-deployer@…`) the workflow impersonates |
| Secret | `MIGRATE_DATABASE_URL` | postgres URL via `127.0.0.1:5432` (the Auth Proxy), for `prisma migrate deploy` |

App runtime secrets (`DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_SECRET`) go in **Secret Manager** — the
workflow injects them with `--set-secrets`. **CI auth is keyless** via Workload Identity Federation — there
is no `GCP_SA_KEY`; the org disables long-lived SA keys (`constraints/iam.disableServiceAccountKeyCreation`),
and the WIF pool/provider are provisioned by `infra/terraform/wif.tf`. `terraform output arming_guide`
prints the exact values.

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
| A1 | ✅ **DONE — CI release/deploy job.** Builds the API container, pushes to Artifact Registry, runs `prisma migrate deploy` via the Cloud SQL Auth Proxy, deploys to Cloud Run. **Dormant until armed** by the `GCP_DEPLOY_ENABLED` repo variable, so it's a clean no-op until Track F provisions. | `.github/workflows/release.yml` | ✅ shipped; arms on provisioning |
| A2 | ✅ **DONE — GCS signed-URL wiring.** Real `@google-cloud/storage` V4 `getSignedUrl` for upload (write, content-type-bound) + read. Signing creds via ADC on Cloud Run (attached SA + IAM `signBlob`, no private key in env); `GCP_STORAGE_PROJECT_ID` wired through `selectStorage`. Covered by an offline V4-signing test (throwaway in-test RSA key). | `apps/api/src/adapters/storage/gcs.storage.ts` | ✅ shipped; live URL needs the bucket |
| A3 | **Secrets adapter** — keep env-injection as the deploy contract (D7 avoids managed-identity lock-in); document the Secret-Manager→env mapping for Cloud Run. | `apps/api/src/adapters/secrets/` | ✅ |
| A4 | ✅ **DONE — FCM push wiring.** `firebase-admin` (v14 modular) behind the `PushAdapter` seam, selected by `PUSH_PROVIDER=fcm`, ADC creds on Cloud Run (no key in env), best-effort send (never fails a transition), payload mapper unit-tested. Lazy-loaded so the noop/dev path never loads the SDK. _Remaining (own feature):_ device-token registration + `PUSH.send` call sites; live send needs the Firebase project + messaging role. | `apps/api/src/adapters/push/fcm.push.ts` | ✅ adapter shipped + tested; live send needs FCM project |
| A5 | ✅ **DONE — OTEL export.** NodeSDK + OTLP/HTTP trace exporter + http instrumentation, lazy-loaded, no-op until `OTEL_EXPORTER_OTLP_ENDPOINT` is set; `buildOtelSdk` unit-tested. | `apps/api/src/observability/otel.ts` | ✅ shipped + tested; traces need a collector |

> **Build order for Track A:** A1 first (it's the spine and pure-CI), then A2 (object storage is the
> first real upload dependency — rider KYC selfie / item photo), then A4/A5 once their endpoints exist.

---

## Track B — Pre-pilot hardening (buildable now, fully CI-verifiable) 🛡️

Zero external dependency, runs anytime — sensible to do **while Track F provisioning is arranged**, since
none of it is blocked. These are the consciously-deferred items from the post-build review (`BACKLOG.md`).

1. ✅ **DONE — gated the `x-user-id` dev auth fallback** (`apps/api/src/common/current-user.decorator.ts`).
   In production the header is now ignored entirely — identity is only ever the JWT subject — so a spoofed
   `x-user-id` can never stand in for a real user; the dev/test fallback is preserved. The resolver was
   extracted to a pure `resolveCurrentUser()` and covered by `current-user.decorator.spec.ts` (5 cases:
   JWT wins, dev fallback, prod ignores the header, no-identity throws).
2. ✅ **DONE — `onAccent` design token.** Added `color.onAccent` to `packages/shared/src/design-tokens.ts`
   and replaced every white-on-accent `"#fff"` (8 sites across mobile + admin: Button, Stepper, earnings
   header, admin tabs/logo). Cream-tint highlights (`#FFFCF2`) left as-is — not on-accent.
3. ✅ **DONE — skeleton loaders over spinners.** Added `Skeleton`/`SkeletonCard`/`SkeletonList` (native-driven
   opacity pulse, `busy` a11y state) to the UI kit and swapped the bare `ActivityIndicator` on the six
   content screens (order, rider board, rider job, history, earnings, profile) for content-shaped skeletons.
   The auth-gate boot splash keeps its spinner. Mobile + admin typecheck clean.
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

## Exit criteria for the Ship stage (status 2026-06-29)
- [x] GCP project provisioned; first Cloud Run deploy green from CI (`/ship`) — live at `https://lyniago.lyniafinance.com`.
- [x] `x-user-id` dev fallback gated to non-production (Track B #1).
- [~] Object storage live: GCS V4 signing wired (A2); a real signed-URL round-trip still needs the first upload.
- [ ] Production OTP path live (off the `console` channel) — **founder: WhatsApp BSP** (`FOUNDER-RUNBOOK.md` §1).
- [ ] FCM push reaching a device — **founder: Firebase project** + device-token feature (adapter A4 done).
- [ ] OTEL traces landing in a collector — **deferred by CEO review** (pilot volume doesn't need it yet).
- [ ] Real Didit ZIM-ID run completed; false-reject rate measured — **founder: Didit account** (`FOUNDER-RUNBOOK.md` §2).

## gstack skills this stage uses
`/ship` (CI + release — the headline), `/review` + `/codex` (each Track A/B PR), `/qa` (post dev-build,
on-device), `/design-review` (reconcile the §5c stepper + skeletons once Phase 3 lands).

---

**Bottom line:** the next stage is **Ship**, gated on **founder-side GCP provisioning**. While that clears,
the highest-value codeable work is **Track A1 (CI release job)** and **Track B #1 (`x-user-id` hardening)** —
both move the pilot forward today without waiting on any external unlock.
