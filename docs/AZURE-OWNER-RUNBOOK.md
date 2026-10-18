# Owner runbook (Azure)

The founder's and operator's commands for running LyniaGo in production, in one place. Claude sessions do
the code, CI and checks; the steps here need your accounts, your approval or a vendor console. Each step
says **where**, **what to paste**, and **what you should see**.

How releases work (OTA, Play tracks, the API canary, rollback) is in
[`LAUNCH-DEPLOYMENT-STRATEGY.md`](LAUNCH-DEPLOYMENT-STRATEGY.md). Infra detail is in
[`infra/azure/README.md`](../infra/azure/README.md). Play Console history is in
[`PLAY-STORE-SUBMISSION.md`](PLAY-STORE-SUBMISSION.md).

**Where things run (2026-10-12)**

| What | Where | Deployed by |
|---|---|---|
| API `api.lyniago.com` | Azure Container Apps `ca-lynia-api`, South Africa North | `release-azure.yml`, every merge to `main` |
| Admin console `admin.lyniago.com` | Azure Container Apps `ca-lynia-admin`, behind Microsoft Entra sign-in | `deploy-admin-azure.yml` |
| Merchant web `merchant.lyniago.com` | Cloudflare (static export) | `deploy-merchant-web.yml` |
| Customer web `app.lyniago.com` (iPhone users) | Cloudflare | `deploy-customer-web.yml` |
| Website `lyniago.com` | Cloudflare | `deploy-website.yml` |
| Android app | Play **Closed testing** track | `mobile-release.yml`, `mobile-ota.yml`, `mobile-submit.yml` |

Database: Azure PostgreSQL Flexible Server (private, VNet only). Photos: Azure Blob container `lynia-media`.
Secrets: Azure Key Vault. Scheduled jobs: `caj-lynia-retention` and `caj-lynia-wallet-integrity`
(`infra/azure/jobs.tf`).

Two rules for every Cloud Shell step:
- Cloud Shell forgets everything between sessions. Sign in to GitHub again (`gh auth login`) each time.
- If the prompt starts with `PS`, you're in PowerShell. Type `bash` first.

---

## 1. Azure migration: what is done, what is left

Verified against the workflow runs and the plan (`docs/plans/2026-09-24-gcp-to-azure-migration.md`).

- [x] Azure subscription, MFA, budget; `infra/azure/bootstrap.sh` (state store, Key Vault, CI identities,
      app secrets, base Variables, `main`-only environments).
- [x] Staging retired (one Container Apps environment per region; decision 2026-09-25). The checks ran on
      production before the DNS switch.
- [x] Production infrastructure: **Terraform apply (Azure)** runs from 2026-09-25 onward.
- [x] Production releases armed: **Release (Azure)** deploys every merge to `main`.
- [x] DNS and certificates for `api` and `admin`: **DNS + bind (Cloudflare → Azure)**, 2026-09-25/26.
- [x] Installed apps point at `api.lyniago.com`: `mobile-ota.yml` inlines `EXPO_PUBLIC_API_URL`.
- [x] `merchant.lyniago.com` moved off Azure to Cloudflare (`deploy-merchant-web.yml`).
- [ ] Admin sign-in through Microsoft Entra (`infra/azure/admin-auth.sh`; see §7). Not verifiable from
      the repo: the latest **Deploy Admin Console (Azure)** summary must say *allowlist applied*.
- [ ] Play Console → App content: privacy policy `https://api.lyniago.com/legal/privacy` and account
      deletion `https://api.lyniago.com/legal/account-deletion` (open in `PLAY-STORE-SUBMISSION.md` §9).
- [ ] Didit and Bird webhook URLs on the new host. Not verifiable from the repo; check each console:
      Didit → `https://api.lyniago.com/kyc/callback`.
- [ ] Plan Phase 8: remove the dead GCP workflows (`release.yml`, `rollback.yml`, `deploy-staging.yml`,
      `deploy-admin.yml`, `gcp-*.yml`, `terraform-apply.yml`) and `infra/terraform/`.
