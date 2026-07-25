# Bird SMS OTP setup — arming runbook

_Last updated: 2026-07-25. Tracks the Bird ([bird.com](https://bird.com)) SMS onboarding for the
OTP channel (`OTP_CHANNEL=bird`). Backend integration is **complete and unit-tested**
(`apps/api/src/auth/otp-sender.ts` → `BirdOtpSender` + `buildBirdSmsRequest`); this doc is the
founder-side arming checklist — an account, a key, and three repo Variables, not code._

Bird is the **priority launch OTP channel** (product decision 2026-07-19): it delivers the code as a
plain SMS while WhatsApp Business verification is still pending, and reverting is a one-line
`OTP_CHANNEL` flip. See `docs/WHATSAPP-SETUP.md` for the WhatsApp path and `docs/PILOT-READINESS.md`
for how vendor config reaches the running service.

## What is already built (no code work remains)

- **Sender** — `BirdOtpSender.send()` POSTs the OTP as an SMS via Bird's Channels API. It fails
  **loud**: missing credentials or a non-2xx from Bird throws, so `requestOtp` surfaces an error
  instead of a false "sent". The OTP code is never logged (only Bird's error body is).
- **Request shape** — `buildBirdSmsRequest()` addresses the recipient as an E.164 number (the `+`
  is kept, unlike Meta's Graph API) and carries the text in `body.text.text`. The message body is
  the shared autofill-friendly text (`buildOtpSmsText` — code first, so iOS Security-Code AutoFill
  and Android's `sms-otp` hint pick it up).
- **We still own the code** — generation, HMAC hashing, TTL, rate-limits, and verification all stay
  in `otp-store.ts`. Bird is a **delivery pipe only**, so the entire verify path, brute-force caps,
  and session issuance are identical to the WhatsApp channel.
- **Deploy wiring** — `.github/workflows/release.yml` injects the Bird config, opt-in via
  `BIRD_ENABLED=true` (so a launch-safe deploy never references `BIRD_ACCESS_KEY` before it exists).
  A pre-flight guard rejects the deploy if `OTP_CHANNEL=bird` but the credentials aren't armed —
  the service can never boot green and then 503 every sign-in.
- **Secret container** — `infra/terraform/secrets.tf` pre-lists `BIRD_ACCESS_KEY`; the runtime SA's
  read binding is managed by `scripts/adopt-vendor-secrets.sh`.
- **Tests** — `apps/api/src/auth/otp-sender.spec.ts` covers the request shape, the `AccessKey`
  header, the 202-Accepted success path, the loud-throw on rejection, and that the code is never
  logged.

## Config reference

| Name | Kind | Required | Where it comes from |
|---|---|---|---|
| `OTP_CHANNEL` | repo Variable | ✅ set to `bird` | flips the live channel |
| `BIRD_ENABLED` | repo Variable | ✅ set to `true` | arms the `release.yml` injection block |
| `BIRD_WORKSPACE_ID` | repo Variable | ✅ | Bird dashboard → workspace |
| `BIRD_SMS_CHANNEL_ID` | repo Variable | ✅ | Bird dashboard → Channels → your SMS channel |
| `BIRD_ACCESS_KEY` | Secret Manager | ✅ | Bird dashboard → Access keys (sent as `Authorization: AccessKey <key>`) |
| `BIRD_BASE_URL` | repo Variable | optional | defaults to `https://api.bird.com` |
| `BIRD_BRAND_NAME` | repo Variable | optional | defaults to `LyniaGo` — shown in the SMS body |
| `BIRD_ANDROID_SMS_HASH` | repo Variable | optional | 11-char SMS Retriever app-hash for zero-tap autofill (defer until a release build exists) |

The request Bird receives:

```
POST {BIRD_BASE_URL}/workspaces/{BIRD_WORKSPACE_ID}/channels/{BIRD_SMS_CHANNEL_ID}/messages
Authorization: AccessKey {BIRD_ACCESS_KEY}
Content-Type: application/json

{"receiver":{"contacts":[{"identifierKey":"phonenumber","identifierValue":"+263771234567"}]},
 "body":{"type":"text","text":{"text":"123456 is your LyniaGo verification code. Don't share it with anyone."}}}
```

Bird returns **202 Accepted** on success (`res.ok`, 200–299, covers it).

## Arming checklist (in order)

You have paid for SMS — these are the remaining steps. All need founder credentials (Bird dashboard,
GCP, and repo admin); none are code.

1. ☐ **Gather the three Bird IDs** from the Bird dashboard:
   - **Workspace ID** → `BIRD_WORKSPACE_ID`
   - **SMS channel ID** (Channels → your provisioned SMS channel) → `BIRD_SMS_CHANNEL_ID`
   - **Access key** (Settings → Access keys → create a key scoped to send on that channel) →
     the secret value for `BIRD_ACCESS_KEY`

2. ☐ **Confirm the sender is provisioned for Zimbabwe (+263).** Bird sends from the number / sender
   ID bound to the channel, so no originator field is set in our request — make sure the channel's
   registered sender can deliver to `+263` handsets (an alphanumeric sender ID or a provisioned
   number, per Bird's Zimbabwe routing). If Bird's international route is throttled on Econet's
   grey-route filtering, the `local-sms` channel (`docs`-noted A2P fallback) is the backstop.

3. ☐ **Store the access key in GCP Secret Manager** as `BIRD_ACCESS_KEY` and grant the runtime SA
   read access. The container is pre-listed in Terraform; the value is added by hand (it never
   touches git or state):

   ```bash
   PROJECT=lynia-500911
   RUNTIME_SA=lynia-run@lynia-500911.iam.gserviceaccount.com

   # Create the container if it doesn't exist yet, then add the key as a version:
   printf '%s' "<BIRD_ACCESS_KEY_VALUE>" | gcloud secrets create BIRD_ACCESS_KEY \
     --project "$PROJECT" --replication-policy=automatic --data-file=- \
     || printf '%s' "<BIRD_ACCESS_KEY_VALUE>" | gcloud secrets versions add BIRD_ACCESS_KEY \
        --project "$PROJECT" --data-file=-

   gcloud secrets add-iam-policy-binding BIRD_ACCESS_KEY --project "$PROJECT" \
     --member="serviceAccount:$RUNTIME_SA" --role=roles/secretmanager.secretAccessor
   ```

   Then adopt the container into Terraform state so it's drift-tracked (idempotent, founder creds):

   ```bash
   scripts/adopt-vendor-secrets.sh "$PROJECT"
   ```

   > The deploy resolves `BIRD_ACCESS_KEY:latest` — a container with **zero versions fails the
   > deploy**, so add the value version **before** flipping `BIRD_ENABLED=true`.

4. ☐ **Smoke-test the credentials end-to-end** (mirrors exactly what `BirdOtpSender` sends). Use a
   test recipient you control; a 202 confirms the channel + key + sender all work:

   ```bash
   curl -i -X POST \
     "https://api.bird.com/workspaces/<WORKSPACE_ID>/channels/<SMS_CHANNEL_ID>/messages" \
     -H "Authorization: AccessKey <ACCESS_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"receiver":{"contacts":[{"identifierKey":"phonenumber","identifierValue":"+263771234567"}]},"body":{"type":"text","text":{"text":"123456 is your LyniaGo verification code. Do not share it with anyone."}}}'
   ```

5. ☐ **Set the repo Variables** (Settings → Secrets and variables → Actions → Variables, or `gh`):

   ```bash
   gh variable set OTP_CHANNEL        --body "bird"
   gh variable set BIRD_ENABLED       --body "true"
   gh variable set BIRD_WORKSPACE_ID  --body "<WORKSPACE_ID>"
   gh variable set BIRD_SMS_CHANNEL_ID --body "<SMS_CHANNEL_ID>"
   # Optional overrides (defaults are api.bird.com / LyniaGo / no Android hash):
   # gh variable set BIRD_BRAND_NAME --body "LyniaGo"
   ```

   If QA test-mode variables are still set from vendor-free testing, clear them so the live channel
   is Bird, not console: `gh variable delete OTP_TEST_PHONES` (and any `KYC_PROVIDER=stub` /
   `OTP_CHANNEL=console` left over — see `docs/PILOT-READINESS.md` "Turn QA mode OFF").

6. ☐ **Redeploy** — push to `main` (or `gh workflow run release.yml --ref main`). The release job's
   "Validate production launch-hygiene config" step confirms Bird is fully armed before it builds:
   if `OTP_CHANNEL=bird` but `BIRD_ENABLED != true` or the workspace/channel IDs are empty, it fails
   fast with the exact remediation instead of shipping a service that 503s every OTP.

7. ☐ **Verify on a real device** — request an OTP from the app against the live API and confirm the
   SMS arrives and the code verifies. Watch the API logs for `Bird OTP send failed:` (the loud path
   logs Bird's error — bad channel/workspace id, revoked key, unregistered sender — never the code).

## Rollback

Reverting is a one-line flip — no redeploy of code:

```bash
gh variable set OTP_CHANNEL --body "whatsapp"   # or "local-sms" for the A2P fallback
gh workflow run release.yml --ref main
```

`BIRD_ENABLED` can stay `true` (the injection is inert unless `OTP_CHANNEL=bird`), so flipping back
to Bird later is just re-setting `OTP_CHANNEL=bird`.
