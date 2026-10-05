# Lane A: real OTP delivery code paths against local fake vendors

Date: 2026-10-05 · Code: `origin/main` checkout at `/home/user/Lynia` · Report only, no repo files edited.

**Setup.** I wrote a fake vendor (a Node http server) that logs method, path, headers and body, and replies with a status, body or hang that each test sets. One fake ran per vendor: WhatsApp Graph on :4011, Bird SMS on :4012, local A2P on :4013 and Bird Verify on :4015. Each channel got its own API instance (`NODE_ENV=development`, `ts-node-dev`): whatsapp :3011, bird :3012, local-sms :3013, bird-verify :3015, the sms stub :3016, whatsapp with no credentials :3017, and bird-verify with a malformed key :3018.

**Zero-cost guard.** Every API process was started with the proxy variables unset and with `NODE_OPTIONS=--require guard.js`. That preload wraps `fetch` and refuses any host other than localhost.
- Bird Verify builds its host from the key (`https://<region>.platform.bird.com`, `apps/api/src/auth/bird-verify.ts:37-43`) and has no base-URL variable. The guard rewrote that host, and only that host, to the fake on :4015.
- The guard blocked 0 calls across all logs. Nothing reached a real vendor or production.

**Why development mode exercises the real send path.** `devCode` is only returned when the channel is console (`apps/api/src/auth/auth.service.ts:385-389`). So development mode runs the real send path for every vendor channel, and a production boot was not needed for the send tests. Production boot guards were checked by parsing `envSchema` with `NODE_ENV=production`.

Phones used: `+263773000001`–`+263773000013`. Each test sent a unique `X-Forwarded-For` (`TRUST_PROXY=1`), so the per-IP verify throttle was never shared with other lanes.

## Results

