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

**Option 1 — GCP Identity-Aware Proxy (recommended if the console is on GCP):**
1. Front the admin deployment (Cloud Run / GKE / backend service) with an external HTTPS LB.
2. Enable **IAP** on that backend service.
3. Configure the OAuth consent screen; restrict to your Google Workspace domain.
4. Grant operators `roles/iap.httpsResourceAccessor`. Enforce **MFA** at the Workspace level.
5. IAP sets `X-Goog-Authenticated-User-Email` — the middleware's default `ADMIN_CONSOLE_PROXY_HEADER`.
   No app change needed. Leave `ADMIN_CONSOLE_REQUIRE_AUTH` unset (defaults on in prod).

**Option 2 — self-hosted OAuth2 proxy** (e.g. oauth2-proxy) in front of the console: point
`ADMIN_CONSOLE_PROXY_HEADER` at the header it sets (e.g. `x-forwarded-email`).

*Verify:* an unauthenticated request to the console URL is rejected before any page renders; an
authenticated operator's actions appear attributed in the admin audit log.

*Network:* additionally restrict the console's ingress (internal + LB only) so the origin isn't
directly reachable, mirroring the API.

---

## B. Restrict the client-side Google Maps / Places key (P3-3)

The mobile app ships a Google Maps/Places key in its bundle (`EXPO_PUBLIC_GOOGLE_PLACES_KEY`) — inherent
to client-side Google APIs. Contain it in the GCP console:
1. **APIs & Services → Credentials →** the key → **Application restrictions**: restrict to the Android
   app's package name + SHA-1 signing cert (and iOS bundle id if applicable).
2. **API restrictions**: allow *only* Maps SDK + Places API — nothing else.
3. Set a **quota cap** so a leaked key can't run up an unbounded bill.
4. Keep a separate, server-restricted key for any server-side Google calls.

*Verify:* the key rejected when called from an unlisted package / for a non-allowed API.

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
| Console fail-closed gate | `apps/admin/middleware.ts`, `app/lib/console-auth.ts` |
| Edge WAF / rate limit | `infra/terraform/armor.tf` (+ vars) |
| App rate limiting | `apps/api/src/common/throttle.guard.ts` + `@Throttle` |
| Security headers / CORS | `apps/api/src/common/{security-headers.middleware,cors}.ts` |
| Boot fail-closed guards | `apps/api/src/config/env.ts` |
| Secret rotation | `apps/api/src/auth/token.service.ts` + [SECRET-ROTATION](SECRET-ROTATION.md) |
| Private SQL / Redis TLS / CMEK | `infra/terraform/{sql,redis,secrets,kms,storage}.tf` (gated vars) |
| CI security scanning | `.github/workflows/{ci,codeql}.yml`, `.github/dependabot.yml` |