- [ ] GCP exit: when Google billing is fixed, settle the balance, then delete project `lynia-500911`
      (plan §9 "GCP exit checklist"). That removes the old personal data held there.
- [ ] Legal (Q8): the POTRAZ 24-hour notice question stays with you and counsel.

---

## 2. Everyday operations

| I want to… | Do this |
|---|---|
| Ship an API change | Merge to `main`. **Release (Azure)** builds, migrates and canaries it (10% → 50% → 100%). |
| Apply a changed repo Variable | `gh workflow run release-azure.yml -R unnfazzed/Lynia --ref main` |
| Roll the API back | **Actions → Rollback (Azure)** → `environment: production` (the default is `staging`, which is retired). Run once with `revision` empty to list revisions, then again with the name. |
| See why production is unhealthy | **Actions → Azure Diagnose** (`azure-diagnose.yml`), then read the Recap. |
| Ship to Android testers | See [`LAUNCH-DEPLOYMENT-STRATEGY.md`](LAUNCH-DEPLOYMENT-STRATEGY.md) §1 (`profile: closed`). |

A rollback moves traffic, never the database. Check the migrations shipped since the target revision
first (`LAUNCH-DEPLOYMENT-STRATEGY.md` §2c).

---

## 3. How a vendor secret reaches the API

Secrets live in Key Vault. Terraform attaches each one to the API as a container-app secret. The
**Release (Azure)** deploy mounts it only when its feature flag is on. The map from env name to Key Vault
name is the `AZ_VENDOR_SECRETS` repo Variable.

The easy path (Cloud Shell, Bash):

```bash
bash infra/azure/vendor-secrets.sh
```

For every vendor flag that is `true` (Bird, Didit, WhatsApp, local SMS, Sentry, the demo account, Paynow, owner alerts), it
asks for each missing secret silently, stores it in Key Vault and updates `AZ_VENDOR_SECRETS`. Enter on a
missing secret turns that feature's flag off. Then:

1. **Terraform apply (Azure)**, production, two approvals. It attaches the secret to the API.
2. **Release (Azure)**. The release refuses to deploy a flag that is on with no secret behind it.

The Push (§5) and APNs (§6) steps below follow the same pattern by hand.

---

## 4. Didit (automatic KYC)

KYC is fully automatic: `KYC_PROVIDER=didit` (the release default), `KYC_MODE=auto` (the release default),
and `DIDIT_ENABLED=true` with the Didit secrets in Key Vault. The release refuses `didit` in auto mode
without `DIDIT_ENABLED=true`.

1. **API key.** Didit console (`https://business.didit.me`), or `apps/api/scripts/didit-setup.ts`
   (`cd apps/api && DIDIT_WEBHOOK_URL=https://api.lyniago.com/kyc/callback pnpm didit:setup`), which
   registers the account, lists the workflows and registers the webhook in one go.
2. **Workflow id** (not a secret) → repo Variable `DIDIT_WORKFLOW_ID`.
3. **Register the webhook destination once.** It must be **V3**: the code reads V3's plural arrays
   (`decision.id_verifications[]`, `decision.face_matches[]`).
   ```bash
   curl -X POST https://verification.didit.me/v3/webhook/destinations/ \
     -H "x-api-key: $DIDIT_API_KEY" -H "Content-Type: application/json" \
     -d '{"label":"Lynia prod","url":"https://api.lyniago.com/kyc/callback",
          "webhook_version":"v3","subscribed_events":["status.updated"]}'
   # → response.secret_shared_key is DIDIT_WEBHOOK_SECRET
   ```
   `DIDIT_CALLBACK_URL` is different: the browser redirect after verification, not the webhook.
4. Store `DIDIT_API_KEY` and `DIDIT_WEBHOOK_SECRET` with §3, set `DIDIT_ENABLED=true`, then release.

### Manual KYC mode (only when you need it)