| # | Step | Expected (from code, file:line) | Actual | Result |
|---|---|---|---|---|
| 1 | WhatsApp: request shape | POST `{BASE}/{v21.0}/{PHONE_NUMBER_ID}/messages`, `Bearer <token>`, template name/lang, code in the body param **and** in the url button, `to` as digits with no `+` (otp-sender.ts:52-67, 96-105) | `POST /v21.0/PNID123/messages`, `Bearer EAA…`, `template.name=lynia_otp`, `language.code=en`, body and button both carried the code, `to=263773000001` | PASS |
| 2 | WhatsApp: local-format input `0773 000 002` | normalized to E.164 (auth.service.ts:352) | fake received `to=263773000002` | PASS |
| 3 | WhatsApp: delivered code verifies | stored hash matches (auth.service.ts:376, 521-523) | wrong code → 401 "Invalid code"; delivered code → 201 with tokens | PASS |
| 4 | Bird SMS: request shape | POST `{BIRD_BASE_URL}/v1/sms/messages`, `Bearer <key>`, a fresh `idempotency-key`, `{to:E.164 with +, text, category:"authentication", from}`; text is `"<code> is your <brand> verification code. Don't share it with anyone."` plus `\n\n<hash>` (otp-sender.ts:129-153, 175-196) | exactly that: `to=+263773000003`, `from=LyniaGo`, `category=authentication`, hash `AbCdEfGhIjK` on its own last line, UUID idempotency key | PASS |
| 5 | Bird SMS: delivered code verifies, sms_id logged with masked phone | (otp-sender.ts:214-216) | 201 with tokens; log `Bird OTP accepted → +263•••••0003 (sms_id=fake-msg-1)` | PASS |
| 6 | local-sms: request shape | POST `LOCAL_SMS_API_URL`, `Bearer <key>`, `{to:E.164, from:SENDER_ID, message}` (otp-sender.ts:230-271) | `POST /send`, `{to:"+263773000004", from:"LyniaGo", message:"<code> is your LyniaGo …\n\nAbCdEfGhIjK"}` (82 chars, within the 140-byte limit) | PASS |
| 7 | local-sms: delivered code verifies | | 201 with tokens | PASS |
| 8 | Bird Verify: create request | POST `/v1/verify/verifications`, `{to:{phone_number:E.164}, options:{code_length:6, channels:["whatsapp"]}}`, Bearer key (bird-verify.ts:76-82) | exactly that | PASS |
| 9 | Bird Verify: check + verify | POST `/v1/verify/verifications/check` `{to, code}`; `success:true` mints a session; `incorrect_code` → 401 Invalid (bird-verify.ts:123-138) | incorrect_code → 401 "Invalid code"; success → 201 with tokens | PASS |
| 10 | Bird Verify: re-check after final (vendor 404) | 404 is treated as "expired" and routed to the grace path, so the same code is re-accepted (bird-verify.ts:128, auth.service.ts:540-545) | same code → 201 (grace); a different code → 401 "Code expired or never requested" | PASS |
| 11 | Bird Verify: `attempts_exhausted` / `expired` | → "locked" / "expired" (bird-verify.ts:136-137) | 401 "Too many attempts — request a new code" / 401 "Code expired or never requested" | PASS |
| 12 | Vendor 400/401/429/500 on send (whatsapp, bird, local-sms, bird-verify create) | 503 "Couldn't send the code — try again in a moment." (otp-sender.ts:110-115, 201-207, 276-281; bird-verify.ts:87-91) | all 16 combinations → 503 with that copy, about 10 ms | PASS |
| 13 | Vendor hangs 35 s | aborted at 10 s → 503 (otp-sender.ts:44,104; bird-verify.ts:10,58) | all 4 channels → 503 after 10.0 s; log "aborted due to timeout". The mobile client's 15 s timeout (apps/mobile/src/net/network-policy.ts:30) is longer, so the user sees the server's message | PASS |
| 14 | Vendor 2xx with malformed JSON on send | whatsapp and local-sms don't parse; bird swallows the parse error (otp-sender.ts:214-219) | all → 201 `sent:true` | PASS |
| 15 | Bird Verify create: 2xx with malformed or missing `last_channel` | falls back to "sms" (bird-verify.ts:49-51, 92-94) | `deliveryChannel:"sms"`, although Bird was only ever asked for WhatsApp | FAIL (Polish) |
| 16 | Bird Verify check: vendor 500/401 or hang | 503 and not counted as a wrong guess (bird-verify.ts:105-107, 129-133) | 503 "Couldn't verify the code — try again in a moment." (hang: after 10 s) | PASS |
| 17 | Bird Verify check: 200 with malformed JSON | the comment at bird-verify.ts:105-107 says a vendor failure is never counted as a wrong guess | 401 "Invalid code"; the app shows "That code isn't right" | FAIL (Polish) |
| 18 | OTP stored after a failed send? | `store.put` runs **before** `sender.send` (auth.service.ts:376-377) | yes: the code from a send that returned 500 still verifies (201) | Observed (see F1) |
| 19 | Failed **resend** invalidates the code already delivered | the same ordering overwrites the stored hash | code A delivered OK → resend fails with 503 → code A now gives 401 "Invalid code" | FAIL (Fix soon) |
| 20 | Rate-limit slot used up by failed sends | `enforceRate` runs before the send (auth.service.ts:362-364) | `rl:phone:+263773000006` = 4 after 4 vendor failures; with the default `OTP_RL_PHONE_MAX=5` a vendor outage locks the number out for an hour | Observed (see F2) |
| 21 | Fallback channel on vendor failure | none by design (env.ts:168-178; bird-verify.ts:12-22) | none; 503 every time | PASS (matches design) |
| 22 | Secrets or PII in client responses and logs | code never logged; phone masked (otp-sender.ts:112, 204) | 0 hits in all API logs for any token or key, the app secret, a full phone number, or any delivered code. The vendor error body is logged verbatim (up to 300 chars), so a vendor that echoes the request puts the **full phone and the code** in the log (tested with an echoing 422) | PASS (with a caveat, see O3) |
| 23 | Missing credentials at send time | 503 "Couldn't send the verification code — try again shortly." (otp-sender.ts:85-90) | :3017 → 503 with that copy; the log names the missing variables | PASS |
| 24 | Bird Verify key with the wrong shape | throws inside the try → 503 (bird-verify.ts:37-43, 75-86) | 503; log: "doesn't look like a Bird workspace key" | PASS |
| 25 | `OTP_CHANNEL=sms` in development | stub returns success and delivers nothing (otp-sender.ts:285-295) | 201 `sent:true`, nothing sent (production rejects this, row 29) | PASS (matches design) |
| 26 | WhatsApp webhook GET handshake | 200 echoing the challenge only when the token matches and the challenge is all digits; otherwise 403 (whatsapp-webhook.controller.ts:33-46) | valid → 200 `12345`; wrong token → 403; `<script>` challenge → 403; no token configured → 403 | PASS |
| 27 | WhatsApp webhook POST signature | HMAC-SHA256 of the raw body with `WHATSAPP_APP_SECRET`, checked in constant time; a missing or bad signature → 401; `status:"failed"` is logged as its title, no phone (whatsapp-webhook.controller.ts:57-83, whatsapp-webhook.ts:36-62) | valid → 201 and log "WhatsApp OTP delivery failed: Re-engagement message"; bad, missing, or same signature over a re-serialized body → 401. **The success status is 201, not 200** | PASS (see F4) |
| 28 | Bird webhook (Standard Webhooks) | HMAC over `id.ts.body` with the decoded `whsec_` key; any matching `v1,` entry passes; 300 s replay window (bird-webhook.controller.ts:43-86, bird-webhook.ts:104) | valid → 201 and log "Bird OTP delivery failed (code=E12003, sms_id=…)" with no phone; a rotated multi-signature header → 201; bad signature → 401; tampered id → 401; correctly signed but 1 h old → 401 "outside the replay window". Replaying the same valid `webhook-id` inside the window → 201 again and counted twice | PASS (see O5) |
| 29 | Production boot guards (envSchema with `NODE_ENV=production`) | console and sms rejected (env.ts:472-481); vendor credentials deliberately optional (env.ts:209-214, 220-222, 253) | console → REJECTED; sms → REJECTED; whatsapp, bird, local-sms or bird-verify **with no credentials → BOOTS**; bird-verify with a malformed key → BOOTS; whatsapp with no `WHATSAPP_APP_SECRET` → BOOTS; console with `APP_ENV=staging` → BOOTS (intended) | PASS as coded (see F3) |
| 30 | Unconfigured webhooks in production | unsigned POST rejected in production or when the channel matches (whatsapp-webhook.controller.ts:62; bird-webhook.controller.ts:49) | development with a non-matching channel → 201 accepted (by design). Production not booted | PASS (from code) |
| 31 | Mobile: how request errors appear | phone.tsx:45-46 and verify.tsx:100-101 show `ApiError.message`, which is the server's `message` (apps/mobile/src/api/client.ts:308-317) | a 503 shows "Couldn't send the code — try again in a moment."; a 429 shows "Too many requests — try again later" | PASS (from code) |
| 32 | Mobile: how verify errors appear | 401 containing expired/never requested/too many → "That code has expired" + "Send a new code"; other 401/400/422 → wrong-code line; 503 → server message (verify.tsx:134-142, src/logic/otp.ts:37-47) | maps the server strings above correctly | PASS (from code) |
| 33 | Mobile: channel copy on SMS channels | "Sent on WhatsApp"/"Sent by SMS" follows `deliveryChannel` (verify.tsx:181, copy.ts:33-34) | the sent line is correct, but the resend button **always** says "Resend on WhatsApp" (verify.tsx:254-263, copy.ts:37), even on bird or local-sms | FAIL (Polish) |
| 34 | Android SMS Retriever hash | appended when configured | appended correctly, but the app has no SMS Retriever integration (no matches in apps/mobile). Auto-fill relies on `autoComplete="sms-otp"` and `textContentType="oneTimeCode"` (verify.tsx:229-230), so the hash does nothing today | Observed (O2) |

