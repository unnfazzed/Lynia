# Lynia — Security Plan & Threat Model

> **Status:** first full security review of the platform. This document is the engineering
> map of *how Lynia is attacked, how it defends, and what we harden next*. It complements
> [ARCHITECTURE](ARCHITECTURE.md) (how the system is wired) and [ENG-REVIEW](ENG-REVIEW.md)
> (why the core is built the way it is). Line references point at the real code as of this
> review so remediations are unambiguous.

---

## 0. Framing: "unbreakable" honestly

The ask was to make Lynia **unhackable and unbreakable**. No connected system that serves
real users over the public internet is literally unhackable — anyone who tells you otherwise
is selling something. What is achievable, and what this plan delivers, is a system where:

1. **Every realistic attack path is closed or made expensive** — an attacker has to defeat
   several independent controls, not one.
2. **A single failure is contained** — one leaked token, one compromised dependency, one
   misconfigured deploy does not hand over the whole platform or the whole user base.
3. **People's data is protected by default** — phone numbers, national-ID / KYC records,
   home/work addresses, live location, and delivery codes are minimized, encrypted, access-
   controlled, and never sitting in a log or a public bucket.
4. **We see attacks and can respond** — detection, alerting, and a rehearsed incident
   runbook, because "unbreakable" in practice means "breaks are caught early and small."

That is **defense in depth**. The good news from this review: Lynia's *correctness core*
(the concurrency guards, hashed OTP/refresh tokens, HMAC-verified KYC webhook, least-privilege
IAM, keyless CI) is already strong. The gaps are almost entirely at the **edge and the
perimeter** — the parts an external party actually touches first — and they are fixable
quickly. This plan is prioritized so the highest-leverage fixes ship first.

---

## Table of contents

