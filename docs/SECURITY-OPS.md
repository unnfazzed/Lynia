# Security Operations Runbook

The security controls that live in the **platform/console** rather than the code — precise, ordered
steps so nothing is hand-wavy. Companion to [SECURITY.md](SECURITY.md) (the plan) and its P0–P3
roadmap; this is the "how to actually turn it on / roll it out" for the items that need a GCP/vendor
action or a coordinated deploy.

---

## A. Admin console SSO + MFA (completes P0-2)

The console code already **fails closed** without a proxy-asserted operator identity
(`apps/admin/middleware.ts`) and forwards that identity downstream as `x-lynia-operator`. Put a real
identity in front of it:

**Production today — Azure Easy Auth + Microsoft Entra (`ca-lynia-admin`):** follow
`infra/azure/README.md` **Step 6**. `infra/azure/admin-auth.sh` creates the Entra app (Assignment
required = Yes, only named operators assigned) and its Key Vault client secret. The Terraform apply
turns Easy Auth on, and `deploy-admin-azure.yml` applies `ADMIN_CONSOLE_ALLOWED_OPERATORS` only once
Easy Auth is confirmed. **Never set that allowlist on an app without Easy Auth in front:** the
`x-ms-client-principal-name` header is then forgeable, and an allowlisted email becomes a password
anyone can type (`docs/KNOWN_BUGS.md` ADM-11). Enforce MFA in Entra (security defaults, or Conditional
Access).

**Option 1 — GCP Identity-Aware Proxy (recommended if the console is on GCP):**
1. Front the admin deployment (Cloud Run / GKE / backend service) with an external HTTPS LB.
2. Enable **IAP** on that backend service.
3. Configure the OAuth consent screen; restrict to your Google Workspace domain.
4. Grant operators `roles/iap.httpsResourceAccessor`. Enforce **MFA** at the Workspace level.
5. IAP sets `X-Goog-Authenticated-User-Email` — the middleware's default `ADMIN_CONSOLE_PROXY_HEADER`.
   No app change needed. Leave `ADMIN_CONSOLE_REQUIRE_AUTH` unset (defaults on in prod).
5a. **Recommended, and now armed in prod:** also set `ADMIN_CONSOLE_IAP_AUDIENCE` (from
    `terraform output` on `infra/terraform/admin.tf` — the LB backend-service audience string) so the
    middleware verifies the signed `x-goog-iap-jwt-assertion` (`apps/admin/app/lib/iap-jwt.ts`, ES256 +
    JWKS + clock-skew tolerance) instead of trusting the plaintext email header alone.

**Option 2 — self-hosted OAuth2 proxy** (e.g. oauth2-proxy) in front of the console: point
`ADMIN_CONSOLE_PROXY_HEADER` at the header it sets (e.g. `x-forwarded-email`).

*Verify:* an unauthenticated request to the console URL is rejected before any page renders; an
authenticated operator's actions appear attributed in the admin audit log.

*Network:* additionally restrict the console's ingress (internal + LB only) so the origin isn't
directly reachable, mirroring the API.

---

## B. Restrict the client-side Google Maps / Places key (P3-3)

The mobile app ships client-side Google keys in its bundle — inherent to client-side Google APIs. There
are **two distinct keys**, and they take **different restrictions**:

| Key | Used by | Application restriction |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Maps **SDK** for Android (`react-native-maps`) | ✅ Android package name + SHA-1 |
| `EXPO_PUBLIC_GOOGLE_PLACES_KEY` | Places **API (New)** REST (`src/api/places.ts`) | ❌ **App restrictions do not work** — use *None*, and lean on API restriction + quota |

The Places key calls Places API (New) — `places.googleapis.com/v1/places:autocomplete` and
`/v1/places/{id}` — directly over `fetch`, with the key in the `X-Goog-Api-Key` header. The call comes
from JS shared by the Android and iPhone apps and carries no app identity headers, so an Android- or
iOS-app restriction refuses **every** call with `PERMISSION_DENIED`. The client turns a refusal into an
empty result list (plus one `places-status-<STATUS>:<REASON>` Sentry event per run), so the symptom is
a search box that never returns anything. (An app restriction could be satisfied by having the app send
`X-Android-Package` / `X-Android-Cert` and the iOS bundle header — but anyone holding the APK can send
the same values, so it adds little over the API restriction and quota cap.)

> **Not the legacy Places API.** Until 2026-09-28 the client called the legacy web service
> (`maps.googleapis.com/maps/api/place/…`, service `places-backend.googleapis.com`). Google does not
> offer that product to Cloud projects created after 2025-03-01, so a key made in a new project is
> refused by it outright. Restrict the key to **Places API (New)** (`places.googleapis.com`); the
> console lists the two as different APIs.