`KYC_MODE=manual` stops the API from opening a paid Didit check. Riders wait as *pending* until an
operator decides in **admin console → Riders → the rider → KYC** (`POST /admin/riders/:profileId/kyc`,
which writes the decision and its audit row in one transaction).

```bash
gh variable set KYC_MODE -R unnfazzed/Lynia -b manual     # on
gh variable delete KYC_MODE -R unnfazzed/Lynia            # back to auto
gh workflow run release-azure.yml -R unnfazzed/Lynia --ref main
```

Leave it unset in normal running. The release rejects any value but `auto` or `manual`.

---

## 5. Push notifications (Firebase, about 10 min)

Push is off (`PUSH_PROVIDER=noop`, the default in both `env.ts` and the release) until this is done.
Whether production has it on is not visible from the repo; check the `PUSH_PROVIDER` Variable.

1. Firebase console → Project settings → **Service accounts** → **Generate new private key**. Never paste it.
2. Cloud Shell → Upload the JSON file, then in bash (change the file name):
   ```bash
   F=~/your-firebase-key.json
   V=$(gh variable get AZ_KEY_VAULT_NAME -R unnfazzed/Lynia)
   P=$(jq -r .project_id "$F") && echo "Firebase project: $P"
   az keyvault secret set --vault-name "$V" -n FCM-SERVICE-ACCOUNT-JSON --file "$F" --encoding utf-8 -o none && echo "stored FCM key"
   gh variable set FCM_PROJECT_ID -R unnfazzed/Lynia -b "$P"
   shred -u "$F" 2>/dev/null || rm -f "$F"
   gh variable set AZ_VENDOR_SECRETS -R unnfazzed/Lynia -b "$(gh variable get AZ_VENDOR_SECRETS -R unnfazzed/Lynia | jq -c '. + {"FCM_SERVICE_ACCOUNT_JSON":"FCM-SERVICE-ACCOUNT-JSON"}')"
   ```
3. Run **Terraform apply (Azure)** for production (two approvals). It attaches the secret to the API.
4. `gh variable set PUSH_PROVIDER -R unnfazzed/Lynia -b fcm`, then run **Release (Azure)**. The release
   refuses `fcm` without `FCM_PROJECT_ID`, and the API refuses to boot on a malformed key.

The Firebase project must be the one in the app's `google-services.json`. A different project needs a new
store build.

## 6. iOS push (Apple APNs, about 10 min, once the Apple Developer account exists)

iPhones register raw Apple push tokens, which Firebase cannot deliver to, so the API sends to Apple
directly (`apps/api/src/adapters/push/apns.push.ts`). This is armed separately from `PUSH_PROVIDER`, and
the API refuses to boot on a partial or malformed set. See `docs/APP-STORE-SUBMISSION.md` A5/B4.

1. Apple Developer → Certificates, Identifiers & Profiles → **Keys** → **+**, tick **Apple Push
   Notifications service (APNs)**, then download `AuthKey_<KEYID>.p8`. It downloads **once**. Note the
   **Key ID** (10 characters) and your **Team ID** (Membership details, 10 characters).
2. Cloud Shell → Upload the `.p8` file, then in bash (change the three values):
   ```bash
   F=~/AuthKey_ABC123DEFG.p8; KEY_ID=ABC123DEFG; TEAM_ID=TEAM123456
   V=$(gh variable get AZ_KEY_VAULT_NAME -R unnfazzed/Lynia)
   az keyvault secret set --vault-name "$V" -n APNS-PRIVATE-KEY --file "$F" --encoding utf-8 -o none && echo "stored APNs key"
   gh variable set APNS_KEY_ID -R unnfazzed/Lynia -b "$KEY_ID"
   gh variable set APNS_TEAM_ID -R unnfazzed/Lynia -b "$TEAM_ID"
   shred -u "$F" 2>/dev/null || rm -f "$F"
   gh variable set AZ_VENDOR_SECRETS -R unnfazzed/Lynia -b "$(gh variable get AZ_VENDOR_SECRETS -R unnfazzed/Lynia | jq -c '. + {"APNS_PRIVATE_KEY":"APNS-PRIVATE-KEY"}')"
   ```
