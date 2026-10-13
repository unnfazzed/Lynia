# OTP channels: Bird and WhatsApp setup

How sign-in codes reach users, and how to arm each channel on Azure. Code: `apps/api/src/auth/`
(`otp-sender.ts`, `bird-verify.ts`, `bird-webhook*.ts`, `otp-carrier.ts`) and the `OTP_*` / `BIRD_*` /
`WHATSAPP_*` variables in `apps/api/src/config/env.ts`. Owner commands for Key Vault and Variables:
[AZURE-OWNER-RUNBOOK.md](AZURE-OWNER-RUNBOOK.md) §3 and §8.

## Which channels exist, and which production allows

`OTP_CHANNEL` (repo Variable) picks the channel. The code accepts six values; **Release (Azure) allows
only two**, because login codes are WhatsApp-only with no SMS (owner decision 2026-09-25; the
`case "$OTP_CHANNEL"` check in the deploy step of `release-azure.yml`).

| `OTP_CHANNEL` | Delivers by | Who owns the code | Production |
|---|---|---|---|
| `bird-verify` | Bird **Verify** API, WhatsApp only | Bird (generate, send, expiry, attempts) | ✅ allowed |
| `whatsapp` (code default) | Meta WhatsApp Cloud API template | this API (`otp-store.ts`) | ✅ allowed |
| `bird` | Bird SMS API | this API | ❌ refused by the release |
| `local-sms` | a local A2P SMS gateway | this API | ❌ refused by the release |
| `sms` | stub, never implemented | — | ❌ refused at boot |
| `console` | the API log (dev only) | this API | ❌ refused at boot |

Which value production uses right now is a repo Variable and is not visible from the repo. Check with
`gh variable get OTP_CHANNEL -R unnfazzed/Lynia`.

Every channel shares the same controls in `auth.service.ts`: per-phone, per-IP, global and per-device
send caps (`OTP_RL_*`), the Play-review demo account, and the post-verify retry grace.

---

## Bird Verify (WhatsApp OTP)

Bird's Verify API owns the whole code lifecycle; this API only calls two endpoints
(`apps/api/src/auth/bird-verify.ts`):

```
POST https://{region}.platform.bird.com/v1/verify/verifications
Authorization: Bearer {BIRD_VERIFY_API_KEY}
{"to":{"phone_number":"+263771234567"},"options":{"code_length":6,"channels":["whatsapp"]}}

POST https://{region}.platform.bird.com/v1/verify/verifications/check
Authorization: Bearer {BIRD_VERIFY_API_KEY}
{"to":{"phone_number":"+263771234567"},"code":"123456"}
```

- **WhatsApp only.** `channels` never includes `"sms"`, so an undeliverable WhatsApp attempt fails loud
  instead of silently becoming a text. The app's resend is another WhatsApp attempt.
- **Region** comes from the key's own prefix (`bk_eu1_…` → `eu1`). A key that doesn't match
  `bk_<region>_` fails at first use. There is no base-URL variable for Verify.
- `code_length` is pinned to 6 to match the app's code field.
- A second check on an already-resolved verification answers 404; the API maps it into the existing
  retry grace.

| Name | Kind | Value |
|---|---|---|
| `OTP_CHANNEL` | repo Variable | `bird-verify` |
| `BIRD_VERIFY_ENABLED` | repo Variable | `true` (tells Release (Azure) to mount the key) |
| `BIRD_VERIFY_API_KEY` | Key Vault `BIRD-VERIFY-API-KEY` | a Bird workspace key. Live-tested 2026-09-01: the same key value as `BIRD_ACCESS_KEY` works, because Bird keys here are workspace-scoped. Keep it a separate secret so each can rotate on its own. |

**Arming checklist**

1. Verify product enabled on the `LyniaGo` Bird workspace, and WhatsApp reachable for +263: confirmed
   2026-09-01 (a live create returned `last_channel: "whatsapp"` and the code arrived).
2. Store the key: `bash infra/azure/vendor-secrets.sh` in Cloud Shell. With `BIRD_VERIFY_ENABLED=true`
   it asks for `BIRD-VERIFY-API-KEY` (silent input), stores it in Key Vault and adds it to
   `AZ_VENDOR_SECRETS`.
3. Run **Terraform apply (Azure)** for production, so the API has the container-app secret.
4. Set `OTP_CHANNEL=bird-verify` and `BIRD_VERIFY_ENABLED=true`, then dispatch **Release (Azure)**. Its
   *Validate production launch-hygiene config* step fails if `BIRD_VERIFY_ENABLED` is not `true`, and the
   deploy step fails if the secret is not attached.
5. Request a code from the installed app and complete sign-in.

**Sender name.** Codes arrive from Bird's default shared sender "Bird Verify" unless changed in the Bird
dashboard (Verify → Configure → Channels → WhatsApp). That is a dashboard setting, not code.

**Rollback:** set `OTP_CHANNEL=whatsapp` (only if Meta WhatsApp is armed, below) and dispatch
**Release (Azure)**. `BIRD_VERIFY_ENABLED` can stay `true`; the key is inert on another channel.

---

## WhatsApp Cloud API (Meta)

This API generates, hashes and checks the code (`otp-store.ts`) and Meta delivers it as an
authentication-category template (`WhatsAppOtpSender` in `otp-sender.ts`).

