# Bird SMS OTP setup — arming runbook

_Last updated: 2026-07-25. Tracks the Bird ([bird.com](https://bird.com)) SMS onboarding for the
OTP channel (`OTP_CHANNEL=bird`). Backend integration is **complete and unit-tested**
(`apps/api/src/auth/otp-sender.ts` → `BirdOtpSender` + `buildBirdSmsRequest`); this doc is the
founder-side arming checklist — an account, a key, and three repo Variables, not code._

Bird is the **priority launch OTP channel** (product decision 2026-07-19): it delivers the code as a
plain SMS while WhatsApp Business verification is still pending, and reverting is a one-line
`OTP_CHANNEL` flip. See `docs/WHATSAPP-SETUP.md` for the WhatsApp path and `docs/PILOT-READINESS.md`
for how vendor config reaches the running service.

For driving the Bird **dashboard/API from a Claude Code session** (inspecting channels, chasing a
message that never arrived), see [Agent tooling](#agent-tooling--mcp-server--skills) at the end of
this doc — that is a separate, per-developer credential and is **not** part of arming the channel.

## What is already built (no code work remains)

- **Sender** — `BirdOtpSender.send()` POSTs the OTP to Bird's SMS API (`POST /v1/sms/messages`). It
  fails **loud**: missing credentials or a non-2xx from Bird throws, so `requestOtp` surfaces an error
  instead of a false "sent". The OTP code is never logged (only Bird's error body is).
- **Request shape** — `buildBirdSmsRequest()` addresses the recipient as an E.164 number (the `+`
  is kept, unlike Meta's Graph API), carries the text in `text`, and always tags `category:
  "authentication"` — how Bird classifies the traffic for routing and carrier filtering. The message
  body is the shared autofill-friendly text (`buildOtpSmsText` — code first, so iOS Security-Code
  AutoFill and Android's `sms-otp` hint pick it up), measured at **69 chars / 1 segment / GSM_7BIT**.
- **We still own the code** — generation, HMAC hashing, TTL, rate-limits, and verification all stay
  in `otp-store.ts`. Bird is a **delivery pipe only**, so the entire verify path, brute-force caps,
  and session issuance are identical to the WhatsApp channel.
- **Deploy wiring** — `.github/workflows/release.yml` injects the Bird config, opt-in via
  `BIRD_ENABLED=true` (so a launch-safe deploy never references `BIRD_ACCESS_KEY` before it exists).
  A pre-flight guard rejects the deploy if `OTP_CHANNEL=bird` but the credentials aren't armed —
  the service can never boot green and then 503 every sign-in.
- **Secret container** — `infra/terraform/secrets.tf` pre-lists `BIRD_ACCESS_KEY`; the runtime SA's
  read binding is managed by `scripts/adopt-vendor-secrets.sh`.
- **Tests** — `apps/api/src/auth/otp-sender.spec.ts` covers the request shape, the `Bearer` header,
  the `authentication` category, the per-send idempotency key, `from` passthrough/omission, the
  202-Accepted success path, the loud-throw on rejection, and that the code is never logged.

> **Superseded (2026-07-25):** this doc previously described Bird's **Channels API**
> (`/workspaces/{ws}/channels/{ch}/messages`, `Authorization: AccessKey`, host `api.bird.com`). That
> route answers `RouteNotFound` on the regional hosts and there is no channel concept in Bird's
> current CLI. The integration now targets `POST /v1/sms/messages`. `BIRD_WORKSPACE_ID` and
> `BIRD_SMS_CHANNEL_ID` are **gone** — the API key is workspace-scoped and the SMS API has no channels.

## Config reference

| Name | Kind | Required | Where it comes from |
|---|---|---|---|
| `OTP_CHANNEL` | repo Variable | ✅ set to `bird` | flips the live channel |
| `BIRD_ENABLED` | repo Variable | ✅ set to `true` | arms the `release.yml` injection block |
| `BIRD_SMS_FROM` | repo Variable | ✅ | the sender ID, e.g. `LyniaGo`. **Required for +263** — without it Bird has no eligible shared-pool sender and rejects every send with `E12003` |
| `BIRD_ACCESS_KEY` | Secret Manager | ✅ | Bird dashboard → API keys (`bk_<region>_…`, sent as `Authorization: Bearer <key>`) |
| `BIRD_BASE_URL` | repo Variable | optional | defaults to `https://eu1.platform.bird.com`. **Region-scoped** — must match the workspace's region (`bird auth status` reports it; the key prefix encodes it) |
| `BIRD_BRAND_NAME` | repo Variable | optional | defaults to `LyniaGo` — shown in the SMS body |
| `BIRD_ANDROID_SMS_HASH` | repo Variable | optional | 11-char SMS Retriever app-hash for zero-tap autofill (defer until a release build exists) |

The request Bird receives:

```
POST {BIRD_BASE_URL}/v1/sms/messages
Authorization: Bearer {BIRD_ACCESS_KEY}
Content-Type: application/json
Idempotency-Key: <uuid, fresh per send>

{"to":"+263771234567","text":"123456 is your LyniaGo verification code. Don't share it with anyone.",
 "category":"authentication","from":"LyniaGo"}
```

Bird returns **202 Accepted** on success (`res.ok`, 200–299, covers it) — but `accepted` means Bird
**took** the message, not that it landed. Delivery is asynchronous
(`accepted → sent → delivered | undelivered | failed | rejected | expired`) and the send path cannot
observe the outcome. That is what the delivery-status webhook below is for; the send logs the
returned `sms_id` next to the **masked** number so a failure event can be traced back to a sign-in.

### Verified end-to-end (2026-07-25)

A live send to a real Econet handset, via `bird sms send --from LyniaGo --category authentication`:

| | |
|---|---|
| `status` | `accepted` → **`delivered`** in **6.6 s** |
| `mcc_mnc` | `64804` — Econet Wireless Zimbabwe |
| `segments` | `{characters: 69, count: 1, encoding: GSM_7BIT}` — one segment, no UCS-2 penalty |
| `cost` | **€0.195173** per message |
| `from` | `LyniaGo` accepted with no sender pre-registration |

That retires the grey-route risk this doc previously flagged as the main unknown for `+263`. Note the
per-message cost: at ~€0.20 an OTP, send-side rate limits are a spend control, not just an abuse
control.

## Arming checklist (in order)

You have paid for SMS — these are the remaining steps. All need founder credentials (Bird dashboard,
GCP, and repo admin); none are code.

1. ☐ **Mint one API key** in the Bird dashboard (Settings → API keys), scoped to send SMS. The value
   looks like `bk_eu1_…` and becomes `BIRD_ACCESS_KEY`. That is the **only** ID needed — the key
   carries the workspace, and the SMS API has no channels.

   ✅ **Already confirmed for this account** (2026-07-25), so nothing to discover here:
   workspace `LyniaGo` / `ws_01kxv3schvem4a89399mk86188`, region **eu1**, sender **`LyniaGo`**.

2. ☑ **Confirm the sender reaches Zimbabwe (+263)** — **done, see "Verified end-to-end" above.**
   `LyniaGo` was accepted as an alphanumeric sender with no pre-registration and delivered to Econet
   (`mcc_mnc 64804`) in 6.6 s. Set it as `BIRD_SMS_FROM`; **omitting it fails every send with
   `E12003`**, because Bird's shared pool has no eligible sender for `+263`.

   Re-run the proof any time with the `bird` CLI (see "Agent tooling" below):
   ```bash
   bird sms send --to +263… --from LyniaGo --category authentication --text "…"
   bird sms get <sms_…>       # poll until status=delivered — "accepted" is not delivery
   ```
   If Econet ever does start grey-listing this route, the `local-sms` channel is the backstop.

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

4. ☐ **Smoke-test the key end-to-end** (mirrors exactly what `BirdOtpSender` sends). Use a recipient
   you control. A 202 proves the **key** works; then read the message back, because 202 only means
   Bird accepted it:

   ```bash
   curl -i -X POST "https://eu1.platform.bird.com/v1/sms/messages" \
     -H "Authorization: Bearer <BIRD_ACCESS_KEY>" \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: $(uuidgen)" \
     -d '{"to":"+263771234567","from":"LyniaGo","category":"authentication","text":"123456 is your LyniaGo verification code. Don'"'"'t share it with anyone."}'

   # then confirm it actually landed (status must reach "delivered")
   curl -s "https://eu1.platform.bird.com/v1/sms/messages/<sms_id>" \
     -H "Authorization: Bearer <BIRD_ACCESS_KEY>" | jq '{status, delivered_at, last_error, cost}'
   ```

5. ☐ **Set the repo Variables** (Settings → Secrets and variables → Actions → Variables, or `gh`):

   ```bash
   gh variable set OTP_CHANNEL   --body "bird"
   gh variable set BIRD_ENABLED  --body "true"
   gh variable set BIRD_SMS_FROM --body "LyniaGo"
   # Optional overrides (defaults are eu1.platform.bird.com / LyniaGo / no Android hash;
   # override BIRD_BASE_URL only if the workspace is not in eu1):
   # gh variable set BIRD_BRAND_NAME --body "LyniaGo"
   ```

   If QA test-mode variables are still set from vendor-free testing, clear them so the live channel
   is Bird, not console: `gh variable delete OTP_TEST_PHONES` (and any `KYC_PROVIDER=stub` /
   `OTP_CHANNEL=console` left over — see `docs/PILOT-READINESS.md` "Turn QA mode OFF").

6. ☐ **Redeploy** — push to `main` (or `gh workflow run release.yml --ref main`). The release job's
   "Validate production launch-hygiene config" step confirms Bird is fully armed before it builds:
   if `OTP_CHANNEL=bird` but `BIRD_ENABLED != true` or `BIRD_SMS_FROM` is empty, it fails
   fast with the exact remediation instead of shipping a service that 503s every OTP.

7. ☐ **Verify on a real device** — request an OTP from the app against the live API and confirm the
   SMS arrives and the code verifies. Watch the API logs for `Bird OTP send failed:` (the loud path
   logs Bird's error — revoked key, no eligible sender for the destination (E12003), insufficient
   wallet balance, unregistered sender — never the code).

## Rollback

Reverting is a one-line flip — no redeploy of code:

```bash
gh variable set OTP_CHANNEL --body "whatsapp"   # or "local-sms" for the A2P fallback
gh workflow run release.yml --ref main
```

`BIRD_ENABLED` can stay `true` (the injection is inert unless `OTP_CHANNEL=bird`), so flipping back
to Bird later is just re-setting `OTP_CHANNEL=bird`.

## Delivery-status webhook (arms separately)

`POST /webhooks/bird` (`bird-webhook.controller.ts`) receives Bird's async `sms.*` events — the only
signal that an accepted OTP never reached the handset. Without it a dropped code is invisible to
both the user (waiting forever) and ops (no log, no metric).

It is **observability only**: a log line plus `bird_otp_delivery_failed_total{status,code}` per
non-delivery, no DB write. Labels are closed vocabularies (`undelivered|failed|rejected|expired` and
Bird's error code); the carrier's own `carrier_error_code` is excluded as unbounded, and the phone
number never reaches a log or a label.

Bird uses the **Standard Webhooks** format, verified fail-closed: HMAC-SHA256 over
`{webhook-id}.{webhook-timestamp}.{raw body}`, base64, constant-time compared, with a **5-minute
replay window** (a captured delivery stays validly signed forever, so age is the only thing that
stops a replay). A signature-valid delivery whose body we cannot parse is swallowed rather than
500'd — erroring back at Bird would trigger its retry storm for a fault that is purely ours.

**Arming, in this order** (the flag is separate from `BIRD_ENABLED` because the deploy resolves
`BIRD_WEBHOOK_SECRET:latest`, and referencing a container with zero versions fails the deploy):

1. ☐ **Create the endpoint** — dashboard (Developers → Webhooks) or CLI, subscribed to the
   non-delivery events:
   ```bash
   bird webhooks create https://lyniago.lyniafinance.com/webhooks/bird \
     --events sms.delivered,sms.undelivered,sms.failed,sms.rejected,sms.expired
   ```
   > **Capture the `secret` (`whsec_…`) from the create response immediately** — Bird returns it
   > exactly once and it can never be retrieved again. Losing it means recreating the endpoint.

2. ☐ **Store it** as `BIRD_WEBHOOK_SECRET` in Secret Manager (same `--data-file=-` pattern as
   step 3 above, so the value never lands in shell history), then `scripts/adopt-vendor-secrets.sh`.

3. ☐ **Flip the flag and redeploy:** `gh variable set BIRD_WEBHOOK_ENABLED --body "true"`.

4. ☐ **Verify** with a real delivery — `bird webhooks test <endpoint-id>` sends a live request to the
   URL. Until step 3 lands, the receiver correctly answers **401** to everything (an unverifiable
   receiver is worse than none), so Bird may show the endpoint as degraded in the meantime.

## Agent tooling — MCP server + skills

Bird ships agent tooling so a Claude Code session can operate the Bird platform directly (list
channels, look up a message, check a sending domain) instead of the founder clicking through the
dashboard. Wired the same way as Cloudflare — see [`CLOUDFLARE.md`](./CLOUDFLARE.md) for the
identical pattern.

> **This is a per-developer credential, not runtime config.** The MCP server authenticates *you*
> against your Bird account over OAuth. It is completely separate from `BIRD_ACCESS_KEY`, which is
> the service's own key in Secret Manager and the only thing the API uses to send OTPs. Nothing in
> this section is required to arm or run the OTP channel.

### What's set up

The Bird MCP server is registered at **project scope** in [`.mcp.json`](../.mcp.json), so every
Claude Code session opened in this repo picks it up:

| Server | URL                    | Auth             | Why |
| ------ | ---------------------- | ---------------- | --- |
| `bird` | `https://mcp.bird.com` | OAuth (per user) | Messaging, channels, contacts, sending domains, webhooks |

`https://mcp.platform.bird.com` is an older alias for the same resource (same authorization server,
`https://platform.bird.com`). Prefer `mcp.bird.com` — it is the hostname Bird's own plugin ships.

### First-time authorization (required, interactive)

Authorization triggers on first tool use and opens a browser to sign in to Bird. This must be done
in an **interactive Claude Code session on your own machine** — it cannot be completed in a
headless/remote session (the same constraint as the `cloudflare` server).

1. Open this repo with `claude`.
2. Approve the project MCP servers when prompted (project-scoped servers are `Pending approval`
   until you accept them once).
3. The first time a Bird tool runs, complete the OAuth flow in the browser.

Check status any time with:

```bash
claude mcp list
```

### Skills (optional, per-developer)

Bird also publishes **agent skills** — packaged procedures that teach the agent the `bird` CLI
workflows (send/inspect email, manage sending domains, manage webhook endpoints), including the
traps: a send returns `202 accepted`, which means Bird took the message, **not** that it landed, so
the skill has the agent read the message back for the real outcome. Like gstack and the Cloudflare
skills, these are installed per-developer, not vendored into the repo:

```bash
curl -fsSL https://cli.bird.com/install.sh | sh    # the `bird` CLI the skills drive
claude plugin marketplace add messagebird/bird-ai
claude plugin install bird@bird-ai
```

Then run `/reload-plugins`. Every skill gates on `bird auth status --format json` returning
`"valid": true` before doing anything, and the CLI's exit codes are semantic — `2` bad usage/input,
`3` not found, `4` auth denied, `1` everything else — so an agent loop can branch without parsing
prose.

> **Heads-up:** the plugin's manifest declares its *own* copy of the Bird MCP server (same
> `https://mcp.bird.com`), so installing it on top of the `.mcp.json` entry above gives you two Bird
> connections. They don't collide — plugin servers are scoped, so the plugin's tools arrive as
> `mcp__plugin_bird_bird__*` while the project server's stay `mcp__bird__*` — but the tool surface
> and its per-turn context cost are duplicated. The skills only need the `bird` CLI, not the MCP
> server, so the cheapest setup is the project server for tools plus the plugin for skills, and
> living with the overlap.

### Reference

- Marketplace: <https://github.com/messagebird/bird-ai>
- Agent skills: <https://bird.com/docs/ai/agent-skills>
- MCP server: <https://bird.com/docs/ai/mcp-server>
- CLI for agents: <https://bird.com/docs/ai/cli-for-agents>