3. Run **Terraform apply (Azure)** for production (two approvals).
4. `gh variable set APNS_ENABLED -R unnfazzed/Lynia -b true`, then run **Release (Azure)**.

## 7. Admin console access

Sign-in is Microsoft Entra (Easy Auth) with **Assignment required**, plus the
`ADMIN_CONSOLE_ALLOWED_OPERATORS` allowlist (`apps/admin/app/lib/console-auth.ts`). To add an operator:

```bash
curl -fsSL https://raw.githubusercontent.com/unnfazzed/Lynia/main/infra/azure/admin-auth.sh | ADMIN_OPERATORS="a@x.com,b@y.com" bash
```

Then run **Deploy Admin Console (Azure)** with `environment: production`. Its summary must say
*allowlist applied*. Error messages and fixes: `infra/azure/README.md` Step 6. Launch checks:
[`ADMIN-CONSOLE-LAUNCH-SMOKE-TEST.md`](ADMIN-CONSOLE-LAUNCH-SMOKE-TEST.md).

**Full phone numbers.** The console masks phone numbers (A-03). Any admin can tap **Show number** or
**Call biker** / **Call customer** on a biker or customer page to get the full number. Each reveal is
written to the audit log (`person.phone_reveal`, "Phone number viewed"), and the route allows 60
reveals an hour.

---

## 8. Launch-hygiene guards and QA mode

**Release (Azure)** checks the production config before it builds (step *Validate production
launch-hygiene config*). The API would refuse to boot with any of these (`apps/api/src/config/env.ts`),
so the release fails in seconds instead. Each error names its fix:

| Error | Fix |
|---|---|
| `OTP_CHANNEL=console` | `gh variable delete OTP_CHANNEL` (default `whatsapp`), or set `bird-verify` |
| `OTP_TEST_PHONES must be empty` | `gh variable delete OTP_TEST_PHONES` |
| `KYC_PROVIDER=stub` | `gh variable delete KYC_PROVIDER` (default `didit`) |
| `KYC_PROVIDER=didit in auto mode needs DIDIT_ENABLED=true` | Finish §4, or set `KYC_MODE=manual` |
| `OTP_CHANNEL=whatsapp … WHATSAPP_ENABLED != true` | Arm WhatsApp, or switch `OTP_CHANNEL` to an armed channel |
| `OTP_CHANNEL=bird-verify but BIRD_VERIFY_ENABLED != true` | Arm Bird Verify (`docs/BIRD-SETUP.md`): `BIRD_VERIFY_ENABLED=true` and the `BIRD_VERIFY_API_KEY` secret (§3) |
| `OTP_CHANNEL must be bird-verify or whatsapp` | The deploy step accepts only these two; `bird` (SMS) and `local-sms` are refused |

The "flip to launch" is just clearing the QA Variables and redeploying:

```bash
gh variable delete OTP_CHANNEL -R unnfazzed/Lynia      # or set it to your armed channel
gh variable delete KYC_PROVIDER -R unnfazzed/Lynia
gh variable delete OTP_TEST_PHONES -R unnfazzed/Lynia
gh variable set PUSH_PROVIDER -R unnfazzed/Lynia -b fcm   # NOT delete: the default is noop (§5)
gh workflow run release-azure.yml -R unnfazzed/Lynia --ref main
```

**Vendor-free QA runs locally, not on production.** Production refuses console OTP, test phones and stub
KYC, and the staging tier that allowed them is retired. On your own machine (`CONTRIBUTING.md` §2, with
`NODE_ENV=development`) set:

| Variable | Value | Effect |
|---|---|---|
| `OTP_CHANNEL` | `console` | codes go to the log |
| `OTP_TEST_PHONES` | your test numbers, comma-separated | `POST /auth/otp/request` returns the code for these numbers only |
| `KYC_PROVIDER` | `stub` | a new rider is verified at once |
| `PUSH_PROVIDER` | `noop` | pushes are logged, not sent |