| Name | Kind | Value |
|---|---|---|
| `OTP_CHANNEL` | repo Variable | `whatsapp` (or unset: it is the default) |
| `WHATSAPP_ENABLED` | repo Variable | `true` |
| `WHATSAPP_PHONE_NUMBER_ID` | repo Variable | the sender number's id |
| `WHATSAPP_TEMPLATE_NAME` | repo Variable | the approved template, e.g. `lynia_otp` |
| `WHATSAPP_TEMPLATE_LANG` | repo Variable | optional, default `en` |
| `WHATSAPP_ACCESS_TOKEN` | Key Vault `WHATSAPP-ACCESS-TOKEN` | a **permanent system-user** token (the 24-hour API-setup token must never ship) |

Release (Azure) fails if `OTP_CHANNEL=whatsapp` and WhatsApp is not fully armed. The time-boxed
`OTP_WHATSAPP_UNARMED_ACK` + `OTP_WHATSAPP_UNARMED_ACK_EXPIRES` Variables turn that into a warning until
the date passes.

**Arming checklist**

1. Meta **business verification** clears. Authentication templates are blocked until it does; never put
   the code in a utility or marketing template.
2. Create the template: category Authentication, `lynia_otp`, language `en`, copy-code button, code
   expiry 5 minutes (matches `OTP_TTL_SECONDS=300`).
3. Create a system user with a permanent token carrying both `whatsapp_business_*` scopes.
4. Register the real +263 sender number and use its id for `WHATSAPP_PHONE_NUMBER_ID`.
5. Store the token: `WHATSAPP_ENABLED=true`, then `bash infra/azure/vendor-secrets.sh`; then
   **Terraform apply (Azure)**, set the Variables, dispatch **Release (Azure)**.

Meta state was last recorded 2026-07-13 (business verification in progress, test number only). Check
Meta Business Manager for the current state.

---

## Bird SMS (not deployable today)

`OTP_CHANNEL=bird` sends a plain SMS through `POST {BIRD_BASE_URL}/v1/sms/messages` (`BirdOtpSender`,
`buildBirdSmsRequest`): E.164 `to`, `category: "authentication"`, a fresh `Idempotency-Key` per send.
The code is complete and tested, but **Release (Azure) refuses `OTP_CHANNEL=bird`** under the WhatsApp-only
decision. These facts stay here because the code still uses them:

- `BIRD_SMS_FROM` is required for +263: without it Bird has no eligible sender and rejects every send
  with `E12003`.
- `BIRD_BASE_URL` defaults to `https://eu1.platform.bird.com`, the workspace's region.
- A live send on 2026-07-25 reached an Econet handset in 6.6 s: `mcc_mnc 64804`, one 69-character GSM-7
  segment, about €0.195 per message. That `mcc_mnc` is how `otp-carrier.ts` maps delivery events to
  carriers.
- Bird's older Channels API (`/workspaces/{ws}/channels/{ch}/messages`) answers `RouteNotFound` on the
  regional hosts. `BIRD_WORKSPACE_ID` and `BIRD_SMS_CHANNEL_ID` are gone.

`BIRD_ENABLED=true` still mounts `BIRD_ACCESS_KEY`, `BIRD_SMS_FROM` and friends on the API, and is what
the delivery-status webhook below hangs off.

### Delivery-status webhook

`POST /webhooks/bird` (`bird-webhook.controller.ts`) receives Bird's `sms.*` events: the only signal
that an accepted SMS never arrived. It logs each non-delivery and counts it in
`bird_otp_delivery_failed_total` / `bird_otp_delivered_total` (see [OBSERVABILITY](OBSERVABILITY.md)). It
verifies Standard Webhooks signatures (HMAC-SHA256, 5-minute replay window) and fails closed: without a
secret it answers 401 to everything. It covers the SMS product only.

To arm: create the endpoint in Bird (Developers → Webhooks) for `https://api.lyniago.com/webhooks/bird`
with `sms.delivered,sms.undelivered,sms.failed,sms.rejected,sms.expired`, and copy the `whsec_…` secret at
once (Bird shows it only once). Then `BIRD_ENABLED=true`, `BIRD_WEBHOOK_ENABLED=true`, store
`BIRD-WEBHOOK-SECRET` with `vendor-secrets.sh`, **Terraform apply (Azure)**, **Release (Azure)**.

---

## Agent tooling (per developer, optional)

Not part of arming anything. The Bird MCP server is registered in [`.mcp.json`](../.mcp.json)
(`https://mcp.bird.com`, OAuth per user), so a Claude Code session can look up messages, verifications
and webhooks. Authorize it once in an interactive session on your own machine (`claude mcp list` shows
its state). It uses your Bird login, never the service's keys.

Bird also publishes agent skills that drive the `bird` CLI:

```bash
curl -fsSL https://cli.bird.com/install.sh | sh
claude plugin marketplace add messagebird/bird-ai
claude plugin install bird@bird-ai
```

The plugin brings its own copy of the MCP server, so tools appear twice (`mcp__bird__*` and
`mcp__plugin_bird_bird__*`); that is harmless. A `202 accepted` from Bird means it took the message, not
that it arrived: read the message back for the real status. See [`CLOUDFLARE.md`](./CLOUDFLARE.md) for the
same MCP pattern.
