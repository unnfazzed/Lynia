# Lynia — Security Plan & Threat Model

> How Lynia is attacked, how it defends, and what we harden next. Production runs on **Azure**
> (`infra/azure/`); the platform-side runbooks are in [SECURITY-OPS](SECURITY-OPS.md) and owner
> commands in [AZURE-OWNER-RUNBOOK](AZURE-OWNER-RUNBOOK.md). It complements
> [ARCHITECTURE](ARCHITECTURE.md) (how the system is wired). P-numbers (P0-1 … P3-6) are cited from
> code and other docs; keep their meaning when you edit.

---

## 0. Framing

No connected system is unhackable. The goal is a system where:

1. **Every realistic attack path is closed or made expensive** — an attacker has to defeat several
   independent controls, not one.
2. **A single failure is contained** — one leaked token, one bad dependency or one misconfigured deploy
   does not hand over the platform.
3. **People's data is protected by default** — phone numbers, national IDs and KYC records, addresses,
   live location, prescriptions and handover codes are minimised, encrypted, access-controlled, and
   never in a log or a public bucket.
4. **We see attacks and can respond** — detection, alerting and a rehearsed incident runbook
   ([IR-RUNBOOK](IR-RUNBOOK.md)).

The correctness core (concurrency guards, hashed OTP/refresh tokens and codes, HMAC-verified KYC
webhook, keyless CI) is strong. The open gaps are at the edge: there is **no WAF** in front of
production, and the data tier still uses password and key auth.

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

| Asset | Sensitivity | Where it lives | Harm if breached |
|---|---|---|---|
| **National ID / KYC records & selfies** | **Critical** | Didit (vendor); rider photo in Blob `kyc/<userId>/…`; encrypted ID ciphertext + one-way hashes in `profiles` / `riders` | Identity theft; CDPA exposure; irreversible |
| **Prescriptions** (health data) | **Critical** | `order_prescriptions` (patient name, pharmacist note); images in Blob `rx/<customerId>/…` | Sensitive health data under the CDPA |
| **Phone numbers** | High (PII) | `profiles.phone`, Redis OTP keys, `top_ups.phone`, merchant invite / preferred-rider rows | Deanonymisation, SIM-swap targeting, fraud |
| **Addresses** | High (PII) | `orders.pickup/dropoff` JSON, `addresses` | Physical-safety risk |
| **Live location** | High | `riders.geog`, `order_events.lat/lng`, the WS stream | Real-time tracking of a person |
| **Handover codes** (delivery + pickup, 6 digits) | High (short-lived) | `orders.otp_hash` / `pickup_code_hash` (HMAC) + AES-GCM-sealed copies, cleared at terminal status | Parcel or food theft at handover |
| **Session & refresh tokens** | High | `sessions` (hashed), client Keychain/Keystore | Account takeover |
| **Commission wallet** | High (financial) | `commission_accounts`, `commission_ledger`, `top_ups` — live at 10% after a rider's first 10 jobs | Balance manipulation, free credit, fraud |
| **Merchant cash ledger** | High (financial) | `merchant_debt_ledger`, order money columns | Cash-return fraud |
| **Admin capability** (KYC override, ban, wallet credit, fare adjust) | Critical | Admin console behind Entra Easy Auth; `ADMIN_API_TOKEN` | Full platform control |
| **Signing, encryption and vendor keys** | Critical | Azure Key Vault, referenced by the container apps | Token forgery, PII decryption, vendor abuse |