The `Android Test APK` workflow builds a sideloadable APK for device checks. It talks to the live API, so
it signs in like any user.

---

## 9. Mobile release arming, release train and force-update

**EAS and Play are armed** (`EAS_RELEASE_ENABLED`, `EXPO_TOKEN`, `EAS_PROJECT_ID`, the Play service-account
key on EAS, the `production-mobile` environment). `scripts/eas-arm.sh --verify` is a read-only re-check
from your machine. Still open (`PLAY-STORE-SUBMISSION.md` §9): a required reviewer on
`production-mobile`, which is the only human gate on OTA.

**Production train (not open yet).** Set `EAS_TAG_RELEASES_ENABLED=true` only when Play grants production
access. Until then a `v*` tag does nothing, and a dispatch must pass `profile: closed` or `preview`
(`LAUNCH-DEPLOYMENT-STRATEGY.md` §1b).

**Release train.** `release-please.yml` keeps a release PR open from Conventional Commits. Merging it tags
`vX.Y.Z` and writes `apps/mobile/CHANGELOG.md`. Tags pushed with the default token trigger no workflow.

**Force-update gate.** When a breaking change must walk old installs to the store, set the minimum and
redeploy. Apps below it get the blocking update screen at the next cold start. An unreachable API never
blocks anyone. Each platform has its own minimum:

```bash
gh variable set MIN_SUPPORTED_APP_VERSION -R unnfazzed/Lynia --body "0.51.0"      # Android, and any build that doesn't name its platform
gh variable set MIN_SUPPORTED_APP_VERSION_IOS -R unnfazzed/Lynia --body "1.0.1"   # iPhone: only once that version is live on the App Store
gh workflow run release-azure.yml -R unnfazzed/Lynia --ref main
curl 'https://api.lyniago.com/app/version-gate?platform=ios'    # → {"minSupportedVersion":"1.0.1"}
```

`RECOMMENDED_APP_VERSION` (and `_IOS`) shows a dismissible nudge instead; `APP_WHATS_NEW` is its line of
copy (80 characters max). Dotted versions only; the release refuses anything else. Prefer
backward-compatible contracts; this gate is the escape hatch.

---

## 10. Turning a vertical on or off (restaurants, shops, pharmacy)

Each vertical is a kill switch read by the API and, through public endpoints, by the app:

| Variable | Release default | Read by the app at |
|---|---|---|
| `RESTAURANTS_ENABLED`, `MERCHANT_DISPATCH_AUTO_ENABLED`, `MERCHANT_WALLET_ENABLED` | unset → `false` | `GET /app/feature-flags` |
| `SHOPS_ENABLED`, `PHARMACY_ENABLED` | `true` | `GET /app/service-flags` |
| `RX_ENABLED` (prescriptions) | `true` | `GET /app/order-flags` |

**Before a flip, run the golden pass.** `apps/api/src/merchant/launch-flip.int.spec.ts` drives a cash
food order end to end (the debt ledger nets to 0.00), the no-rider hold, the parcel-bid vs food-offer
race, and flags-off non-interference. CI runs it in the *prisma migrate · constraint proof* job. Locally:

```bash
export DATABASE_URL="postgresql://lynia:lynia@localhost:5432/lynia?schema=public"
pnpm --filter @lynia/api migrate:deploy
pnpm --filter @lynia/api test:int
```

**The flip:**

```bash
gh variable set RESTAURANTS_ENABLED -R unnfazzed/Lynia --body "true"
gh workflow run release-azure.yml -R unnfazzed/Lynia --ref main
curl -s https://api.lyniago.com/app/feature-flags
```

