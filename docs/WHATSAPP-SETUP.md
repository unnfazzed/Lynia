# WhatsApp Cloud API setup — status & runbook

_Last updated: 2026-07-13. Tracks the Meta / WhatsApp Business onboarding for the OTP
channel (`OTP_CHANNEL=whatsapp`). Backend integration is complete
(`apps/api/src/auth/otp-sender.ts`); this doc tracks the Meta-side credentials._

## Current status

| Item | Value / state |
|---|---|
| Meta app | `LyniaGo` (app ID `985062384039697`), linked to the Lynia business portfolio |
| WABA (WhatsApp Business Account) | `1641732010249447` — "Test WhatsApp Business Account", status ACTIVE |
| Test sender number | `+1 555-187-5076`, phone number ID `1190877637449470` (Meta-provided test number) |
| Access token | Temporary 24-hour token from the API Setup page only — **permanent system-user token not yet created** |
| OTP template (`lynia_otp`, AUTHENTICATION category) | **Blocked** — see below |
| Business verification | **In progress** (submitted 2026-07-13 via Security Center) |

## Verified working (tested 2026-07-13 against the live Graph API)

- Token authenticates; scopes `whatsapp_business_messaging` + `whatsapp_business_management`
  granted for WABA `1641732010249447`.
- Phone number `1190877637449470` is registered on Cloud API (`platform_type: CLOUD_API`).
- Template **creation** works for non-auth categories (a diagnostic UTILITY template was created
  via `POST /{waba-id}/message_templates` and then deleted), so the API path itself is fine.

## The blocker: authentication-category templates

Creating an AUTHENTICATION-category template (required for OTP — Meta rejects verification-code
content in other categories) fails with error 10 / subcode 2388185
("this WhatsApp Business account does not have permission to create message template"),
via both the API **and** the WhatsApp Manager UI.

Root cause: Meta gates auth templates behind **business verification**
(`business_verification_status` on the WABA is `not_verified`). This is a policy gate — no
token, template shape, or UI path bypasses it. Do **not** work around it by putting OTP text in
a UTILITY/MARKETING template: Meta's reviewer auto-rejects or recategorizes those, and it can
hurt account standing.

## Remaining checklist (in order)

1. ☐ **Business verification clears** (Security Center → in review). Also lifts the
   250 business-initiated conversations/24h cap to the 1K auto-scaling tier.
2. ☐ **Create the OTP template** in WhatsApp Manager → Message templates:
   - Category **Authentication**, name `lynia_otp`, language **English (`en`)** — must match
     `WHATSAPP_TEMPLATE_LANG` default
   - Code delivery: **Copy code** (matches `WHATSAPP_OTP_COPY_CODE_BUTTON=true` default; the
     one-tap variant would additionally need Android package `zw.co.lynia` + the release
     signing-key hash — defer until production builds exist)
   - Security recommendation on; code expiration **5 minutes** (matches `OTP_TTL_SECONDS=300`)
3. ☐ **Create a system user + permanent token** (Business Settings → Users → System users →
   Admin → assign the `LyniaGo` app + the WABA → generate token, scopes
   `whatsapp_business_messaging` + `whatsapp_business_management`, expiry never). The API-Setup
   token expires after 24h and must never ship.
4. ☐ **Store the permanent token in GCP Secret Manager** as `WHATSAPP_ACCESS_TOKEN`
   (see docs/LAUNCH-EXECUTION-RUNBOOK.md — it's already in the Terraform secret list).
5. ☐ **Register the real production sender number** (a +263 number not actively registered on
   the consumer/Business WhatsApp app; it must receive an SMS or voice call). Swap its phone
   number ID into `WHATSAPP_PHONE_NUMBER_ID`, set the display name (reviewed by Meta).
6. ☐ **Smoke-test and flip config**:
   ```
   WHATSAPP_PHONE_NUMBER_ID=<prod number id>   # test number: 1190877637449470
   WHATSAPP_ACCESS_TOKEN=<system-user token, via Secret Manager>
   WHATSAPP_TEMPLATE_NAME=lynia_otp
   OTP_CHANNEL=whatsapp
   ```
7. ☐ **Register the delivery-status webhook** (bug-hunt WA-01 follow-up: without it, an async send
   failure — bad number, quality-rating throttling, recipient blocked the business — is invisible to
   both the user and ops, since `POST /messages` returning 200 only means Meta accepted the send into
   its queue, not that it was delivered). App dashboard → WhatsApp → Configuration → Webhook:
   - Callback URL: `https://<api host>/webhooks/whatsapp`
   - Verify token: any secret string, set as both the dashboard's "Verify token" field AND
     `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (answers Meta's one-time GET subscription handshake)
   - Subscribe to the `messages` field (carries `statuses[]` delivery events)
   - Store the app's **App Secret** (App settings → Basic) as `WHATSAPP_APP_SECRET` in Secret
     Manager — signs the webhook's `X-Hub-Signature-256`, verified server-side before any payload
     is trusted
   - Failed deliveries land in the API logs (`WhatsApp OTP delivery failed: <reason>`) and the
     `whatsapp_otp_delivery_failed_total` counter metric, labelled by Meta's coarse failure reason

## Until then

Development and QA are **not blocked**: use `OTP_CHANNEL=console` (+ `OTP_TEST_PHONES` for
device testing) — the send-adapter design (E4) exists precisely to absorb this onboarding
delay. `OTP_TEST_PHONES` must be empty and `OTP_CHANNEL=whatsapp` before real launch
(docs/PILOT-READINESS.md).

To sanity-check credentials end-to-end at any time (mirrors what `WhatsAppOtpSender` sends —
requires the recipient to be a verified test recipient on the API Setup page while on the test
number):

```bash
curl -X POST "https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"<recipient digits, no +>","type":"template","template":{"name":"lynia_otp","language":{"code":"en"},"components":[{"type":"body","parameters":[{"type":"text","text":"123456"}]},{"type":"button","sub_type":"url","index":"0","parameters":[{"type":"text","text":"123456"}]}]}}'
```
