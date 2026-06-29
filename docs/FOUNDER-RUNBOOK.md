# Lynia — Founder action runbook (post-launch unblocks)

> The API is live and CI-deployed on GCP at **https://lyniago.lyniafinance.com**. Everything codeable
> through the gstack review gates is shipped (`docs/REVIEW-SHIP-FOLLOWUPS.md`). What remains needs a
> **founder/vendor action** — an account, a key, or an org decision — not code. The integrations are
> already built behind env seams, so each item below is **create account → set secret → flip flag**.
>
> Lead time is the long pole (CEO review): **start items 1 and 2 now**, in parallel — they clear by the
> time on-device builds are testing.

## How a vendor secret reaches the running service (the wiring pattern)

Runtime config is injected at deploy by `.github/workflows/release.yml`:
- **Plain values** → `--set-env-vars` (already carries `OTP_CHANNEL`, `KYC_PROVIDER`, `PUSH_PROVIDER`, …).
- **Secrets** → Secret Manager + `--set-secrets` (already carries `DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_SECRET`).

To add a vendor **secret**: create it in Secret Manager, grant the runtime SA access, then append it to the
deploy's `--set-secrets`. The runtime SA already holds per-secret accessor via Terraform for the existing
three; new secrets need the one IAM line below.

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
(Better long-term: add the secret + binding to `infra/terraform/secrets.tf` so it's tracked — the pattern
is already there for the existing three.)

---

## 1. WhatsApp BSP — production OTP  🔴 longest lead time, start first
**Why:** real users can't sign up until OTP leaves the dev `console` channel. `OTP_CHANNEL=whatsapp` is
already set; the send is a stub (`apps/api/src/auth/otp-sender.ts` → `WhatsAppOtpSender.send`).

**Founder steps:**
1. **Pick a BSP** (this is a decision that gates the code): Meta WhatsApp **Cloud API** (direct, no reseller)
   is the usual fastest path; alternatives are Twilio / Gupshup / 360dialog. Whichever you pick, you need a
   Meta Business verification + an approved **OTP template message** — that approval is the lead-time item.
2. Get the API key/token and (Cloud API) the phone-number ID + template name.
3. Store the key: `WHATSAPP_BSP_API_KEY` → Secret Manager (pattern above).
4. **Code step (small, do once BSP is chosen):** implement `WhatsAppOtpSender.send()` against the chosen
   BSP's template API. The adapter seam, channel flag, rate-limits, and hashing are all already in place —
   this is one HTTP call.
5. SMS fallback (optional insurance, E4): same pattern with `SMS_GATEWAY_API_KEY` + `OTP_CHANNEL=sms`.

**Flip:** key in Secret Manager + `send()` implemented → users get real WhatsApp codes. No other change.

## 2. Didit ZIM-ID — real KYC run  🔴 start now (gates rider onboarding)
**Why:** measures the false-reject rate that decides whether real riders can self-onboard. The integration
is **done** (`apps/api/src/kyc/didit-kyc-vendor.ts`); `KYC_PROVIDER=didit` is set.

**Founder steps:**
1. Create a **Didit** account + workflow for Zimbabwean national IDs; get `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`,
   and a `DIDIT_WEBHOOK_SECRET`.
2. Set the callback to the live domain: **`DIDIT_CALLBACK_URL=https://lyniago.lyniafinance.com/kyc/callback`**
   (the `/kyc/callback` route is live and HMAC-verifies the webhook against `DIDIT_WEBHOOK_SECRET`).
3. Store `DIDIT_API_KEY` + `DIDIT_WEBHOOK_SECRET` as secrets; `DIDIT_WORKFLOW_ID` + `DIDIT_CALLBACK_URL` can
   be plain `--set-env-vars`. Keep `KYC_MODE=auto`.
4. **Run a real Zimbabwean ID** end-to-end → record the approve/decline + measure false-reject rate. If the
   reject rate is high, the manual admin KYC backstop (`POST /admin/riders/:id/kyc`) is the fallback.

**Flip:** secrets set → the next rider KYC submission goes to Didit instead of the stub.

## 3. FCM push — device notifications  🟠 (after on-device builds exist)
**Why:** notify customers/riders of offers + status. The adapter is built (`PUSH_PROVIDER=fcm` set,
`apps/api/src/adapters/push/fcm.push.ts`, ADC creds — no key in env), but it has no targets yet.

**Founder + code steps:**
1. **Enable Firebase** on the existing project: `firebase projects:addfirebase lynia-500911` (or via the
   Firebase console), then register an Android app (`zw.co.lynia`). Set `FCM_PROJECT_ID=lynia-500911`.
2. Grant the runtime SA messaging rights:
   `gcloud projects add-iam-policy-binding lynia-500911 --member="serviceAccount:lynia-run@lynia-500911.iam.gserviceaccount.com" --role=roles/firebasecloudmessaging.admin`
   (add `firebasecloudmessaging.googleapis.com` to the enabled APIs in `infra/terraform/project.tf`).
3. **Code step (own feature):** mobile registers a device token (`expo-notifications`) and POSTs it to a new
   API endpoint; the API stores it and `PUSH.send()` is called at the offer/status transitions. The payload
   mapper is already unit-tested.

**Flip:** partial — infra is a config flip, but device-token registration + send call-sites are a feature.
Pilots can run on foreground/polling first (CEO review).

## 4. OTEL traces — observability  🟢 deferred by decision
The exporter is wired (`apps/api/src/observability/otel.ts`), no-op until `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
CEO review defers this: the admin funnel view covers core metrics, and standing up a collector is cost the
pilot's volume doesn't need yet. **Trigger:** when real trip volume makes traces necessary to debug, point it
at a collector (or add the `@google-cloud/opentelemetry-cloud-trace-exporter` for a zero-infra GCP-native
target + grant the runtime SA `roles/cloudtrace.agent`).

---

## One non-vendor action still outstanding (you, in Cloud Shell)
The LB backend WebSocket timeout (`timeout_sec=3600`, so tracking sockets survive a full delivery) is merged
but Terraform-side — apply it:
```bash
cd ~/Lynia/infra/terraform && git pull origin claude/project-next-steps-y3ce3g
/usr/bin/terraform apply -auto-approve
```

## Deferred infra hardening (pre-launch, not pilot — per the lean decision)
Tracked in `infra/terraform/README.md`: drop Cloud SQL public IP (needs a VPC-internal migrator first),
Redis `STANDARD_HA` + Cloud SQL `REGIONAL` (cost; before launch), tighten bucket CORS (needs the deployed
admin origin).