1. [What we protect — data classification & assets](#1-what-we-protect)
2. [Who attacks us — threat actors & trust boundaries](#2-who-attacks-us)
3. [Attack surface & STRIDE threat model](#3-attack-surface--stride)
4. [Current posture scorecard](#4-current-posture-scorecard)
5. [Remediation roadmap (P0 → P3)](#5-remediation-roadmap)
6. [Defense-in-depth by layer](#6-defense-in-depth-by-layer)
7. [Data protection & privacy](#7-data-protection--privacy)
8. [Detection, logging & incident response](#8-detection-logging--incident-response)
9. [Governance & the security lifecycle](#9-governance--the-security-lifecycle)
10. [Acceptance criteria — how we prove it](#10-acceptance-criteria)

---

## 1. What we protect

Security is meaningless in the abstract; it is defined by *what data, if exposed or tampered
with, hurts a real person*. Lynia handles unusually sensitive data for a young platform.

| Asset | Sensitivity | Where it lives | Harm if breached |
|---|---|---|---|
| **National ID / KYC records & selfies** | **Critical** | Didit (vendor) + GCS `kyc/{userId}/…` object keys, `Rider.kycRef` | Identity theft; Zimbabwe Data Protection Act exposure; irreversible |
| **Phone numbers** (every user) | High (PII) | `Profile.phone`, Redis OTP keys, logs | Deanonymization, SIM-swap targeting, spam/fraud |
| **Home / work / pickup / dropoff addresses** | High (PII) | `Order.pickup/dropoff` JSON, `Address` | Physical-safety risk (stalking, targeted theft) |
| **Live location traces** (riders on active jobs) | High | `Rider.geog`, `OrderEvent.lat/lng`, WS stream | Real-time physical tracking of a person |
| **Delivery OTP** | High (short-lived) | `Order.otpHash` (hashed) + returned once | Parcel theft / handover fraud if forged |
| **Session & refresh tokens** | High | `Session.refreshTokenHash` (hashed), client Keychain | Account takeover |
| **Cash settlement / commission ledger** | High (financial) | `Settlement*` tables | Financial fraud, payout manipulation |
| **Admin capability** (KYC approve, ban, pay) | Critical | Admin JWT / `ADMIN_API_TOKEN` | Full platform control, fraud at scale |
| **JWT signing secret, vendor keys** | Critical | Secret Manager, env at deploy | Token forgery, vendor account abuse |

**Data-classification rule going forward:** every new field is tagged `Critical / PII / Internal /
Public` at design time, and the tag drives its handling (encryption, log-masking, retention,
who may read it). See [§7](#7-data-protection--privacy).

---

## 2. Who attacks us

Trust boundaries — every arrow crossing one is a place an attacker operates:

```
  ┌─ Untrusted internet ──────────────────────────────────────────────┐
  │  external attacker · malicious customer · malicious rider · bot    │
  └───────────────┬─────────────────────────┬────────────────────────-┘
                  │ HTTPS/WSS               │ (should be) restricted
         ┌────────▼─────────┐      ┌─────────▼──────────┐
         │  Public API      │      │  Admin console     │  ◀── currently no
         │  (Cloud Run/ALB) │      │  (Next.js)         │      operator auth (§5 P0-2)
         └────────┬─────────┘      └─────────┬──────────┘
                  │ VPC (private)            │ shared admin token
     ┌────────────▼───────────────────────-─▼─────────────┐
     │  Postgres · Redis · GCS · Secret Manager            │
     └─────────────────────────────────────────────────────┘
                  │ outbound
     ┌────────────▼─────────────┐
     │ Vendors: WhatsApp · FCM · │  ◀── vendor compromise / webhook spoofing
     │ Didit (inbound webhook)   │
     └───────────────────────────┘
```

| Actor | Motivation | Realistic capability |
|---|---|---|
| **External unauthenticated attacker** | Data theft, ransom, disruption | Hit any public endpoint, scrape, brute-force, DDoS, exploit a CVE |
| **Malicious customer** (authenticated) | Free/cheap rides, harass riders, steal parcels | Abuse offer loop, IDOR into others' orders, forge delivery handover |
| **Malicious rider** (authenticated, KYC'd) | Fraud, stalk customers, game payouts | Location abuse, settlement manipulation, fake completions |
| **Account-takeover attacker** | Impersonation | SIM-swap + OTP interception, stolen refresh token, session replay |
| **Compromised admin / insider** | Mass fraud, data exfiltration | Approve fraudulent KYC, ban rivals, redirect payouts |
| **Supply-chain attacker** | Broad compromise | Malicious npm dependency, poisoned CI, typosquat |
| **Vendor / webhook spoofer** | Forge KYC "verified", inject push | Replay/forge Didit callback, abuse leaked vendor key |
| **Nation-state / well-resourced** | Surveillance of a specific person | Out of scope to fully defend, but data-minimization limits blast radius |

---

## 3. Attack surface & STRIDE

The concrete entry points (from [ARCHITECTURE §16](ARCHITECTURE.md#16-rest--websocket-surface)):
REST controllers, the Socket.IO tracking gateway, the Didit webhook, direct-to-GCS signed-URL
uploads, the admin console, the mobile clients, and the CI/CD pipeline. Mapped to STRIDE:

| STRIDE threat | Concrete Lynia scenario | Primary control | Status |
|---|---|---|---|
| **S**poofing | Forge an admin JWT with the dev-default secret | Strong, rotated `JWT_SIGNING_SECRET`; pin `algorithms` | ⚠️ **gap** (P0-1) |
| **S**poofing | Spoof the Didit KYC webhook → fake "verified" rider | HMAC-V2 + timestamp freshness + fail-closed | ✅ solid |
| **T**ampering | SQL injection via geo/query params | Parameterized `$queryRaw` tagged templates | ✅ solid |
| **T**ampering | Assign yourself another user's order (IDOR) | Per-object ownership checks in services | ⚠️ verify (P1-5) |
| **R**epudiation | Admin acts with no attributable identity | Per-operator SSO + audit log | ⚠️ **gap** (P0-2) |
| **I**nfo disclosure | Live OTP / phone in application logs | Log redaction / masking | ⚠️ **gap** (P1-4) |
| **I**nfo disclosure | Public bucket / broad CORS leaks media | Private bucket (done) + tighten CORS | 🟡 partial |
| **D**enial of service | Flood public API / offer loop / OTP | WAF + global throttling | ⚠️ **gap** (P0-3, P1-2) |
| **E**levation of privilege | Reach admin API without admin role | Server-side role guard on every admin route | ✅ solid |
| **E**levation of privilege | Over-broad cloud IAM after a pod compromise | Least-privilege SA (no editor/owner) | ✅ solid |

**Key takeaway:** the *business-logic* core resists tampering and privilege escalation well.
The exposed gaps are **spoofing at the perimeter, DoS, admin identity, and info disclosure via
logs/CORS** — the classic "the walls are thick but a few doors are unlocked" pattern.

---

## 4. Current posture scorecard

Grounded in this review. This is deliberately honest — it credits what is already strong so
effort goes where it matters.

### Already strong — do not regress

- **Concurrency & correctness core** — guarded compare-and-swap + DB constraints across the
  offer loop, lifecycle, OTP, and KYC webhook ([ARCHITECTURE §13](ARCHITECTURE.md#13-concurrency-safety-model)).
- **Secrets at rest** — OTP codes and refresh tokens stored only as HMAC hashes
  (`token.service.ts`), delivery OTP hashed (`Order.otpHash`), constant-time compares.
- **KYC webhook** — HMAC-SHA256 over canonical body, `timingSafeEqual`, ±300s replay window,
  fail-closed when the secret is unset (`kyc/didit.ts`, `kyc/kyc.controller.ts`).
- **SQL** — all PostGIS raw SQL uses parameterized Prisma tagged templates; **no
  `$queryRawUnsafe` anywhere**.
- **Cloud IAM** — least privilege; **no `roles/editor` or `roles/owner`**; per-secret access;
  bucket-scoped storage role; keyless WIF CI gated to the repo.
- **Storage** — GCS uniform bucket-level access + `public_access_prevention = enforced`.
- **Transport** — managed TLS at the ALB with an HTTP→HTTPS 301 redirect; Cloud Run ingress
  restricted to `internal-and-cloud-load-balancing`.
- **Mobile token storage** — `expo-secure-store` (Keychain / Keystore), refresh rotation with
  single-flight coalescing; release build hard-fails on a localhost API URL.
- **No secrets in source** — `.gitignore` covers `.env*` and `google-services.json`;
  `.env.example` ships only blank placeholders.

### Gaps — this plan closes them

See the roadmap in [§5](#5-remediation-roadmap). Ranked, the material ones are:

1. **JWT signing-secret has a dev default with no prod fail-closed guard.** (Critical)
2. **Admin console has no operator authentication** — a shared server-side admin token acts
   for anyone who can reach the URL. (High)
3. **No WAF / Cloud Armor** on the public load balancer; **no global rate limiting** in the
   API. (High — DoS & brute force)
4. **No security scanning in CI** (no dependency audit, SAST, secret-scan, or image scan);
   **no Dependabot**. (High — supply chain)
5. **Live OTP + phone number logged in cleartext** by the console/SMS OTP senders. (Medium)
6. **No global `ValidationPipe`, no Helmet, wildcard Socket.IO CORS.** (Medium)
7. **Cloud SQL public IP enabled; Redis without in-transit TLS.** (Medium)
8. **No `SECURITY.md` / disclosure policy; no threat model** (this doc + a root policy fix it).

---

## 5. Remediation roadmap

Priorities: **P0** = do before/at the top of the next sprint (perimeter & critical); **P1** =
this sprint; **P2** = next sprint; **P3** = ongoing hardening. Each item is concrete enough to
turn into a ticket, with the file to change and the acceptance test.

### Implementation status

Much of this roadmap has now **landed in code** on this branch. Legend: ✅ implemented &
test-verified here · 🟨 implemented as code, needs `terraform apply` / a CI run / founder wiring to
take effect · ⬜ deferred (needs a vendor/platform not available in-repo).

| Item | Status | Notes |
|---|---|---|
| P0-1 JWT secret fail-closed | ✅ | `config/env.ts` prod boot-guard + tests |
| P0-2 Admin console auth | 🟨 | Fail-closed proxy-auth middleware shipped (`apps/admin/middleware.ts`); IAP/SSO+MFA is the founder step. Audit-log write path already existed (A-01) |
| P0-3 WAF / Cloud Armor | 🟨 | `infra/terraform/armor.tf` + backend attachment; needs `terraform apply` |
| P1-1 CI security scanning | 🟨 | `ci.yml` audit+gitleaks job, `codeql.yml`, `dependabot.yml`, minimized perms; runs on next CI |
| P1-2 Global rate limiting | ✅ | `ThrottleGuard` + `@Throttle` on refresh/order/offer/select + tests |
| P1-3 Edge headers / CORS / strict bodies | ✅ | `security-headers.middleware.ts`, `cors.ts` allow-list (HTTP + WS), strict auth zod + tests |
| P1-4 Log redaction | ✅ | OTP senders mask phone / drop code + tests |
| P1-5 IDOR sweep | ✅ (verified) | Ownership already enforced service-side (`getSnapshot(orderId, callerId)` etc.); no gap found |
| P2-1 Redis TLS | 🟨 | Opt-in via `redis_tls_enabled` (default off) + TLS-aware client; rollout in [SECURITY-OPS §E2](SECURITY-OPS.md) |
| P2-1 Private Cloud SQL | 🟨 | Gated `db_public_ip_enabled` + in-VPC Cloud Run migrate job (`release.yml` `DB_PRIVATE_ONLY`); rollout in [SECURITY-OPS §E1](SECURITY-OPS.md) |
| P2-2 GCS CORS tighten | 🟨 | Default flipped to `[]` (deny) in `variables.tf`; needs apply |
| P2-3 Pin JWT algorithm | ✅ | `token.service.ts` HS256 pinned + alg:none-rejection test |
| P2-4 Launch fail-closed guards | ✅ | `config/env.ts` rejects console OTP / test-phones / KYC-stub in prod + tests |
| P3-2 Secret rotation | ✅ (code) 🟨 (runbook) | Dual-secret JWT + hash-key separation in `token.service.ts`/`env.ts` + tests; [SECRET-ROTATION](SECRET-ROTATION.md) |
| P3-4 KYC bucket CMEK + retention | 🟨 | Gated `kyc_cmek_enabled` / `kyc_retention_days` (`kms.tf`, `storage.tf`); rollout in [SECURITY-OPS §E3](SECURITY-OPS.md) |
| P0-2 Admin SSO+MFA (IAP) · P3-1 mobile cert pinning · P3-3 Maps-key restriction · P3-5 WAF tuning · P3-6 pentest | 📋 | Precise founder/platform runbooks in [SECURITY-OPS](SECURITY-OPS.md); IR runbook in [IR-RUNBOOK](IR-RUNBOOK.md) |

The subsections below keep the full design detail (the "what & why & acceptance test") for each item.

### P0 — Critical (close first)

**P0-1 · Fail closed on a weak JWT signing secret**
`apps/api/src/config/env.ts:33,67`
- Remove the `.default("dev-insecure-secret-change-me-please")` fallback, or add a
  `superRefine` (next to the existing `REDIS_URL` guard) that **rejects boot in production**
  when `JWT_SIGNING_SECRET` is the known default, is < 32 chars, or is unset.
- Require ≥ 32 bytes of entropy. Consider a dedicated secret separate from the HMAC key used
  for OTP/refresh hashing (**key separation** — today `token.service.ts` reuses the JWT secret
  as the HMAC key; split them so rotating one doesn't invalidate the other).
- *Accept:* a prod boot with the default (or a short) secret throws
  `Invalid environment configuration` and the container never serves traffic.

**P0-2 · Real authentication + audit on the admin console**
`apps/admin/` (no `middleware.ts`, no login), `apps/admin/app/lib/api.ts:15`
- Put the console behind **per-operator identity** — Google Workspace SSO / OIDC (IAP in
  front of Cloud Run is the fastest GCP-native option), not a single shared `ADMIN_API_TOKEN`.
- Every privileged mutation (KYC approve/decline, ban, fare override, settlement pay) records
  **who** did it, when, and the before/after — an append-only admin audit log.
- Enforce MFA for admin identities. Network-restrict the console (IAP / VPC / allow-list) so
  it is not reachable from the open internet at all.
- *Accept:* an unauthenticated request to any admin page/action is rejected; every mutation
  is attributable to a named human in the audit log.

**P0-3 · WAF / Cloud Armor on the public load balancer**
`infra/terraform/lb.tf:46` (backend has no `security_policy`)
- Add a `google_compute_security_policy` (Cloud Armor) attached to the API backend service:
  per-IP rate limiting (adaptive), the preconfigured OWASP rulesets (SQLi/XSS/LFI), and a
  bot/geo posture appropriate for a Zimbabwe-first launch.
- *Accept:* a burst of requests from one IP is throttled at the edge before it reaches Cloud
  Run; a canned SQLi probe string is blocked with a 403 at the LB.

### P1 — High (this sprint)

**P1-1 · Security scanning in CI + Dependabot**
`.github/workflows/`, add `.github/dependabot.yml`
- Add to CI: `pnpm audit --audit-level=high` (fail on high/critical), **CodeQL** (JS/TS SAST),
  **Trivy** on the built API image, and **secret scanning** (gitleaks or GitHub secret
  scanning + push protection).
- Enable **Dependabot** for npm (weekly) and GitHub Actions.
- Pin GitHub Actions to commit SHAs (supply-chain).
- Lock `ci.yml` down with an explicit `permissions:` block (`contents: read`) — it currently
  inherits the broad default token.
- *Accept:* a PR that adds a package with a known-high CVE fails CI; a committed fake secret is
  blocked by push protection.

**P1-2 · Global rate limiting in the API**
`apps/api` (add `@nestjs/throttler` at `main.ts`/`app.module.ts`)
- Add a global `ThrottlerGuard` (Redis-backed, matching the existing OTP store) with sane
  per-route defaults, and **tighter limits on the sensitive unauthenticated / high-cost
  routes**: `POST /auth/refresh` (currently unauthenticated + unthrottled), `POST /orders`,
  `POST /orders/:id/offers`, `POST /orders/:id/offers/:offerId/select`, and issue/report/SOS
  creation.
- Keep the bespoke three-tier OTP limiter — it is good — but stop it being the *only* limiter.
- *Accept:* hammering `/auth/refresh` or `/orders` from one token/IP returns HTTP 429 after
  the threshold.

**P1-3 · Edge hardening: Helmet, CORS allow-list, ValidationPipe**
`apps/api/src/main.ts`, `apps/api/src/tracking/tracking.gateway.ts:64`
- Add **Helmet** for security headers (HSTS, `X-Content-Type-Options`, referrer policy, a
  conservative CSP for the JSON API).
- Replace the implicit CORS with an **explicit pinned origin allow-list** (mobile app origins
  + the admin console origin), and replace the Socket.IO `cors: { origin: "*" }` with the same
  allow-list.
- Add a **global `ValidationPipe`** (`whitelist: true, forbidNonWhitelisted: true,
  transform: true`) as a backstop so a controller that forgets its `ZodBody` pipe still can't
  accept unexpected fields; make zod object contracts `.strict()` on sensitive bodies.
- *Accept:* responses carry HSTS + `X-Content-Type-Options: nosniff`; a WS/HTTP request from an
  unlisted origin is refused; a body with an unknown field is rejected.

**P1-4 · Stop logging OTP codes and phone numbers**
`apps/api/src/auth/otp-sender.ts:94,105`
- Remove/redact the `DEV OTP for {phone}: {code}` (console sender) and `SMS OTP → {phone}:
  {code}` (SMS stub) log lines, or gate them behind `NODE_ENV !== "production"` **and** run
  them through the existing `phone-mask.ts` helper. Never log a live OTP at info level.
- Add a log-redaction middleware/serializer that masks `phone`, `otp`, `code`, `token`,
  `authorization`, and KYC identifiers platform-wide (defense in depth for future code).
- *Accept:* a production OTP request produces no log line containing the code or the full phone.

**P1-5 · Verify object-level authorization (IDOR sweep)**
`apps/api/src/{orders,offers,issues,reports,sos}/*.service.ts`
- The guards prove *authenticated*, not *authorized for this object*. Audit every
  `:id`-scoped route to confirm the service checks the caller is the order's customer or its
  assigned rider (the WS gateway already does this via `canAccessOrder` / `isAssignedRider` —
  mirror that everywhere). Add tests that a second user's token gets 403/404 on someone else's
  order, offer, issue, report.
- *Accept:* a cross-account access attempt on every `:id` route is denied by an automated test.

### P2 — Medium (next sprint)

**P2-1 · Network-isolate the datastores**
`infra/terraform/sql.tf:32`, `redis.tf`
- Move Cloud SQL to **private IP only** (`ipv4_enabled = false`); run CI migrations through the
  Cloud SQL Auth Proxy over private access or a short-lived authorized path instead of a
  standing public IP.
- Enable **Redis in-transit TLS** (`transit_encryption_mode = "SERVER_AUTHENTICATION"`) and
  switch the client to `rediss://` (`common/redis.ts`).
- *Accept:* the SQL instance has no public IP; Redis rejects a non-TLS client.

**P2-2 · Tighten CORS / signed-URL scope on storage**
`infra/terraform/variables.tf:94`, uploads flow
- Replace the GCS `cors` `["*"]` default with the real client origins.
- Keep signed-URL TTLs short (already 600s) and confirm the content-type pin (already done).
- *Accept:* the bucket CORS lists only known origins.

**P2-3 · Pin JWT algorithm**
`apps/api/src/auth/token.service.ts:28`
- Pass `{ algorithms: ["HS256"] }` to `jwt.verify` (defense in depth against algorithm
  confusion, even though `alg:none` is already rejected).
- *Accept:* a token signed with any other alg is rejected.

**P2-4 · Launch-hygiene fail-closed guards**
`apps/api/src/config/env.ts:39,45`
- Add a production `superRefine`: reject boot if `OTP_CHANNEL !== "whatsapp"` **or**
  `OTP_TEST_PHONES` is non-empty in production (today these are enforced only by a comment).
  Same treatment for `KYC_PROVIDER === "stub"` in production.
- *Accept:* a prod deploy with the test-phone OTP bypass enabled refuses to boot.

### P3 — Ongoing hardening

- **P3-1 · Mobile certificate pinning** for the API + WS host (`apps/mobile/src/api/client.ts`).
- **P3-2 · Secret rotation runbook** — scheduled rotation of `JWT_SIGNING_SECRET`
  (dual-secret window to avoid mass logout), DB password, vendor keys.
- **P3-3 · Restrict the client-side Google Places/Maps key** by package name + API in GCP.
- **P3-4 · GCS object encryption with CMEK** for the KYC bucket (customer-managed keys) and a
  retention/lifecycle policy that deletes KYC media on the legal minimum schedule.
- **P3-5 · WAF tuning + anomaly detection** once real traffic patterns exist.
- **P3-6 · Annual third-party penetration test** and a bug-bounty / disclosure program.

---

## 6. Defense-in-depth by layer

The roadmap above, organized as the concentric layers an attacker must each defeat.

```
        ┌──────────────────────────────────────────────────────────┐
  EDGE  │ Cloud Armor WAF · per-IP rate limit · TLS · HTTP→HTTPS    │  P0-3
        ├──────────────────────────────────────────────────────────┤
  APP   │ Helmet · CORS allow-list · global throttler ·            │  P1-2/3
        │ ValidationPipe · JWT (pinned, strong secret) · role guard │  P0-1
        ├──────────────────────────────────────────────────────────┤
  AUTHZ │ per-object ownership checks · admin SSO+MFA+audit         │  P0-2/P1-5
        ├──────────────────────────────────────────────────────────┤
  DATA  │ private SQL · Redis TLS · hashed secrets · private bucket │  P2-1
        │ · CMEK · least-privilege IAM · encryption in transit/rest │  P3-4
        ├──────────────────────────────────────────────────────────┤
 SUPPLY │ Dependabot · pnpm audit · CodeQL · Trivy · secret-scan ·  │  P1-1
        │ pinned actions · minimized workflow permissions           │
        ├──────────────────────────────────────────────────────────┤
 DETECT │ log redaction · audit log · alerting · IR runbook         │  §8
        └──────────────────────────────────────────────────────────┘
```

An attacker who gets past the WAF still meets rate limits; past those, a strong-secret JWT and
role checks; past those, per-object authorization; a compromised app pod still holds only
least-privilege cloud creds and hits private, encrypted datastores; and everything is logged,
redacted, and alertable. **No single defeated control is game over.**

---

## 7. Data protection & privacy

Lynia processes Zimbabwean national IDs, phone numbers, home addresses, and live location —
this is squarely within the **Zimbabwe Data Protection Act (2021)** and mirrors GDPR
principles. The controls:

- **Minimization** — collect only what the offer loop needs. KYC selfies/IDs live at the
  vendor (Didit) and as opaque object keys; we store the *decision* (`kycStatus`, `kycRef`),
  not the raw document, wherever possible.
- **Encryption in transit** — TLS everywhere user-facing (done); close the internal gaps
  (Redis TLS, private SQL — P2-1).
- **Encryption at rest** — GCS + Cloud SQL are encrypted by default; add **CMEK** for the KYC
  bucket so key custody is ours (P3-4).
- **Access control** — data is reachable only through the API's authenticated, authorized
  paths; media only via short-lived signed URLs namespaced by user; datastores private-IP.
- **Log hygiene** — no PII or secrets in logs (P1-4); platform-wide redaction serializer.
- **Retention & deletion** — define and enforce a retention schedule: KYC media deleted on the
  legal minimum; location traces (`OrderEvent`) aggregated/pruned after the operational window;
  a user-deletion path that tombstones PII while preserving financial-ledger integrity.
- **Third-party data flows** — WhatsApp, FCM, Didit each receive the minimum (a phone, a
  device token, an ID-verification session). Data-processing agreements on file; vendor keys
  are rotatable and least-scope.
- **Subject rights** — a documented process for access/deletion requests.

---

## 8. Detection, logging & incident response

"Unbreakable" operationally means **breaks are small and caught fast**. Lynia already has
OpenTelemetry ([OBSERVABILITY](OBSERVABILITY.md)); extend it for security.

**Detect / alert on:**
- Spikes in 401/403/429, OTP-request or refresh-token failure rates (credential stuffing / ATO).
- Cloud Armor blocks and rate-limit trips (attack in progress).
- Admin audit-log anomalies (bulk KYC approvals, off-hours bans/payouts).
- Failed KYC webhook signatures (spoof attempts).
- New/anomalous egress from the API pod (exfiltration).
- CI security-scan failures and new critical CVEs (supply chain).

**Log with discipline:** structured, redacted (P1-4), centralized, tamper-evident for the
admin audit trail, retained per policy.

**Incident response runbook (to author as `docs/IR-RUNBOOK.md`):**
1. **Detect & triage** — severity, scope, affected data classes.
2. **Contain** — revoke sessions (`Session.revokedAt` gives real logout/ban — already built),
   rotate the implicated secret, block at Cloud Armor, disable the affected route/flag.
3. **Eradicate & recover** — patch, redeploy (fast via the existing CD), verify.
4. **Notify** — meet Zimbabwe DPA breach-notification duties; notify affected users when their
   PII is involved.
5. **Post-mortem** — blameless, with a tracked action item that becomes a new control/test.

**Rehearse it** — a tabletop exercise per quarter; the runbook is only real if it's practiced.

---

## 9. Governance & the security lifecycle

- **Secure SDLC** — security review is a gate in the existing gstack flow (`/review` +
  `/security-review` on every substantive change). Threat-model new features that touch PII,
  money, or auth.
- **Dependency management** — Dependabot + `pnpm audit` in CI (P1-1); triage weekly.
- **Secret management** — all secrets in Secret Manager, injected at deploy; scheduled rotation
  (P3-2); never in source (enforced by secret scanning + push protection).
- **Access reviews** — quarterly review of who has admin, cloud IAM, and repo write.
- **Vulnerability disclosure** — publish a root `SECURITY.md` (added alongside this plan) so
  researchers can report responsibly; consider a bug bounty post-launch.
- **Penetration testing** — third-party pentest before scaling beyond the pilot, then annually.
- **Compliance** — track Zimbabwe DPA obligations; keep DPAs with WhatsApp/Meta, Google/FCM,
  and Didit current.

---

## 10. Acceptance criteria

This plan is "done" when each control is provable, not assumed. The gate:

| # | Control | Proof |
|---|---|---|
| P0-1 | Strong JWT secret enforced | Prod boot with the default/short secret fails; test in CI |
| P0-2 | Admin auth + audit | Unauth admin request rejected; every mutation attributable |
| P0-3 | WAF | SQLi probe → 403 at LB; per-IP flood throttled |
| P1-1 | CI security scanning | High-CVE PR fails; committed secret blocked by push protection |
| P1-2 | Global throttling | `/auth/refresh` & `/orders` flood → 429 |
| P1-3 | Edge headers/CORS/validation | HSTS present; foreign origin refused; unknown field rejected |
| P1-4 | Log redaction | No OTP/phone in prod logs (verified by log inspection + test) |
| P1-5 | No IDOR | Cross-account access denied on every `:id` route (automated tests) |
| P2-1 | Private datastores | SQL has no public IP; Redis rejects non-TLS |
| P2-4 | Launch fail-closed | Prod boot with test-OTP bypass or KYC stub refuses |

Each row becomes a tracked ticket and a test. Security is a **standing property proven on every
change**, not a one-time push — the CI gates (P1-1) are what keep this document true over time.

---

*Owner: engineering. Review cadence: re-audit each sprint and after any change to auth, admin,
infra, or a PII-touching flow. This is a living document — update it as controls land.*
