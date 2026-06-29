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
- [x] **FCM push — server side complete** (A4) — `firebase-admin` behind the seam (ADC creds), **device-token
      registration** (`POST/DELETE /notifications/device-token`, `device_tokens` table), and **send call-sites
      wired** into the lifecycle (offer received → customer; assigned → rider; status changes → the watching
      party; expired/cancelled) via a best-effort `NotificationsService` that can't fail a transition.
      Terraform enables the FCM API + grants the runtime SA `roles/firebasecloudmessaging.admin`.
      _Remaining:_ a **Firebase project** (founder) + the **mobile token-registration call** (device build —
      POST the Expo/FCM token to the endpoint above; Expo Go can't, needs the dev build).
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

---

# Founder action runbook (the remaining unblocks)

Everything codeable is shipped. What remains needs a **founder/vendor action** — an account, a key, or an
org decision, not code. The integrations are already built behind env seams, so each item is **create
account → set secret → flip flag**. Lead time is the long pole: **start items 1 and 2 now**, in parallel.

### How a vendor secret reaches the running service (the wiring pattern)

Runtime config is injected at deploy by `.github/workflows/release.yml`: **plain values** via
`--set-env-vars` (already carries `OTP_CHANNEL`, `KYC_PROVIDER`, `PUSH_PROVIDER`), **secrets** via Secret
Manager + `--set-secrets` (already carries `DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_SECRET`). To add a
vendor **secret**:

```bash
PROJECT=lynia-500911
RUNTIME_SA=lynia-run@lynia-500911.iam.gserviceaccount.com

# 1. create the secret + first version
printf '%s' "<THE_VENDOR_KEY>" | gcloud secrets create <SECRET_NAME> \
  --project "$PROJECT" --replication-policy=automatic --data-file=-
# 2. let the runtime SA read it
gcloud secrets add-iam-policy-binding <SECRET_NAME> --project "$PROJECT" \
  --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
```

Then add `<ENV_NAME>=<SECRET_NAME>:latest` to the `--set-secrets` list in `release.yml` and push to `main`.
(Better long-term: track it in `infra/terraform/secrets.tf` — the pattern is there for the existing three.)

### 1. WhatsApp BSP — production OTP  🔴 longest lead time, start first
Real users can't sign up until OTP leaves the dev `console` channel. `OTP_CHANNEL=whatsapp` is already set;
the send is a stub (`apps/api/src/auth/otp-sender.ts` → `WhatsAppOtpSender.send`).
1. **Pick a BSP** (the decision gates the code): Meta WhatsApp **Cloud API** (direct) is the usual fastest
   path; alternatives Twilio / Gupshup / 360dialog. Each needs Meta Business verification + an approved
   **OTP template** — that approval is the lead-time item.
2. Get the API key/token and (Cloud API) the phone-number ID + template name.
3. Store the key: `WHATSAPP_BSP_API_KEY` → Secret Manager (pattern above).
4. **Code step (small, once BSP chosen):** implement `WhatsAppOtpSender.send()` against the BSP's template
   API — the adapter seam, channel flag, rate-limits, and hashing are already in place (one HTTP call).
5. SMS fallback (optional insurance, E4): same pattern with `SMS_GATEWAY_API_KEY` + `OTP_CHANNEL=sms`.

### 2. Didit ZIM-ID — real KYC run  🔴 start now (gates rider onboarding)
Measures the false-reject rate that decides whether real riders can self-onboard. The integration is **done**
(`apps/api/src/kyc/didit-kyc-vendor.ts`); `KYC_PROVIDER=didit` is set.
1. Create a **Didit** account + workflow for Zimbabwean national IDs; get `DIDIT_API_KEY`,
   `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`.
2. Set the callback: **`DIDIT_CALLBACK_URL=https://lyniago.lyniafinance.com/kyc/callback`** (the route is
   live and HMAC-verifies the webhook against `DIDIT_WEBHOOK_SECRET`).
3. Store `DIDIT_API_KEY` + `DIDIT_WEBHOOK_SECRET` as secrets; `DIDIT_WORKFLOW_ID` + `DIDIT_CALLBACK_URL` can
   be plain `--set-env-vars`. Keep `KYC_MODE=auto`.
4. **Run a real Zimbabwean ID** end-to-end → record approve/decline + the false-reject rate. If rejects are
   high, the manual admin backstop (`POST /admin/riders/:id/kyc`) is the fallback.

### 3. FCM push — device notifications  🟠 (server side done; needs the Firebase project + a device build)
The **whole server side is built**: the adapter (`apps/api/src/adapters/push/fcm.push.ts`, ADC creds), the
**device-token registry** (`device_tokens` table + `POST/DELETE /notifications/device-token`), and the
**send wiring** — `NotificationsService` fires best-effort pushes at offer-received / assigned / each
lifecycle status / expired / cancelled, and can never fail a transition. Terraform enables
`firebase.googleapis.com` + `firebasecloudmessaging.googleapis.com` and grants the runtime SA
`roles/firebasecloudmessaging.admin` (so `terraform apply` covers the old manual gcloud steps).
1. **Enable Firebase** on the project (founder): `firebase projects:addfirebase lynia-500911`, register an
   Android app (`zw.co.lynia`), set `FCM_PROJECT_ID=lynia-500911` + `PUSH_PROVIDER=fcm`.
2. **Mobile token-registration call** (device build): after login the app gets its Expo/FCM device token and
   `POST`s it to `/notifications/device-token` (and `DELETE`s on sign-out). Expo Go can't acquire a remote
   token — this lands with the Phase-3 dev build. Pilots can run on foreground/polling until then.

### 4. OTEL traces — observability  🟢 deferred by decision
Exporter wired (`apps/api/src/observability/otel.ts`), no-op until `OTEL_EXPORTER_OTLP_ENDPOINT` is set. CEO
review defers this (admin funnel covers core metrics; a collector is cost pilot volume doesn't need yet).
_Trigger:_ when trip volume makes traces necessary — point at a collector, or add
`@google-cloud/opentelemetry-cloud-trace-exporter` (zero-infra, GCP-native) + grant the runtime SA
`roles/cloudtrace.agent`.

> **WebSocket timeout — resolved, no action.** Tracking sockets survive a full delivery via Cloud Run's
> `--timeout 3600` (`release.yml`). A `timeout_sec` on the LB backend was tried then removed (invalid for a
> serverless-NEG backend); no Terraform apply is outstanding.
>
> **Deferred infra hardening** (pre-launch, not pilot — lean decision; tracked in `infra/terraform/README.md`):
> drop Cloud SQL public IP (needs a VPC-internal migrator first), Redis `STANDARD_HA` + Cloud SQL `REGIONAL`
> (cost), tighten bucket CORS (needs the deployed admin origin).

---

# Vendor-free QA testing (exercise the full flow with no vendors)

Run the **entire** customer + rider journey on real devices against the live API
(`https://lyniago.lyniafinance.com`) **without** the WhatsApp BSP (OTP) or Didit (KYC) vendors — so vendor
onboarding never blocks testing. This is a **test configuration of the production deployment**; there are no
real users yet.

### Fail-safe model: QA is OPT-IN via repo variables
The deploy **defaults to launch-safe** (`OTP_CHANNEL=whatsapp`, `KYC_PROVIDER=didit`, `PUSH_PROVIDER=fcm`).
Test mode turns on **only** when the matching repo Variables are set — a vendor-free, auto-KYC build can
never reach the public URL by accident.

| Variable | Test value | Effect |
|---|---|---|
| `OTP_CHANNEL` | `console` | OTP codes logged, not sent via WhatsApp |
| `OTP_TEST_PHONES` | your test numbers (comma-sep) | `POST /auth/otp` returns the code **in the response** — ONLY for these numbers |
| `KYC_PROVIDER` | `stub` | rider KYC **auto-verifies** (no Didit) so riders can go online |
| `PUSH_PROVIDER` | `noop` | no Firebase needed; pushes logged, not sent |

Security: the OTP code is exposed **only** for `OTP_TEST_PHONES` numbers on the `console` channel — an
arbitrary phone can never retrieve a code (not an account-takeover hole). Rate limits still apply.

### Turn QA mode ON
```bash
gh variable set OTP_CHANNEL --body "console"
gh variable set KYC_PROVIDER --body "stub"
gh variable set PUSH_PROVIDER --body "noop"
gh variable set OTP_TEST_PHONES --body "+263771234567,+263770000002"   # your test number(s)
gh workflow run release.yml --ref main      # redeploy to apply
```
(Ad-hoc, no redeploy: `gcloud run services update lynia-api --region africa-south1 --update-env-vars '^@^OTP_CHANNEL=console@KYC_PROVIDER=stub@PUSH_PROVIDER=noop@OTP_TEST_PHONES=+263771234567'`.)

### Customer flow
1. `POST /auth/otp {phone}` → response includes `devCode` (allowlisted number). `POST /auth/otp/verify
   {phone, code}` → tokens.
2. Complete profile → **create an order** (pickup/dropoff, item, suggested fare).
3. From a **second (rider) account**, make an offer; back on the customer, **select** it.
4. Watch **live tracking** (Socket.IO), then **rate** after delivery.

### Rider flow
1. Log in with a second allowlisted number → **become a rider** (`POST /riders/become`). With the stub
   provider this returns `kycStatus: "verified"` immediately — no Didit, no admin step.
2. **Go online** (`PATCH /riders/online`) → see the broadcast order → **bid** → once selected, drive the
   lifecycle: mark collected → en route → **deliver with the handover OTP** → done. Earnings hit the ledger.

> To test the **manual** KYC path instead of auto-verify, deploy with `KYC_MODE=manual` — riders stay
> `pending` and an admin approves via `POST /admin/riders/:id/kyc`.

### ✅ Flip to launch (turn QA mode OFF)
Because QA is opt-in, launch = **clear the variables**, then redeploy:
```bash
gh variable delete OTP_CHANNEL      # back to default: whatsapp
gh variable delete KYC_PROVIDER     # back to default: didit
gh variable delete PUSH_PROVIDER    # back to default: fcm
gh variable delete OTP_TEST_PHONES  # no code ever returned
gh workflow run release.yml --ref main
```
Then complete the real-vendor wiring in the founder runbook above (WhatsApp BSP, Didit keys, Firebase). With
no vars set the deploy is already launch-safe, and the OTP code is never returned on the `whatsapp`/`sms`
channels regardless of `OTP_TEST_PHONES`.
