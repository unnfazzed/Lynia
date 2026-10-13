# Security Operations Runbook

The security controls that live in the platform or a vendor console rather than in the code. Companion to
[SECURITY.md](SECURITY.md) (the plan and its P0–P3 roadmap). Production runs on **Azure** (`infra/azure/`);
founder commands live in [AZURE-OWNER-RUNBOOK.md](AZURE-OWNER-RUNBOOK.md).

Section letters are cited from code and other docs. Keep their meaning when you edit.

---

## A. Admin console SSO + MFA (P0-2)

The console **fails closed** without a proxy-asserted operator identity (`apps/admin/middleware.ts`,
`apps/admin/app/lib/console-auth.ts`) and forwards that identity to the API as `x-lynia-operator`.

**Production: Azure Easy Auth + Microsoft Entra (`ca-lynia-admin`).** Follow `infra/azure/README.md`
**Step 6**. `infra/azure/admin-auth.sh` creates the Entra app (Assignment required = Yes, only named
operators assigned) and its Key Vault client secret. The Terraform apply turns Easy Auth on
(`containerapps.tf`, `admin_auth`), and the app reads the operator from `x-ms-client-principal-name`.
`deploy-admin-azure.yml` applies `ADMIN_CONSOLE_ALLOWED_OPERATORS` only once Easy Auth is confirmed.

- **Never set that allowlist on an app without Easy Auth in front.** The header is then forgeable, and an
  allowlisted email becomes a password anyone can type (`docs/KNOWN_BUGS.md` ADM-11).
- **Enforce MFA in Entra** (security defaults, or Conditional Access).
- To remove an operator: unassign them from the Entra app (Enterprise applications → the app → Users and
  groups) and drop them from `ADMIN_CONSOLE_ALLOWED_OPERATORS`.

The middleware still supports GCP IAP JWT verification (`app/lib/iap-jwt.ts`, enabled only by
`ADMIN_CONSOLE_IAP_AUDIENCE`). Production does not use it.

*Verify:* an unauthenticated request to `admin.lyniago.com` is redirected to Microsoft sign-in before any
page renders; an operator's actions appear attributed in the admin audit log.

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
> `docs/archive/MOB-MAP-02-RUNBOOK.md` §4. **Prefer it to hand-editing the console** — a hand-edit is what
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
   > its own *app signing* certificates, none of which is the EAS-managed *upload* keystore. A key
   > allowlisted for the upload certificate alone renders tiles perfectly in a sideloaded APK and
   > returns `Authorization failure` — a blank grey map — in every Play-installed build.
   >
   > **And Play signs this app with THREE certificates.** `zw.co.lynia` is enrolled in Play's
   > quantum-ready hybrid signing, so which certificate a phone runs the app under depends on its
   > Android version. Google's instruction is to register all three with every API provider:
   >
   > | Certificate (Play's file name) | Phones that run under it | SHA-1 |
   > |---|---|---|
   > | `deployment_cert.der` | **Android 16 and older** (most phones) | `93:56:8F:5C:4A:A0:1E:3C:B9:CF:E9:8D:9F:73:0B:FE:74:9E:30:A9` |
   > | `hybrid_classical_cert.der` | Android 17 and newer | `35:0F:72:18:13:30:A8:A1:4F:69:5F:E7:EB:AE:B1:6D:76:C6:FC:08` |
   > | `hybrid_pqc_cert.der` | Android 17 and newer | `ED:43:68:09:A6:AB:A4:D8:F9:52:99:18:61:5A:E1:75:8B:A2:C0:5F` |
   > | `upload_cert.der` (EAS keystore) | sideloaded EAS builds only | `C7:D2:78:02:94:1B:2C:A9:6A:85:4C:43:27:C9:DE:EE:7A:BC:FB:9F` |
   >
   > List all of them against `zw.co.lynia`. The Play Console page (**Protected with Play → App
   > signing**) labels the hybrid one *Classical key*, and until 2026-10-06 this section called it "the
   > one devices actually run". Only that one was on the key, so every phone on Android 16 or older drew
   > a blank map (`MOB-MAP-04` in `docs/KNOWN_BUGS.md`). To read them yourself, download the
   > certificates from that page and run `openssl x509 -inform DER -noout -fingerprint -sha1` on each.
   > The list the tooling reads is `scripts/play-signing-certs.mjs`; update it if Play's certificates
   > ever change.
   >
   > **Confirm without a cable:** GitHub → Actions → **Maps Key Doctor** → Run workflow, leaving `sha1`
   > empty. It tests every Play certificate against the live key's allowlist (through a Places API (New)
   > call made with the Maps key, the one web call that reaches the allowlist on this project) and
   > prints `ALLOWLIST_OK`, or names each missing certificate. `workflow_dispatch`, so it runs from a
   > phone. (`adb logcat | grep -i "Google Android Maps SDK"` prints the certificate a given phone
   > presents, if you have a terminal and a cable.) Ordered fix: `docs/archive/MOB-MAP-02-RUNBOOK.md`. See also
   > `MOB-MAP-02` and `MOB-MAP-04` in `docs/KNOWN_BUGS.md`.