**Data-classification rule:** every new field is tagged `Critical / PII / Internal / Public` at design
time, and the tag drives its handling. Every personal-data column must also be in the PII manifest
(`apps/api/src/privacy/pii-manifest.ts`), or a test fails. See [§7](#7-data-protection--privacy).

---

## 2. Who attacks us

Trust boundaries — every arrow crossing one is a place an attacker operates:

```
  ┌─ Untrusted internet ───────────────────────────────────────────────────┐
  │  external attacker · malicious customer / biker / merchant · bot        │
  └──────┬───────────────────────┬────────────────────────┬────────────────┘
         │ HTTPS/WSS             │ HTTPS                   │ HTTPS (SAS)
 ┌───────▼──────────┐  ┌─────────▼──────────┐   ┌──────────▼─────────┐
 │ API              │  │ Admin console      │   │ Blob Storage       │
 │ Container Apps   │  │ Container Apps     │   │ lynia-media        │
 │ external ingress │  │ + Entra Easy Auth  │   │ (public endpoint,  │
 │ (no WAF)         │  │                    │   │  private container)│
 └───────┬──────────┘  └─────────┬──────────┘   └────────────────────┘
         │ VNet (private)        │ admin token
 ┌───────▼───────────────────────▼──────────────────┐
 │ Postgres (private access) · Redis (private EP)    │
 │ Key Vault (RBAC only, public endpoint)            │
 └──────────────────────────────────────────────────┘
         │ outbound
 ┌───────▼───────────────────────────────┐
 │ Vendors: WhatsApp / Bird / local SMS · │ ◀── vendor compromise / webhook spoofing
 │ FCM / APNs · Didit                     │
 └────────────────────────────────────────┘
```

The customer web app (`app.lyniago.com`), the merchant app (`merchant.lyniago.com`) and the marketing
site are static assets on Cloudflare Workers. They hold no secrets and talk to the API directly.

| Actor | Motivation | Realistic capability |
|---|---|---|
| **External unauthenticated attacker** | Data theft, ransom, disruption | Hit any public endpoint, scrape, brute-force, flood, exploit a CVE |
| **Malicious customer** | Free deliveries, harass bikers, steal goods | Abuse the offer loop, IDOR, forge a handover |
| **Malicious biker** (KYC'd) | Fraud, stalking, dodge commission | Location abuse, fake completions, under-report fares |
| **Malicious merchant** | Cash fraud, data harvesting | Abuse the cash-return flow, scrape customer data |
| **Account-takeover attacker** | Impersonation | SIM-swap + OTP interception, stolen refresh token |
| **Compromised admin / insider** | Mass fraud, exfiltration | KYC override, ban rivals, credit wallets |
| **Supply-chain attacker** | Broad compromise | Malicious npm dependency, poisoned CI |
| **Vendor / webhook spoofer** | Forge KYC "verified" | Replay or forge the Didit callback, abuse a leaked vendor key |

---

## 3. Attack surface & STRIDE

Entry points (from [ARCHITECTURE §16](ARCHITECTURE.md#16-rest--websocket-surface)): REST controllers,
the Socket.IO gateway, the Didit and WhatsApp webhooks, direct-to-Blob SAS uploads, the admin console,
the mobile and web clients, the scheduled jobs, and CI/CD.

| STRIDE threat | Concrete Lynia scenario | Primary control | Status |
|---|---|---|---|
| **S**poofing | Forge a JWT with a weak secret | Prod boot rejects weak/default secrets; HS256 pinned | ✅ |
| **S**poofing | Spoof the Didit webhook → fake "verified" biker | HMAC over the canonical body + timestamp freshness, fail-closed | ✅ |
| **S**poofing | Forge the admin identity header | Header trusted only behind Easy Auth; allowlist applied only once Easy Auth is confirmed | ✅ |
| **S**poofing | Call the retention / wallet-integrity endpoints | `AdminOrSchedulerGuard` checks an Entra token carrying the `Scheduler.Invoke` role | ✅ |
| **T**ampering | SQL injection via geo/query params | Parameterized Prisma tagged templates; no `$queryRawUnsafe` | ✅ |
| **T**ampering | Act on another user's order (IDOR) | Per-object ownership checks in services | ✅ (P1-5) |
| **T**ampering | Double-credit or skip a commission debit | Unique keys on ledger rows + CAS; nightly integrity job | ✅ |
| **R**epudiation | Admin acts with no attributable identity | Entra per-operator sign-in + audit log | ✅ |
| **I**nfo disclosure | OTP or phone in logs | OTP senders mask the phone and drop the code | ✅ |
| **I**nfo disclosure | Public blob / broad CORS | Private container, user-delegation SAS, CORS limited to the merchant and customer-web origins | ✅ |
| **D**enial of service | Flood the API, offer loop or OTP | App-level throttling + OTP caps; **no edge WAF** | ⚠️ gap (P0-3) |
| **E**levation of privilege | Reach the admin API without the admin role | Server-side role guard on every admin route | ✅ |
| **E**levation of privilege | Over-broad cloud rights after an app compromise | Per-app managed identities; per-secret Key Vault roles; the deploy identity has no Owner | ✅ |

---

## 4. Current posture scorecard

### Strong — do not regress

- **Concurrency core** — guarded CAS + DB constraints across the offer loop, lifecycle, codes, KYC
  webhook and the wallet ledger ([ARCHITECTURE §13](ARCHITECTURE.md#13-concurrency-safety-model)).
- **Secrets at rest** — OTP codes, refresh tokens and handover codes stored as HMAC hashes; the "show
  the code" copy is AES-GCM-sealed under its own key and bound to its order; constant-time compares.
- **KYC webhook** — HMAC-SHA256 over the canonical body, `timingSafeEqual`, replay window, fail-closed.
  A reconciler re-reads decisions whose webhook was lost (`kyc/kyc-reconcile.service.ts`).
- **Network** — Postgres has no public endpoint (VNet-injected); Redis is TLS-only behind a private
  endpoint; migrations run in-VNet (`caj-lynia-migrate`).
- **Keys** — Key Vault in RBAC mode with purge protection; each identity can read only its own secrets;
  Terraform never generates the JWT, PII, token-hash or admin secrets (`bootstrap.sh` seeds them).
- **Storage** — shared keys off, so no account-key SAS; uploads use short-lived user-delegation SAS
  minted by the API's managed identity, namespaced by owner, content-type pinned.
- **Transport** — Container Apps ingress refuses plain HTTP (`allow_insecure_connections = false`);
  managed certificates; TLS 1.2 minimum on Blob; `sslmode=require` to Postgres.
- **CI** — OIDC federated credentials only; no stored cloud keys; workflows never read a secret value.
- **Mobile** — tokens in `expo-secure-store`, single-flight refresh, release build refuses a localhost API.
- **Fail-closed launch config** — the API refuses to boot in production with console OTP, test phones,
  the KYC stub in auto mode, or Didit without its keys (`apps/api/src/config/env.ts`).

### Gaps

1. **No WAF or edge rate limiting.** Cloudflare is DNS-only for the API and admin hosts, and
   `infra/azure` has no Front Door or Application Gateway. (High — DoS & brute force)
2. **Password / key auth on the data tier.** The Postgres admin password and Redis access key are in
   Terraform state and inside `DATABASE-URL` / `REDIS-URL` (accepted exceptions S1 #1–#2). (Medium)
3. **Key Vault and Blob have public endpoints.** Both are RBAC/SAS-only, with no private endpoint.
   Blob must stay public for direct uploads; the vault's is a cost choice. (Low–Medium)
4. **No customer-managed key and no lifecycle rule on Blob** (P3-4). Versioning keeps previous versions
   of deleted blobs; see [DATA-RETENTION](DATA-RETENTION.md). (Medium — privacy)
5. **Certificate pinning not armed** (P3-1). (Low)

---

## 5. Remediation roadmap

Legend: ✅ in place · 🟨 partial or needs owner action · ⬜ open.

| Item | Status | Notes |
|---|---|---|
| P0-1 JWT secret fail-closed | ✅ | `config/env.ts` prod boot guard; dual-secret rotation (`JWT_SIGNING_SECRET_PREVIOUS`) |
| P0-2 Admin console auth | ✅ | Entra Easy Auth on `ca-lynia-admin` + fail-closed middleware (`apps/admin/middleware.ts`) + operator allowlist + audit log. [SECURITY-OPS §A](SECURITY-OPS.md) |
| P0-3 WAF / edge rate limit | ⬜ | None on Azure; in-app throttling only. [SECURITY-OPS §D](SECURITY-OPS.md) |
| P1-1 CI security scanning | ✅ | `ci.yml` gitleaks + osv-scanner (high+), `codeql.yml`, `dependabot.yml` |
| P1-2 Global rate limiting | ✅ | `ThrottleGuard` + `@Throttle` per route; OTP caps per phone/IP/day/device |
| P1-3 Edge headers / CORS / strict bodies | ✅ | `security-headers.middleware.ts`, `cors.ts` allow-list (HTTP + WS), strict zod |
| P1-4 Log redaction | ✅ | OTP senders mask the phone and drop the code |
| P1-5 IDOR sweep | ✅ | Ownership enforced service-side |
| P2-1 Private Postgres | ✅ | Private access only; in-VNet migrations. Entra DB auth open. [SECURITY-OPS §E1](SECURITY-OPS.md) |
| P2-1 Redis TLS | ✅ | TLS only, private endpoint. Entra auth open. [SECURITY-OPS §E2](SECURITY-OPS.md) |
| P2-2 Storage CORS | ✅ | Allowed origins are the merchant and customer-web hosts only (`infra/azure/data.tf`) |
| P2-3 Pin JWT algorithm | ✅ | HS256 pinned in `token.service.ts` |
| P2-4 Launch fail-closed guards | ✅ | `config/env.ts` + `release-azure.yml`'s launch-hygiene preflight |
| P3-1 Mobile cert pinning | 🟨 | Gated plugin, inert until `LYNIA_TLS_PINS` is set. [SECURITY-OPS §C](SECURITY-OPS.md) |
| P3-2 Secret rotation | ✅ code / 🟨 runbook | [SECRET-ROTATION](SECRET-ROTATION.md) |
| P3-3 Maps-key restriction | 🟨 | Owner console task. [SECURITY-OPS §B](SECURITY-OPS.md) |
| P3-4 Media encryption + retention | ⬜ | Platform-managed keys only; no lifecycle rule. [SECURITY-OPS §E3](SECURITY-OPS.md) |
| P3-5 WAF tuning | ⬜ | Blocked on P0-3 |
| P3-6 Pentest / disclosure | 🟨 | Root `SECURITY.md` disclosure policy exists; no pentest yet. [SECURITY-OPS §F](SECURITY-OPS.md) |

### P0 — Critical

**P0-1 · Fail closed on a weak JWT signing secret.** Production boot rejects a default, short or unset
`JWT_SIGNING_SECRET` (and a weak `_PREVIOUS`). Token hashing uses its own `TOKEN_HASH_SECRET`; PII
encryption its own `PII_ENCRYPTION_KEY`. *Accept:* a prod boot with a weak secret throws and never serves.

**P0-2 · Real authentication + audit on the admin console.** Per-operator Microsoft Entra sign-in in
front of the console (assignment required, named operators only). The middleware fails closed without an
asserted identity and forwards it to the API; every privileged mutation writes an audit row naming the
operator. Enforce MFA in Entra. *Accept:* an unauthenticated request never renders a page; every mutation
is attributable.

**P0-3 · WAF / edge rate limiting.** Put a WAF with per-IP rate limiting and OWASP rules in front of the
API (Front Door, Application Gateway, or Cloudflare proxying). It must keep the managed certificate and
`TRUST_PROXY=1` (one hop) working. *Accept:* a single-IP burst is throttled before the app; a canned
SQLi probe gets a 403 at the edge.

### P1 — High

**P1-1 · Security scanning in CI + Dependabot.** Done; the dependency policy is in §9.

**P1-2 · Global rate limiting.** Done. Redis-backed `ThrottleGuard` with tighter limits on refresh,
order create, offers, select, code entry, top-ups, and issue/report/SOS creation.

**P1-3 · Edge hardening.** Done. Security headers, an explicit CORS allow-list for HTTP and Socket.IO,
strict request bodies.

**P1-4 · Stop logging OTP codes and phone numbers.** Done.

**P1-5 · Object-level authorization.** Done. `:id` routes check the caller's relation to the object
(the order's customer, its assigned rider, or a member of its merchant).

### P2 — Medium

**P2-1 · Network-isolate the datastores.** Done on Azure: private Postgres, Redis private endpoint, TLS.
Remaining: Entra auth for Postgres and Redis, to take the passwords out of state.

**P2-2 · Tighten storage CORS / SAS scope.** Done.

**P2-3 · Pin JWT algorithm.** Done.

**P2-4 · Launch-hygiene fail-closed guards.** Done, in the API and in the release preflight.

### P3 — Ongoing hardening

- **P3-1 · Mobile certificate pinning** — [SECURITY-OPS §C](SECURITY-OPS.md).
- **P3-2 · Secret rotation** — [SECRET-ROTATION](SECRET-ROTATION.md).
- **P3-3 · Restrict the client-side Google Maps/Places keys** by package name, referrer and API.
- **P3-4 · Media encryption and retention** — decide on a customer-managed key; add a Blob lifecycle
  policy that removes previous versions and ages out KYC media.
- **P3-5 · WAF tuning + anomaly detection** once P0-3 lands.
- **P3-6 · Third-party penetration test** and a disclosure / bug-bounty program.

---

## 6. Defense-in-depth by layer

```
        ┌──────────────────────────────────────────────────────────┐
  EDGE  │ TLS-only ingress · managed certs · (WAF: missing, P0-3)   │
        ├──────────────────────────────────────────────────────────┤
  APP   │ security headers · CORS allow-list · throttling ·         │  P1-2/3
        │ strict zod bodies · JWT (pinned, strong secret) · roles   │  P0-1
        ├──────────────────────────────────────────────────────────┤
  AUTHZ │ per-object ownership · Entra admin SSO + audit            │  P0-2/P1-5
        ├──────────────────────────────────────────────────────────┤
  DATA  │ private Postgres · Redis TLS + private EP · hashed and    │  P2-1
        │ sealed codes · private blob + delegation SAS · Key Vault  │  P3-4
        ├──────────────────────────────────────────────────────────┤
 SUPPLY │ Dependabot · osv-scanner · CodeQL · gitleaks · OIDC CI    │  P1-1
        ├──────────────────────────────────────────────────────────┤
 DETECT │ log redaction · audit log · Azure Monitor alerts · IR     │  §8
        └──────────────────────────────────────────────────────────┘
```

---

## 7. Data protection & privacy

Lynia processes national IDs, phone numbers, addresses, live location and prescriptions. That is
squarely within Zimbabwe's **Cyber and Data Protection Act (2021)**.

- **Minimisation** — KYC documents live at Didit; we store the decision, the session reference and
  one-way hashes. Retention windows are in [DATA-RETENTION](DATA-RETENTION.md).
- **Encryption in transit** — TLS on every hop: client → ingress, app → Postgres (`sslmode=require`),
  app → Redis (TLS), app and clients → Blob (HTTPS only).
- **Encryption at rest** — Postgres, Redis and Blob use Azure platform-managed encryption. National-ID
  numbers and sealed codes are also encrypted by the app (`PiiCryptoService`). No customer-managed key
  yet (P3-4).
- **Access control** — data only through the API's authenticated, authorised paths; media only through
  short-lived SAS URLs namespaced by owner. Prescription images are readable only by the customer, the
  pharmacy they ordered from, and support.
- **KYC is fully automatic.** Didit decides. Our face-match threshold (`KYC_THRESHOLDS` in
  `packages/shared/src/policy.ts`, one cut at 0.60) can only tighten its verdict. There is no
  human-review band: Didit's "In Review" and a sub-threshold score are declines
  (`kyc/didit-decision.ts`). Admins keep an audited override (`POST /admin/riders/:profileId/kyc`) as
  a support backstop.
- **KYC on erasure** — the rider row keeps only the one-way hashes and the decision; credentials,
  `kyc_ref`, the verified-ID ciphertext and the vendor status are nulled, and the KYC photo is deleted.
  After commit the API asks Didit to delete the rider's **current** session (best-effort). A failure is
  logged at ERROR with the session id and must be deleted by hand in the Didit console. Sessions an
  earlier retry replaced fall to Didit's own retention.
- **Log hygiene** — no PII or secrets in logs.
- **Third-party flows** — WhatsApp, Bird, the local SMS gateway, FCM/APNs and Didit each receive the
  minimum (a phone, a device token, a verification session).
- **Subject rights** — self-service erasure (`DELETE /auth/me`); the privacy notice is generated from
  the PII manifest (`apps/api/src/legal/legal.content.ts`).

---

## 8. Detection, logging & incident response

**Alerts in place** (`infra/azure/monitoring.tf`): scheduled-job failures and missed runs, Postgres
active connections above 40, and a budget alert. Logs go to Log Analytics with a daily ingestion cap.

**Should also alert on:** spikes in 401/403/429; OTP-request and refresh-failure rates; failed KYC
webhook signatures; admin audit anomalies (bulk KYC overrides, off-hours wallet credits); nonzero
wallet-integrity drift (`wallet_integrity_drift_total`); new critical CVEs.

**Incident response** — [IR-RUNBOOK](IR-RUNBOOK.md): triage, contain (revoke sessions, rotate the
secret in Key Vault, roll back with `rollback-azure.yml`), recover, notify under the CDPA, post-mortem.

---

## 9. Governance & the security lifecycle

- **Secure SDLC** — `/review` and `/security-review` on substantive changes. Threat-model features that
  touch PII, money or auth.
- **Dependency management** — Dependabot + `osv-scanner` in CI (P1-1, fails on any CVSS ≥ 7 in
  `pnpm-lock.yaml` or the website's npm deploy lockfile, `apps/website/deploy/package-lock.json`);
  triage weekly. Fixes go in as range-scoped `pnpm.overrides` in the root `package.json`; for the
  deploy lockfile, as npm `overrides` in `apps/website/deploy/package.json`, keyed to the
  vulnerable range (`"undici@>=7.0.0 <7.29.1"`) so the entry goes inert once a wrangler bump brings
  a fixed version. **Note:** pnpm applies one override per package name — a stale entry for an
  already-upgraded major silently shadows a newer one, so replace those entries rather than
  stacking them. When upstream has no compatible fix, a **time-boxed** exception goes in
  [`osv-scanner.toml`](../osv-scanner.toml) with the reachability argument and a mandatory
  `ignoreUntil`, so the gate re-fires on expiry instead of the exception becoming permanent.
- **Secret management** — all runtime secrets in Key Vault, referenced (versionless) by the container
  apps; rotation per [SECRET-ROTATION](SECRET-ROTATION.md); never in source (secret scanning).
- **Access reviews** — quarterly review of Entra operators, Azure role assignments and repo write.
- **Vulnerability disclosure** — root [`SECURITY.md`](../SECURITY.md).
- **Penetration testing** — third-party test before scaling, then annually.
- **Compliance** — track CDPA obligations; keep processing agreements with Meta, Bird, Google/FCM,
  Apple and Didit current.

---

## 10. Acceptance criteria

| # | Control | Proof |
|---|---|---|
| P0-1 | Strong JWT secret enforced | Prod boot with a weak secret fails; test in CI |
| P0-2 | Admin auth + audit | Unauthenticated admin request goes to sign-in; every mutation attributable |
| P0-3 | WAF | SQLi probe → 403 at the edge; per-IP flood throttled (**open**) |
| P1-1 | CI security scanning | High-CVE PR fails; committed secret caught |
| P1-2 | Global throttling | `/auth/refresh` and `/orders` flood → 429 |
| P1-3 | Edge headers/CORS/validation | HSTS present; foreign origin refused; unknown field rejected |
| P1-4 | Log redaction | No OTP/phone in prod logs |
| P1-5 | No IDOR | Cross-account access denied on every `:id` route |
| P2-1 | Private datastores | Postgres has no public endpoint; Redis rejects non-TLS |
| P2-4 | Launch fail-closed | Prod boot with the test-OTP bypass or the KYC stub refuses |

*Owner: engineering. Re-audit after any change to auth, admin, infra or a PII-touching flow.*