**Rollback is the same flip back** (`--body "false"` and release). No code change, no migration and no
app update: the app reads the flags remotely (cached 60 s). Do not use `az containerapp update` for a
quick revert: the release pins traffic to named revisions, so a hand-made revision gets 0% traffic. A
single merchant can be taken out without a flip by clearing its `Merchant.pilotEnabled`.

After a flip, walk one order on a real phone, plus one **parcel** order with the flag off, to prove Send
is unchanged (`docs/QA-DEVICE-CHECKLIST.md`).

---

## 11. Backfill thumbnails for older menu and shop photos (once)

Since D7 (2026-10-07) the API makes a small `<photo key>.thumb.jpg` whenever a dish, shop item, cover or
logo photo is saved. Older photos stay full-size until this backfill runs. It is never urgent and never
risky: a photo it cannot thumbnail keeps being served in full. It is idempotent and resumable.

It needs the API's own environment: `DATABASE_URL` (private, VNet only), `CLOUD_PROVIDER=azure`,
`AZURE_STORAGE_ACCOUNT` / `AZURE_STORAGE_CONTAINER`, the API identity's Blob access, and every other
variable `loadEnv` requires. A running API replica has all of these. **Not yet tried on Azure:**

```bash
RG=rg-lynia-prod-san
az containerapp exec -n ca-lynia-api -g "$RG" --command "sh"
# inside the container (WORKDIR /repo/apps/api):
pnpm thumbs:backfill                               # DRY RUN: counts, writes nothing
pnpm thumbs:backfill -- --apply --concurrency=3    # APPLY
```

The summary prints photos scanned, already thumbnailed, made and failed. A non-zero exit means some
failed; run it again to retry. Code: `apps/api/scripts/backfill-photo-thumbnails.ts` →
`apps/api/src/adapters/storage/photo-thumbnail-backfill.ts`.

## 12. Owner phone alerts (Telegram, about 5 min)

A Telegram bot messages your phone the moment the platform gets something to act on
(`apps/api/src/owner-alerts/owner-alerts.service.ts`):

| Alert | What it tells you | What you do with it |
|---|---|---|
| 👤 New sign-up | The new account's phone, masked | — |
| 🛵 New biker application | Their first name and whether the ID check passed | Review it in the console |
| 📦 New parcel request | Fare, pickup → drop-off, items, **the sender's name and number**, **how many bikers are online near the pickup** | Fewer than 10 (⚠️): get bikers online |
| 🍔 / 🛒 / 💊 New restaurant, shop or pharmacy order | **The venue it went to and its number**, total, items, whether it still has to be accepted, **the sender's name and number** | Call or WhatsApp the venue to take it |

Every phone number comes with a WhatsApp link. Each order alert links to its page in the console. Alerts never block or slow a sign-up or an order: a
failed send is a warning in the API log and nothing else.

1. In Telegram, open **@BotFather** → `/newbot`. Name it (e.g. *LyniaGo Alerts*) and give it a username
   ending in `bot`. Copy the **token** it replies with.
2. Open your new bot, tap **Start** and send it any message.
3. In a browser, open `https://api.telegram.org/bot<TOKEN>/getUpdates` (your token in place of
   `<TOKEN>`). The number after `"chat":{"id":` is your **chat id**. For a team group instead: add the
   bot to the group, send a message there, and use that chat's id (it starts with `-`).
4. Cloud Shell (Bash), with your chat id:
   ```bash
   gh variable set TELEGRAM_CHAT_ID -R unnfazzed/Lynia -b 123456789
   gh variable set OWNER_ALERTS_ENABLED -R unnfazzed/Lynia -b true
   bash infra/azure/vendor-secrets.sh   # paste the bot token when it asks for TELEGRAM-BOT-TOKEN
   ```
5. Run **Terraform apply (Azure)** for production (two approvals), then **Release (Azure)**.

To stop them: `gh variable set OWNER_ALERTS_ENABLED -R unnfazzed/Lynia -b false`, then **Release
(Azure)**. Mute the chat in Telegram for quiet hours instead. If the token ever leaks, `/revoke` it in
@BotFather and re-run step 4.