2. The **Places** key → **Application restrictions: None** (a client-side key can't be IP-restricted).
   Compensate with a tight **API restriction** (**Places API (New)** *only*, `places.googleapis.com`)
   and a hard **quota cap**.
3. Set a **quota cap** on both so a leaked key can't run up an unbounded bill.
4. Keep a separate, server-restricted key for any server-side Google calls.

*Verify:* the Maps key lets every Play certificate through and refuses an unlisted one; the Places key
returns real predictions (not `PERMISSION_DENIED`) and is refused for any non-Places API. **Maps Key
Doctor** checks both from a phone: its allowlist section prints `ALLOWLIST_OK` for the Play certificates
(pass a junk SHA-1 in `sha1` to see `NOT_ALLOWED`), and its Places section sends the app's own request
for "westgate" and prints `OK` with Google's top suggestion, or names the cause (suspended project / API
not enabled / API or app restriction / billing).

---

## C. Mobile certificate pinning (P3-1)

Pinning stops a man-in-the-middle with a rogue or compromised CA from reading app traffic. It is also the
easiest way to brick the app: if the pinned key changes without an app update, no installed app can reach
the API, and only a store update fixes it.

### What exists

- `apps/mobile/plugins/with-certificate-pinning.js` pins the API host (`extra.apiUrl` in `app.config.ts`,
  so `api.lyniago.com`; subdomains are not included). Android gets a `network_security_config` `<pin-set>`;
  iOS gets `NSPinnedDomains` with `NSPinnedCAIdentities`. Socket.IO connects to the same host.
  The app's runtime URL can be overridden by `EXPO_PUBLIC_API_URL` (`apps/mobile/src/config.ts`); a build
  that points it at another host leaves that host unpinned.
- It is **inert until armed.** `app.config.ts` loads the plugin only when `LYNIA_TLS_PINS` is set.
- When armed it **refuses to build** with fewer than two pins, a malformed pin, or a missing
  `LYNIA_TLS_PIN_EXPIRATION` (YYYY-MM-DD). Past that date Android stops enforcing the pins, so a missed
  rotation degrades to "unpinned" instead of "bricked". iOS has no such valve.
- `apps/mobile/scripts/compute-tls-pins.sh [host:port]` prints the SPKI pin of every certificate in the
  live chain, labelled leaf / intermediate / root.
- Pinning is native. It is not OTA-able: arming or disarming needs a new EAS build and a store release.
- Status: **not armed.** No workflow or `eas.json` profile sets `LYNIA_TLS_PINS`.

### What the pins would point at today

`api.lyniago.com` is a Cloudflare **DNS-only** CNAME to the Azure Container App, with Azure's free
**Container Apps managed certificate** bound to it (`.github/workflows/dns-bind-azure.yml`; the orange-cloud
proxy is off because it breaks that certificate). So the app sees Azure's managed certificate, not a
Cloudflare or Google one. Azure issues and renews it automatically, and we do not choose its CA. The
issuing CA has not been checked from this repo (expected to be DigiCert; **unverified**).

The old guidance (Google-managed certificate on a GCP load balancer, pin Google Trust Services roots) no
longer applies. Any pins computed before the Azure cutover are wrong.

### Before anyone arms `LYNIA_TLS_PINS`

1. **Re-derive the chain from the live host**, from a machine with direct egress (not through a proxy):
   `./apps/mobile/scripts/compute-tls-pins.sh api.lyniago.com:443`. Record the issuing intermediate and root.
2. **Confirm with Microsoft which CA(s) Container Apps managed certificates can be issued from**, and
   whether that can change at renewal. If it can, pin every root it may use.