## Failures

- **F1 / F-19: a failed resend kills the code that was already delivered.** Tag: **Fix soon**. A user who got a working code and tapped "Resend" while the vendor was failing sees "Couldn't send the code". The code already in their WhatsApp or SMS then says "That code isn't right", so they are stuck until a resend succeeds. Suspected cause: `apps/api/src/auth/auth.service.ts:376-377` writes `store.put` before `sender.send` and does not restore the previous hash when the send fails.
- **F2: failed sends use up the per-phone quota.** Tag: **Fix soon**. During a WhatsApp, Bird or gateway outage, each "try again" uses one of the 5 hourly slots for that number. Once the vendor recovers, the user still gets "Too many requests — try again later" for up to an hour. Suspected cause: `auth.service.ts:362-364` rate-limits before the send and has no refund when the send throws.
- **F3: production boots with no vendor credentials.** Tag: **Fix soon** (deliberate per env.ts comments). If a secret is missing or misnamed, the API reports healthy but every sign-up and sign-in fails with 503 "Couldn't send the verification code". The only signal is an ERROR log line on each request. Location: `apps/api/src/config/env.ts:196-274` (all `WHATSAPP_*`, `BIRD_*` and `LOCAL_SMS_*` are optional; the production block at env.ts:465-498 only rejects console and sms). A boot guard keyed on the selected `OTP_CHANNEL` would close this.
- **F4: the webhook success status is 201, not 200.** Tag: **Fix soon (verify against Meta's docs)**. Meta's webhook docs ask for a 200 OK. If Meta treats 201 as a failure, it will retry each status event and eventually flag the endpoint. Bird (Standard Webhooks) accepts any 2xx. Location: `apps/api/src/auth/whatsapp-webhook.controller.ts:57` and `bird-webhook.controller.ts:43` (`@Post()` with no `@HttpCode(200)`).
- **F-15: Bird Verify says "SMS" when Bird's reply lacks `last_channel`.** Tag: **Polish**. If Bird's create reply is malformed or omits `last_channel`, the app says "Sent by SMS" while the code goes to WhatsApp. Location: `apps/api/src/auth/bird-verify.ts:49-51, 92-94`. Since `CHANNELS` is `["whatsapp"]` only, the fallback should be "whatsapp".
- **F-17: Bird Verify counts a garbled vendor reply as a wrong guess.** Tag: **Polish**. A 200 with an unparseable body from Bird is reported to the user as "That code isn't right", which contradicts the comment at bird-verify.ts:105-107. Location: `bird-verify.ts:134-138` (`.catch(() => ({}))` falls through to `reason:"invalid"`).
- **F-33: the resend label is hard-coded to WhatsApp.** Tag: **Polish**. On the bird and local-sms channels the screen says "Sent by SMS" but the button says "Resend on WhatsApp". Location: `apps/mobile/app/verify.tsx:257,263` and `apps/mobile/src/ui/onboarding/copy.ts:37`. The calm-mint-v2 handoff assumes WhatsApp only, so fixing this needs a design-deviation ledger entry or a copy decision.

## Observations

- **O1.** A vendor 429 maps to a generic 503 with no `Retry-After`. The user gets "try again in a moment" with no hint of how long to wait.
- **O2.** The SMS text puts the code first, includes the brand, stays under 140 bytes, and puts the hash alone on the last line. That is a correct SMS Retriever format. But the mobile app never calls the Retriever API, so `BIRD_ANDROID_SMS_HASH` and `LOCAL_SMS_ANDROID_HASH` only add noise to the SMS until it does.
- **O3.** Vendor error bodies are logged verbatim, up to 300 chars (otp-sender.ts:113, 205, 279; bird-verify.ts:89, 131). With an echoing fake, the log line contained the full `+263…` number and `"text":"<6-digit code> is your…"`. Real Meta and Bird errors are not known to echo the request, so this is a latent risk, not an observed leak.
- **O4.** The code stored before a send survives a send failure. If the vendor actually delivered but answered 5xx or timed out, the user can still sign in. That is a mild upside of the same ordering that causes F1.
- **O5.** The Bird webhook does not dedupe on `webhook-id`. A retried event inside the 300 s window is logged and counted twice, which inflates the per-carrier failure and delivered metrics.
- **O6.** The local-sms request shape (`{to, from, message}` with a Bearer key) is a generic placeholder (otp-sender.ts:224-232). It must be matched to the real Zimbabwe gateway's API before that channel is used.
- **O7.** The Bird Verify host is derived from the key, and there is no base-URL override like `BIRD_BASE_URL` or `WHATSAPP_GRAPH_BASE_URL`. So it cannot be pointed at a staging fake without patching `fetch` (this lane used a `--require` preload).
- **O8.** In development, unsigned WhatsApp webhook POSTs are accepted when `OTP_CHANNEL=bird-verify`, even though bird-verify delivers over WhatsApp. That only matters in development; production rejects them (whatsapp-webhook.controller.ts:62).

<details><summary>Evidence (tokens redacted; codes shown only where needed to prove the round-trip)</summary>

**WhatsApp send (fake :4011), then request 201 / verify 201**
```
POST /v21.0/PNID123/messages  authorization: Bearer EAA…[redacted]  content-type: application/json
{"messaging_product":"whatsapp","to":"263773000001","type":"template","template":{"name":"lynia_otp",
 "language":{"code":"en"},"components":[{"type":"body","parameters":[{"type":"text","text":"297091"}]},
 {"type":"button","sub_type":"url","index":"0","parameters":[{"type":"text","text":"297091"}]}]}}
verify 000000 -> 401 {"message":"Invalid code"} ; verify 297091 -> 201 {"accessToken":"eyJ…",…}
```
**Bird SMS (fake :4012)**
```
POST /v1/sms/messages  authorization: Bearer bk_eu1_…[redacted]  idempotency-key: 4165cbc8-…
{"to":"+263773000003","text":"257705 is your LyniaGo verification code. Don't share it with anyone.\n\nAbCdEfGhIjK",
 "category":"authentication","from":"LyniaGo"}
LOG [BirdOtpSender] Bird OTP accepted → +263•••••0003 (sms_id=fake-msg-1)
```
**local-sms (fake :4013)**
```
POST /send  authorization: Bearer …[redacted]
{"to":"+263773000004","from":"LyniaGo","message":"800992 is your LyniaGo verification code. Don't share it with anyone.\n\nAbCdEfGhIjK"}
```
**Bird Verify (fake :4015 via the host rewrite)**
```
POST /v1/verify/verifications  {"to":{"phone_number":"+263773000005"},"options":{"code_length":6,"channels":["whatsapp"]}}
POST /v1/verify/verifications/check  {"to":{"phone_number":"+263773000005"},"code":"111111"}  -> fake incorrect_code -> 401 Invalid code
POST …/check  code 222222 -> fake success -> 201 tokens ; fake 404 -> same code 201 (grace), other code 401 expired
malformed 200 on create -> {"sent":true,"channel":"bird-verify","deliveryChannel":"sms"}
malformed 200 on check  -> 401 {"message":"Invalid code"}
```
**Failure matrix**
```
whatsapp/bird/local-sms/bird-verify × 400,401,429,500 -> 503 {"message":"Couldn't send the code — try again in a moment."} (~10ms)
hang 35s (all 4) -> 503 after 10.0s ; log "… network error: The operation was aborted due to timeout"
redis rl:phone:+263773000006 = 4 after 4 failed sends
F1: req OK (code A) -> req 503 -> verify A -> 401 {"message":"Invalid code"}
echo test (Bird 422 echoing request): log line contained "+263773000012" and "\"text\":\"[6-digit code] is your"
```
**Webhooks**
```
GET  ?hub.mode=subscribe&hub.verify_token=<ok>&hub.challenge=12345 -> 200 "12345" ; bad token -> 403 ; challenge=<script> -> 403
POST /webhooks/whatsapp valid sha256 -> 201 {"received":true} ; bad/missing/re-serialized -> 401 Invalid webhook signature
POST /webhooks/bird valid v1 -> 201 ; "v1,AAAA v1,<good>" -> 201 ; bad -> 401 ; id tampered -> 401 ; ts-3600 -> 401 replay window
WARN [BirdWebhookController] Bird OTP delivery failed (code=E12003, sms_id=fake-msg-1) — the recipient never got the code.
```
**Production envSchema**
```
console REJECTED · sms REJECTED · whatsapp/bird/local-sms/bird-verify without creds BOOTS · bird-verify key "notabirdkey" BOOTS · console+APP_ENV=staging BOOTS
```
</details>

## Still needs a real phone

- Actual receipt of the WhatsApp template on a +263 handset: Meta template approval, rendering, and whether the copy-code / one-tap button works.
- Actual SMS receipt on Econet, NetOne and Telecel through Bird and through the local gateway. That covers sender-ID display (alphanumeric "LyniaGo" registration), carrier grey-route filtering, and end-to-end delivery latency compared with the app's resend cooldown.
- Auto-fill behaviour: iOS `oneTimeCode`, and Android `sms-otp` autofill with and without the hash line.
- Bird Verify's real response shape (`last_channel` present at create time?), its expiry, attempt limit and cooldown, and whether a second check returns 404.
- Real delivery-status webhooks from Meta and Bird reaching the public API: signature format as sent, whether Meta accepts a 201, and retry behaviour.
- The local-sms gateway's real request contract (O6).