> **Where the keys live (2026-09-28).** `lynia-500911` has been suspended since 2026-09-17 and
> Google refuses every key in it (MOB-MAP-03 in `docs/KNOWN_BUGS.md`). Both client keys are
> re-created in the live project **`lyniago-app`**, the one that already holds Firebase and the Play
> service account. `infra/terraform/apikeys.tf` still describes the suspended project, so the new
> keys are console-managed until that module is re-pointed; the steps below apply to them as written.
>
> **Billing must be active, not just linked.** A billing account opened from the Maps Platform sign-up
> stayed inactive until a one-time prepayment (US$30, 2026-09-28). Until it was paid, every call from
> a key in `lyniago-app` was refused with a bare 403, *"The caller does not have permission"*, with no
> reason code. Billing → Overview shows the prepayment prompt. Check there before suspecting the key.

**These restrictions are Terraform-managed** (`infra/terraform/apikeys.tf`), gated off by
`maps_api_keys_enabled` until the keys are imported — steps 1 and 2 below are what that config
encodes, and after arming they are a reviewable plan diff rather than console clicks. Step 3
(quota) is still manual; step 4 is a separate key this repo does not manage. The console steps
remain the source of truth until the import lands.

> **Arming no longer needs a laptop.** `GCP Diagnose (read-only)` prints the key ids and each key's
> current restrictions; four Actions *variables* (`TF_MAPS_KEY_ID`, `TF_PLACES_KEY_ID`,
> `TF_MAPS_SHA1_PLAY`, `TF_MAPS_SHA1_UPLOAD`) supply the values; and `Maps Keys — arm Terraform`
> imports, plans and applies, refusing any plan that is not a pure in-place update. Step-by-step:
> `docs/MOB-MAP-02-RUNBOOK.md` §4. **Prefer it to hand-editing the console** — a hand-edit is what
> left the Maps key at `Application restrictions: None` from at least 2026-08-16 to 2026-08-17 with
> no diff, no alert and no record.

> ⚠️ **Read the header of `apikeys.tf` before enabling.** Both keys already exist, and Terraform's
> `name` is the key's **immutable id** (the last component of
> `projects/<n>/locations/global/keys/<KEY_ID>`), not a label — the API cannot patch it, so it is
> ForceNew. Set `maps_api_key_id` / `places_api_key_id` to the real ids **first**
> (`gcloud services api-keys list --format='table(name,displayName)'` — that is `name`, **not** the
> output-only `uid`, which the import path rejects), then import, then read the plan: it must show
> only in-place restriction changes. Anything proposing to create, destroy or replace a key means
> the id is wrong. Both resources carry `prevent_destroy`, so that mistake errors instead of
> deleting a live key. And once imported, **disarming is `terraform state rm`, not flipping the flag
> to `false`** — `count = 0` on a resource in state means destroy.

Contain them in the GCP console:
1. **APIs & Services → Credentials →** the Maps SDK key → **Application restrictions**: Android package
   name + SHA-1 signing cert (and iOS bundle id if applicable).

   > ⚠️ **Which SHA-1 — this is the one that bites.** Google Play **re-signs** the uploaded AAB with
   > the *app signing* certificate, which is NOT the EAS-managed *upload* keystore. A key allowlisted
   > for the upload certificate alone renders tiles perfectly in a sideloaded APK and returns
   > `Authorization failure` — a blank grey map — in every Play-installed build, so the failure only
   > appears after a track upload and looks like a regression that "worked yesterday". List **both**
   > fingerprints against `zw.co.lynia`: Play Console → **Protected with Play** → **App signing** →
   > *Classical key* → SHA-1 certificate fingerprint (the one devices actually run; since 2026-09 the
   > old App integrity page only says it has moved). For `zw.co.lynia` it is
   > `35:0F:72:18:13:30:A8:A1:4F:69:5F:E7:EB:AE:B1:6D:76:C6:FC:08`. Add the upload key SHA-1 for
   > sideloaded QA APKs. Confirm from the handset with
   > **Confirm without a cable:** GitHub → Actions → **Maps Key Doctor** → Run workflow, pasting that
   > app-signing SHA-1. It probes the live key and names the cause (allowlist / billing / invalid /
   > API restriction) in the job log — `workflow_dispatch`, so it runs from a phone. (`adb logcat |
   > grep -i "Google Maps Android API"` says the same thing if you have a terminal and a cable.)
   > Ordered fix: `docs/MOB-MAP-02-RUNBOOK.md`. See also MOB-MAP-02 in `docs/KNOWN_BUGS.md` and
   > `docs/MAPS-LOADING-REVIEW-2026-08-16.md`.