3. **Pick at least two pins: never the leaf.** Leaf keys change on every renewal. Use the root that issues
   today plus a backup root (another root of the same CA, or the alternative CA's root). An intermediate
   pin is only safe if a root pin backs it up.
4. **Decide whether to bring the certificate under our control first.** A certificate we upload (our own
   key, our own CA choice) can be pinned to a backup key we hold offline. A managed certificate cannot.
5. **Set the build env** on the release profile only (EAS environment variables): `LYNIA_TLS_PINS` =
   `sha256/<b64>=,sha256/<b64>=` and `LYNIA_TLS_PIN_EXPIRATION` a few months out. Refresh the date every
   release.
6. **Validate on a real device** with a native build:
   - positive: sign in, place an order, watch live tracking;
   - negative: put the phone behind an intercepting proxy (mitmproxy/Charles) whose CA the phone trusts.
     The pinned build must fail to connect. If it still works, pinning is not active; do not ship.
7. **Roll out to a small cohort first**, never 100% in the release that introduces it.

**Rotation.** Before a CA change, ship a release that pins both the old and new roots; drop the old one a
release later. **Rollback:** unset `LYNIA_TLS_PINS` and ship a new native build. There is no OTA rollback.

---

## D. Edge WAF and rate limiting (P3-5)

**There is no WAF in front of production today.** The GCP Cloud Armor policy (`infra/terraform/armor.tf`)
died with the GCP project. Azure has no replacement in `infra/azure/`:

- The API, admin and merchant apps use plain Container Apps external ingress (`containerapps.tf`). No Front
  Door, Application Gateway or ingress IP restrictions are configured.
- `api.lyniago.com` and `admin.lyniago.com` are Cloudflare **DNS-only**, so Cloudflare's WAF and rate
  limiting do not see that traffic either.

What protects the API now is in the app:

- per-route rate limits (`apps/api/src/common/throttle.guard.ts` + `@Throttle`), backed by Redis;
- OTP send caps per phone, per IP, per day and per device (`OTP_RL_*` in `apps/api/src/config/env.ts`);
- security headers and a CORS allowlist (`common/security-headers.middleware.ts`, `common/cors.ts`).

Adding an edge WAF is an open Phase 8 item in `docs/plans/2026-09-24-gcp-to-azure-migration.md`. Whatever
is chosen must not proxy TLS in a way that breaks the managed certificate (§C) or `TRUST_PROXY=1` (one hop,
`containerapps.tf`).

---

## E. Data-tier hardening (P2-1, P3-4)

What `infra/azure/data.tf` sets today. All of it is on by default; there are no gated switches.

### E1. Private Postgres (P2-1)

- PostgreSQL Flexible Server 16, **private access only**: VNet-injected into `snet-pg`, resolved through a
  private DNS zone, `public_network_access_enabled = false`.
- Migrations run inside the VNet as the `caj-lynia-migrate` Container Apps job (`jobs.tf`), started by
  `release-azure.yml`.
- Connections use `sslmode=require` (`keyvault.tf`, `DATABASE-URL`).
- **Open:** password auth. The admin password is generated by Terraform and sits in state and in
  `DATABASE-URL` (accepted exception S1 #1). Moving to Entra auth is Phase 8.

### E2. Redis in-transit TLS (P2-1)

- Azure Managed Redis, `client_protocol = "Encrypted"` (TLS only, port 10000), `REDIS_URL` is `rediss://`.
- Public network access disabled; reached through a private endpoint in `snet-pe`.
- Non-clustered and `NoEviction`, because BullMQ needs both.
- **Open:** access-key auth is on, and the key sits in state and in `REDIS-URL` (accepted exception S1 #2).
  Entra auth is Phase 8. High availability is off.

### E3. Media storage encryption and retention (P3-4)

- One storage account, private container `lynia-media`. Shared keys are off; uploads and reads use
  **user-delegation SAS** minted with the API's managed identity. HTTPS only, TLS 1.2 minimum.
- The public endpoint stays on, because phones and the merchant browser PUT/GET blobs directly with a SAS.
- Blob versioning on; deleted blobs and containers are recoverable for 14 days. Replication is LRS.
- Encryption at rest uses Azure's platform-managed keys. **There is no customer-managed key** (the GCP
  CMEK option has no Azure equivalent configured).
- **No storage lifecycle rule.** Retention is enforced by the app: `caj-lynia-retention` (daily, `jobs.tf`)
  calls `POST /admin/retention/purge`.

---

## F. Penetration test & bug bounty (P3-6)

- **Before scaling past the pilot**, commission a third-party pentest. Scope: the API
  ([REST/WS surface](ARCHITECTURE.md#16-rest--websocket-surface)), auth/offer-loop/lifecycle abuse,
  IDOR across `:id` routes, the admin console, the KYC webhook, and the mobile app. Re-test annually.
- Keep the responsible-disclosure path open (root [`SECURITY.md`](../SECURITY.md)); consider a bug
  bounty once the surface stabilizes.
- Fix findings by severity; each fix ships with a regression test.

---

## Quick reference: where each control lives

| Control | Code / config |
|---|---|
| Console fail-closed gate | `apps/admin/middleware.ts`, `apps/admin/app/lib/console-auth.ts` |
| Console sign-in (Easy Auth) | `infra/azure/containerapps.tf` (`admin_auth`), `infra/azure/admin-auth.sh` |
| Edge WAF | none (§D) |
| App rate limiting | `apps/api/src/common/throttle.guard.ts` + `@Throttle` |
| Security headers / CORS | `apps/api/src/common/{security-headers.middleware,cors}.ts` |
| Boot fail-closed guards | `apps/api/src/config/env.ts` |
| Secret storage and rotation | Key Vault (`infra/azure/keyvault.tf`) + [SECRET-ROTATION](SECRET-ROTATION.md) |
| Private Postgres / Redis TLS / media storage | `infra/azure/{data,network}.tf` |
| Certificate pinning (inert) | `apps/mobile/plugins/with-certificate-pinning.js`, `apps/mobile/scripts/compute-tls-pins.sh` |
| CI security scanning | `.github/workflows/{ci,codeql}.yml`, `.github/dependabot.yml` |
