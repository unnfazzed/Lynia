# Review — Ship-stage follow-ups (engineering · CEO · design)

> gstack-style triage of the post-launch follow-up tasks, reviewed through three independent
> lenses before execution. The API is live on GCP behind the external HTTPS load balancer at
> `https://lyniago.lyniafinance.com` (`{"status":"ok","db":true,"redis":true}`), ingress locked to
> the LB. Date: 2026-06-29.
>
> **Method note:** the gstack `/review` / `/plan-*-review` skills cannot run in this environment
> (the egress policy blocks installing gstack), so each lens is an independent structured reviewer
> applying the same gate. Run the real gstack passes locally if desired.

## Verdicts

| Task | Engineering | CEO / product | Design | Decision |
|------|-------------|---------------|--------|----------|
| **A. Point mobile app at the live HTTPS API** | EXECUTE-NOW | DO-NOW (highest leverage) | DO-NOW + UX follow-ons | **✅ EXECUTED** |
| B. Production OTP via WhatsApp BSP | BLOCKED (vendor) | BLOCKED-EXTERNAL | copy: name the WhatsApp channel | **Blocked — founder (BSP onboarding)** |
| C. FCM push (live send) | BLOCKED (Firebase project) | DEFER | deferred (no app push dep yet) | **Blocked — founder (Firebase project)** |
| D. OTEL traces → collector | DEFER (needs endpoint) | DEFER (cost vs pilot volume) | no user surface | **Defer — endpoint decision** |
| E. Real Didit ZIM-ID KYC run | BLOCKED (vendor) | BLOCKED-EXTERNAL (gates supply) | declined-state UX gap | **Blocked — founder (Didit account)** |
| F1. Drop Cloud SQL public IP | DEFER (breaks CI migrations) | DEFER | n/a | **Defer — needs VPC-internal migrator first** |
| F2. Redis STANDARD_HA | DEFER (cost) | DEFER (contradicts lean decision) | n/a | **Defer — pre-launch** |
| F3. Cloud SQL REGIONAL | DEFER (cost) | DEFER (contradicts lean decision) | n/a | **Defer — pre-launch** |
| F4. Tighten bucket CORS | DEFER (admin origin unknown) | carve-out: do when admin ships | affects admin image display | **Defer — pair with admin deploy** |

Only **Task A** cleared all three gates. B/C/E are external-unlock-gated (founder/vendor); D and F are
deliberately deferred — F2/F3 would contradict the documented lean-pilot decision (BASIC Redis / ZONAL
SQL until pre-launch), and F1 would break `prisma migrate deploy` from the GitHub-hosted runner (the
Cloud SQL Auth Proxy uses the public IP).

## Task A — executed (cut the app over to the live API)

Three lenses agreed on DO-NOW; eng and design each added a fix needed to do it *correctly*:

1. **`apps/mobile/app.json`** — set `expo.extra.apiUrl = "https://lyniago.lyniafinance.com"`. This is the
   seam `config.ts` reads (`Constants.expoConfig.extra.apiUrl`; `WS_URL = API_URL`), so REST + Socket.IO
   both target the LB over HTTPS/WSS. Release-build guards (no-localhost, must-be-set) are satisfied;
   `EXPO_PUBLIC_API_URL` still overrides for dev/LAN.
2. **`infra/terraform/lb.tf`** — `timeout_sec = 3600` on the backend service. **Eng catch:** for a
   serverless-NEG backend, `timeout_sec` bounds the *whole* WebSocket connection, and the default 30s
   would have severed every tracking socket ~30s into a delivery (reconnect storm on a constrained
   network). The LB supports WS upgrade; the client uses `transports:["websocket"]` only.
3. **`.github/workflows/release.yml`** — `--timeout 3600` on `gcloud run deploy`. **Eng catch:** Cloud
   Run's own request timeout (default 300s) must also be raised for WS parity, else sockets cap at 5 min.
4. **`apps/mobile/src/api/client.ts`** — `AbortController` request timeout (15s). **Design catch (the
   #1 cutover risk):** `apiFetch` used raw `fetch` with no timeout, so on a weak Zimbabwe link the
   first-touch screens (`phone`, `verify`, `home`) would hang on an in-button spinner with no upper
   bound. Now a slow/stalled request fails into the existing friendly-error path within seconds.

## Reviewed follow-ups not executed (captured so nothing is lost)

- **Design — pre-auth loading discipline:** `phone`/`verify`/`home` have no skeleton/interim affordance
  and there is no global offline banner (no NetInfo). Lower-risk than the timeout (which is shipped);
  do as a focused UX pass. _Trigger:_ on-device `/qa`.
- **Design — declined KYC state (Task E):** `rider/become.tsx` branches verified-vs-not only; a
  `failed`/declined `kycStatus` is mislabeled as "pending". A real Didit run *will* produce declines —
  add an honest declined screen + redo route. _Trigger:_ pairs with the Didit run.
- **Design — OTP channel copy (Task B):** `verify.tsx` should read `channel` from `requestOtp` and tell
  the user to check WhatsApp. _Trigger:_ when the BSP channel goes live.
- **Eng — FCM infra (Task C):** once a Firebase project is linked to `lynia-500911`, the codeable parts
  are `FCM_PROJECT_ID` env + `firebasecloudmessaging`/`fcm` API enablement + a messaging role on the
  runtime SA (`roles/firebasecloudmessaging.admin` or a custom role with `cloudmessaging.messages.create`).
- **Eng — F1 path:** to drop the Cloud SQL public IP, first move migrations to a VPC-internal runner
  (private runner or a Cloud Run / Cloud Build job on the connector), then set `ipv4_enabled = false`.

## Founder / external actions to start now (long lead time)
- **WhatsApp BSP onboarding** (Task B) — approval lead time is the long pole for real signups.
- **A real-ID Didit run** (Task E) — measures the false-reject rate that gates rider onboarding.
- **Firebase project** linked to `lynia-500911` (Task C) — unlocks the codeable FCM infra above.