2. The **Places** key → **Application restrictions: None** (a client-side key can't be IP-restricted).
   Compensate with a tight **API restriction** (**Places API (New)** *only*, `places.googleapis.com`)
   and a hard **quota cap**.
3. Set a **quota cap** on both so a leaked key can't run up an unbounded bill.
4. Keep a separate, server-restricted key for any server-side Google calls.

*Verify:* the Maps key is rejected from an unlisted package; the Places key returns real predictions
(not `PERMISSION_DENIED`) and is refused for any non-Places API. **Maps Key Doctor** checks both from a
phone: its Places section sends the app's own request for "westgate" and prints `OK` with Google's top
suggestion, or names the cause (suspended project / API not enabled / API or app restriction / billing).

---

## C. Mobile certificate pinning (P3-1)

Pinning stops a man-in-the-middle with a rogue/compromised CA from reading Lynia traffic. **It is also
the single easiest way to brick the app** — a pinned cert that rotates without an app update makes every
client unable to connect. Adopt it carefully:

1. Pin the **SPKI public-key hash**, not the leaf certificate (survives cert renewal on the same key).
2. Always ship **≥ 2 pins**: the current key **and** a backup key held offline, so you can rotate.
3. Pin the API host (`lyniago.lyniafinance.com`) and the WS host.
4. Implementation: a config-plugin / native module (e.g. `react-native-ssl-pinning` or an
   `expo-build-properties` network-security-config on Android). Gate it behind a flag so it can be
   disabled by an OTA/remote-config kill-switch if a rotation goes wrong.
5. **Roll out to a canary cohort first.** Never ship pinning to 100% in the same release it's introduced.

Because a mistake here breaks connectivity for real users, the config-plugin implementation
(`apps/mobile/plugins/with-certificate-pinning.js`, wired in `app.config.ts`) ships **gated and inert**
by default — a no-op until `LYNIA_TLS_PINS` is set. See [MOBILE-CERT-PINNING.md](MOBILE-CERT-PINNING.md)
for the founder-executed arming + on-device validation runbook.

---

## D. Cloud Armor WAF tuning (P3-5)

`infra/terraform/armor.tf` ships the OWASP rulesets in **preview** (`armor_waf_preview=true`) so they
log without blocking. To enforce:
1. Apply and let it run in preview against real traffic for ~1–2 weeks.
2. Review Cloud Armor logs for **preview matches** — these are what *would* have been blocked. Confirm
   they're actual attacks, not false positives on legitimate requests.
3. Add narrow exclusions for any confirmed false positives.
4. Flip `armor_waf_preview=false` and apply → the rulesets now `deny(403)`.
5. Tune `armor_rate_limit_count` / `armor_rate_limit_interval_sec` to sit comfortably above real
   per-user peak but below abuse levels.

---

## E. Coordinated infra rollouts (gated, default-off)

These landed as code but are **off by default** so a plain `terraform apply` changes nothing. Each is a
deliberate, verified switch.

### E1. Private-only Cloud SQL (P2-1)
1. Set repo variable `DB_PRIVATE_ONLY=true` (routes migrations to the in-VPC Cloud Run job).
2. Deploy once with public IP still on and confirm the **in-VPC migrate job** succeeds
   (`release.yml` → "Apply database migrations (in-VPC Cloud Run job)").
3. Then set Terraform `db_public_ip_enabled=false` and apply → instance goes private-only.
4. *Verify:* the instance has no public IP; a normal deploy still migrates + runs. Roll back by
   flipping both back if the job path misbehaves.

### E2. Redis in-transit TLS (P2-1)
1. Set Terraform `redis_tls_enabled=true` and apply (enables `SERVER_AUTHENTICATION`, switches
   `REDIS_URL` to `rediss://`, injects `REDIS_CA_CERT`).
2. Redeploy; the client auto-negotiates TLS (`apps/api/src/common/redis.ts`).
3. *Verify:* the app reconnects (OTP, rate-limit, BullMQ, Socket.IO adapter all healthy); a plaintext
   `redis://` client is now rejected. This is all-or-nothing — roll out in a maintenance window.

### E3. Media bucket CMEK + retention (P3-4)
1. `kyc_cmek_enabled=true` → creates the KMS keyring/key and encrypts new objects with our key.
2. Optionally `kyc_retention_days=<N>` to auto-purge old media (mind dispute/compliance needs first).
3. *Verify:* new objects show the CMEK key; lifecycle rules appear on the bucket.

---

## F. Penetration test & bug bounty (P3-6)

- **Before scaling past the pilot**, commission a third-party pentest. Scope: the API
  ([REST/WS surface](ARCHITECTURE.md#16-rest--websocket-surface)), auth/offer-loop/lifecycle abuse,
  IDOR across `:id` routes, the admin console, the KYC webhook, and the mobile app. Re-test annually.
- Keep the responsible-disclosure path open (root [`SECURITY.md`](../SECURITY.md)); consider a bug
  bounty once the surface stabilizes.
- Fix findings by severity; each fix ships with a regression test.

---

## Quick reference — where each control lives

| Control | Code / config |
|---|---|
| Console fail-closed gate | `apps/admin/middleware.ts`, `app/lib/console-auth.ts`, `app/lib/iap-jwt.ts` |
| Edge WAF / rate limit | `infra/terraform/armor.tf` (+ vars) |
| App rate limiting | `apps/api/src/common/throttle.guard.ts` + `@Throttle` |
| Security headers / CORS | `apps/api/src/common/{security-headers.middleware,cors}.ts` |
| Boot fail-closed guards | `apps/api/src/config/env.ts` |
| Secret rotation | `apps/api/src/auth/token.service.ts` + [SECRET-ROTATION](SECRET-ROTATION.md) |
| Private SQL / Redis TLS / CMEK | `infra/terraform/{sql,redis,secrets,kms,storage}.tf` (gated vars) |
| CI security scanning | `.github/workflows/{ci,codeql}.yml`, `.github/dependabot.yml` |
