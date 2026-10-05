# J1 · Rider registration: E2E run 1 of 7 (report only)

**Verdict: PASS with 1 Polish finding. Rider sign-up works end to end on `origin/main` @ `124395c` (OTP → name → `POST /riders/become` → verified → online → heartbeat → admin views). No launch blockers. 33 of 35 checks passed. Both failures are the same Polish issue: a correct code is used up when a new-account sign-in is refused for a device reason.**

Run: 2026-10-05 06:03–06:15 UTC, local stack only (PostGIS 16 + Redis 7 in docker, API on `:3000` with
`NODE_ENV=development OTP_CHANNEL=console KYC_PROVIDER=stub PUSH_PROVIDER=noop RESTAURANTS_ENABLED=true
MERCHANT_DISPATCH_AUTO_ENABLED=true OTP_RL_IP_MAX=1000`). I left the per-phone and per-device limits at
their defaults so that I could test them. I made no production writes and called no vendors.

## Production config snapshot (read-only, labelled)

These are read-only GETs at 06:03 UTC. They describe what production *reports*. Nothing here was tested against production.

| Endpoint | HTTP | Body |
|---|---|---|
| `GET https://api.lyniago.com/healthz` | 200 | `{"status":"ok","db":true,"redis":true,"queues":{"offerExpiry":true,"orderLifecycle":true},"provider":"azure"}` |
| `GET https://api.lyniago.com/app/feature-flags` | 200 | `{"restaurantsEnabled":true,"merchantDispatchAutoEnabled":true,"merchantWalletEnabled":true}` |

Production returns the same set of keys as `main` (`health.controller.ts:54`). The local run returned `merchantWalletEnabled:false` because that flag was not set locally.

## Results

| Step | Expected (from code) | Actual | Result |
|---|---|---|---|
| 1 OTP request, new phone | 201 `{sent, devCode}` on console channel (`auth.service.ts:385-395`) | 201, `devCode` returned, `deliveryChannel:"sms"` | PASS |
| 2 Wrong code once | 401 "Invalid code" (`auth.service.ts:532`); the app shows "That code isn't right. Check the message and try again." (`mobile/app/verify.tsx:138-139`, `onboarding/copy.ts:39`) | 401 "Invalid code" | PASS |
| 3 Verify a new account without `x-device-id` | 400 "A device id is required to create an account." (`auth.service.ts:577-579`) | 400, exact copy | PASS |
| 3a Retry the same correct code with a device id | Grace path re-accepts a code that already matched (`auth.service.ts:554`) | 401 "Code expired or never requested". The code was used up. | **FAIL · Polish** (F1) |
| 4 Verify the correct code (fresh request) with a device id | 201 tokens, `role:"customer"`, `needsProfile:true` (`auth.service.ts:588-597`) | As expected | PASS |
| 5 `GET /auth/me` | Empty name, `rider:null` | As expected | PASS |
| 6 `PATCH /auth/me` name | 200, name saved (`contracts.ts:335`) | 200 "Tendai Moyo" | PASS |
| 7 `POST /riders/become {}` (stub ID check) | 201 `{kycStatus:"verified", mode:"auto"}`. Stub + auto creates the rider already verified (`rider.service.ts:352-376`). A bike plate and photo are optional (`riders.controller.ts:14-27`). | As expected | PASS |
| 8 `/auth/me` after becoming a rider | `role:"rider"`, `rider.kycStatus:"verified"`, 5 free jobs | As expected, `freeJobs {left:5,total:5}` | PASS |
| 9 `POST /riders/become` again | Not idempotent by design: 409 `{reason:"already_rider"}` (`rider.service.ts:280`) | 409 `already_rider` "Already registered as a rider" | PASS |
| 10 `PATCH /riders/online {online:true}` in Harare | 200 `{online:true}`, heartbeat stamped (`rider.service.ts:582-640`) | 200, DB `is_online=t`, `last_heartbeat_at` set | PASS |
| 11 `POST /riders/heartbeat` | 201 `{online:true}` (`rider.service.ts:696`) | 201 `{online:true}` | PASS |
| 12 Go online from Bulawayo | 403 `out_of_area` with the towns list (`rider.service.ts:608-611`) | 403 `out_of_area` "…go online from Harare, Chitungwiza, Norton, Ruwa, Epworth, Domboshava, Mt Hampden and Goromonzi" | PASS |
| 13 `GET /wallet/config` | `ratePct` 0 at launch (`env.ts:359-366`, `wallet.service.ts:77`) | `ratePct:0, floor:2, freeFirstJobs:5` | PASS |
| 14 Non-admin `GET /admin/riders` | 403 "Admin only" (`admin.guard.ts:8`) | 403 "Admin only" | PASS |
| 20 Admin `GET /admin/riders` | Rider listed, verified, online, phone masked | `kycStatus:"verified", idVerified:true, isOnline:true`, phone `+263•••••0001` | PASS |
| 21 Admin `?kyc=verified` filter | Only verified riders | 1 row, correct | PASS |
| 22 Admin rider detail | `kyc:"verified"`, `status:"online"` | As expected | PASS |
| 23 Admin KYC review: national ID field | No ID typed and the stub returns no number, so `idNumber:null`, `idOnFile:false`, `verifiedIdNumber:null` (D-75, `rider.service.ts:296-303`) | As expected, `duplicateIdFlag:false` | PASS |
| 24 Second rider becomes a rider | 201 verified | 201 verified | PASS |
| 25 Admin sets KYC to pending (`POST /admin/riders/:id/kyc`) | 201, audit row (`kyc.controller.ts:235`) | 201, audit `rider.kyc_reset` | PASS |
| 26 Unverified rider goes online | 403 `{reason:"kyc"}` "Rider is not verified yet" (`online-gate.ts:92`) | Exact | PASS |
| 27 Unverified rider heartbeat | 403 `kyc` (`rider.service.ts:718`) | Exact | PASS |
| 28 Admin decline without a reason | 400 "A decline must record a reason." (`kyc.controller.ts:52-53`) | Exact | PASS |
| 29 Admin decline with a reason | 201, `kycAttempts` 1, rider sees `kycDeclineReason` | 201, `/auth/me` shows `kycStatus:"failed"`, `kycDeclineReason:"blurry_photo"` | PASS |
| 31 Admin `?kyc=failed` filter | The declined rider | 1 row, correct | PASS |
| 32 Admin approves | 201 verified, audit `rider.kyc_approve` with `verified_id_missing` | As expected | PASS |
| 33 Rider goes online after approval | 200 | 200 `{online:true}` | PASS |
| 34–35 Offline, then heartbeat | 200, then 403 "You're offline — go online to keep receiving jobs." (`rider.service.ts:719`) | Exact | PASS |
| 36 Non-rider goes online | 403 "Not a rider" (`rider.service.ts:591`) | Exact | PASS |
| 40 OTP requests on one phone (limit 5 per hour, `env.ts:164`) | Requests 1–5 get 201, request 6 gets 429 | Requests 1–5 got 201, request 6 got 429 "Too many requests — try again later" | PASS |
| 41 Five wrong codes, then the lock (`MAX_OTP_ATTEMPTS=5`, `auth.service.ts:28,624-626`) | Wrong guesses 1–5 get "Invalid code", guess 6 gets "Too many attempts — request a new code". The old code stays dead and a new code works. | Exact. A new code then signed in with 201. | PASS |
| 42 New accounts on one device (limit 3 per day, `env.ts:167`) | Accounts 1–3 get 201, account 4 gets 429 `{reason:"device_signup_cap"}` (`auth.service.ts:584`) | Exact | PASS |
| 42a The same correct code on a fresh device after the device-cap 429 | Would sign in | 401 "Code expired or never requested" | (same as F1) |
| 43 Malformed phone | 400 validation | 400 "phone: Too small…" | PASS |

## Failures

**F1 · Polish: a correct code is used up when a new-account sign-in is refused for a device reason.**
What a user would hit: someone whose first sign-in is refused (no device id, or the 3-accounts-per-device
cap) types the same, correct code again and is told it "expired". They have to request a new code, which
costs another message and one of their 5 requests per hour.
Cause I suspect: `checkLocalOtp` deletes the code on a match (`apps/api/src/auth/auth.service.ts:632`)
*before* the device-id and device-cap checks (`:577-584`). The grace fallback can't rescue the retry,
because it returns null when no profile exists yet (`:895-899`), and a refused sign-up never creates one.
Low impact in practice: the app always sends a device id, and a device that has hit the cap is refused again anyway.

<details><summary>Evidence F1</summary>

```
3  POST /auth/otp/verify {phone:+263771000001, code:<correct>} (no x-device-id)
   HTTP 400 {"message":"A device id is required to create an account."}
3a POST /auth/otp/verify same code, x-device-id: e2e-dev-rider-1
   HTTP 401 {"message":"Code expired or never requested"}
42.4 new account +263770000010, device e2e-shared-device -> 429 {"reason":"device_signup_cap"}
42.6 same code, x-device-id: e2e-fresh-device        -> 401 "Code expired or never requested"
```
</details>

## Observations (not failures)

- **The verify route throttle is per IP and not set by env.** `@Throttle({limit:10, windowSec:300})` at
  `auth/auth.controller.ts:34` keys unauthenticated calls by client IP (`common/throttle.guard.ts:72`). In this
  run, the 11th verify from one IP within 5 minutes got 429 even on a different phone. Riders signing up
  together behind one carrier NAT, such as at an onboarding event, would share this budget. I could not test
  real carrier NAT. I used `X-Forwarded-For` (trustProxy=1) to simulate separate clients for steps 41–42.
- **The 429 copy in the app is the raw server string.** `mobile/app/verify.tsx:140-142` shows `e.message`
  ("Too many requests — try again later") for both the route throttle and `device_signup_cap`. The mobile app
  has no special copy for the cap. Per the `auth.service.ts` comment, only the merchant web names it.
- **A stub auto-pass writes no audit row.** `becomeRider` creates the rider already verified
  (`rider.service.ts:352-376`), unlike an admin approval, which writes `rider.kyc_approve` with
  `verified_id_missing`. This affects non-production only: `env.ts:490-495` rejects stub + auto in production.
- **The JWT `role` claim stays `customer` after `/riders/become`** until the token is refreshed (15-minute access TTL).
  The rider routes don't read the claim, so I saw no effect.
- **An already-online rider who is refused for being out of area stays online** (`is_online=t`). This is by design:
  the gate only applies when going online.

<details><summary>Evidence: happy path, admin and DB</summary>

```
7  POST /riders/become {}            -> 201 {"kycStatus":"verified","mode":"auto"}
10 PATCH /riders/online {online:true,lat:-17.8292,lng:31.0522} -> 200 {"online":true}
11 POST /riders/heartbeat            -> 201 {"online":true}
13 GET /wallet/config -> {"ratePct":0,"floor":2,"graceCredit":5,"minTopUp":5,"maxTopUp":50,"freeFirstJobs":5}
23 GET /admin/riders/:id/kyc -> {"status":"verified","idNumber":null,"idOnFile":false,
   "verifiedIdNumber":null,"verifiedIdInUse":false,"kycAttempts":0,"locked":false}

riders: d070f53b… | verified | id_verified t | is_online t | last_heartbeat_at 06:04:10.876 | active
audit_logs: rider.kyc_reset (note e2e) · rider.kyc_decline (blurry_photo) · rider.kyc_approve (verified_id_missing)
```
</details>

<details><summary>Evidence: rate limits</summary>

```
40.1-5 otp/request -> 201 ; 40.6 -> 429 "Too many requests — try again later"
41.1-5 wrong verify -> 401 Invalid code ; 41.6 -> 401 Too many attempts — request a new code
41.7 old correct code -> 401 Code expired or never requested ; 41.8 fresh code -> 201
42.1-3 new accounts on one device -> 201 ; 42.4 -> 429 {"reason":"device_signup_cap"}
(first attempt, no XFF) 11th verify from 127.0.0.1 in 5 min -> 429 "Too many requests — try again later"
```
</details>

## Doc vs code

- **The prompt's "become again (idempotent?)"** is answered by the code: it is not idempotent. It returns 409 `{reason:"already_rider"}`
  (`rider.service.ts:280`), a deliberate shape for a lost-response retry.
- **Plan §1 says "Verify needs a device id"** (`docs/plans/2026-10-04-automated-e2e-routines.md`). The code only requires it to
  *create* an account (`auth.service.ts:568-579`). An existing account can sign in without one.
- **Plan E2 says to "set the rate-limit env vars high"** for the local API. The verify route throttle (10 per 5 minutes per IP) is a
  hard-coded decorator (`auth.controller.ts:34`), not an env var, so env vars alone can't lift it. Later runs need
  per-client `X-Forwarded-For` or pauses between verifies.
- **The prompt says "Read controllers … KYC review endpoints"**: the admin KYC write route lives in `kyc/kyc.controller.ts:235`
  (`POST /admin/riders/:profileId/kyc`), not in `admin/admin.controller.ts`.
- **CLAUDE.md says** "the rev 2 export changed the mocks to SMS". The newer Calm Mint v2 handoff
  (`packages/design/handoff/calm-mint-v2-2026-10/README.md:87`) and the app (`ui/onboarding/copy.ts:17`) both say
  "We'll send a 6-digit code on WhatsApp". The code matches its current handoff, so this is not a defect.

## Process notes

- `git fetch origin main` reported `main` as a **forced update** (`c61a6c5...124395c`). I tested `124395c`.
- My first pass sent a verify without a device id before the correct one, which used up that code (F1). That is how F1 was found.
- I changed no files outside `docs/e2e-runs/2026-10-05/`.

## Not tested by automation

These were not tested: the native app screens (C1–C5 onboarding, rider R1–R3 first run, the ID-check sheet), push, GPS and real
location accuracy, real OTP delivery (WhatsApp, Bird), the real ID check (Didit; the stub was used), the camera and the KYC photo upload,
the live server's behaviour, and carrier NAT.

---

# Follow-up run: the "Not tested by automation" gaps (2026-10-05, 07:20–08:30 UTC)

**Verdict: 2 launch blockers, 14 fix-soon issues, about 15 polish items.** Rider sign-up still works end to end, but
it would break at an onboarding event with many riders on one mobile network, and push may be switched off in
production (needs the owner's check).

**Scope.** This run followed the owner's request to cover the list above. It tested on `origin/main` @ `2f260df`, which has the
same code paths as the `124395c` used earlier. Like run 1, it was report-only: no code was changed and nothing was fixed. It used
the same local stack (PostGIS + Redis in docker, the API on localhost).

**Method.** Four test lanes ran in parallel, plus a read-only check of the live server. Vendors were never contacted: the API's
real WhatsApp, Bird, Didit and Google Cloud Storage code was pointed at **local fake servers**. Each lane's guard blocked every
call to a host other than localhost, and no calls were blocked. Every expectation comes from the code (file:line in each lane
report).

| Lane | Covers | Checks | Full report |
|---|---|---|---|
| A | Real code delivery: WhatsApp, Bird SMS, Bird Verify, local-sms, delivery webhooks | 34 | [`J1-followup/A-otp-delivery.md`](J1-followup/A-otp-delivery.md) |
| B | Real ID check (Didit V3 path), national-ID adoption (D-75), KYC/bike photo upload, camera (code only) | 51: 46 pass, 4 fail, 1 blocked | [`J1-followup/B-id-check-and-photos.md`](J1-followup/B-id-check-and-photos.md) |
| C | Push, GPS and service-area edges, heartbeat and staleness, carrier NAT and IP spoofing | n/a | [`J1-followup/C-push-gps-nat.md`](J1-followup/C-push-gps-nat.md) |
| D | The real app screens (Expo Router on react-native-web, Playwright, 360×720 and 320×640): C1–C5, R1–R3, ID-check sheet | n/a | [`J1-followup/D-app-screens.md`](J1-followup/D-app-screens.md) + [`shots/`](J1-followup/shots/) |
| E | Live server (`api.lyniago.com`): read-only GETs plus one rejected malformed POST, no codes sent | 14 | below |

## Launch blockers

| # | Finding | What a user would hit | Where |
|---|---|---|---|
| LB1 | **Production push is off unless the owner has armed it.** `PUSH_PROVIDER` defaults to `noop` in Terraform and in the release workflow, waiting for the new Firebase credential. Nothing refuses a production boot with `noop`, and `NoopPush` reports success, so a "notify me" request is cleared without anything being sent. The repo Variable couldn't be read from here. **Owner: confirm `PUSH_PROVIDER=fcm` is set** (`docs/AZURE-OWNER-RUNBOOK.md:84-100`). | No new-job alerts for riders; no order updates for customers | `infra/azure/containerapps.tf:51`, `.github/workflows/release-azure.yml:412` |
| LB2 | **The per-IP limits can't handle carrier NAT.** Behind one public IP, all users share a single budget: OTP requests 20 per hour, verifies 10 per 5 minutes (a hard-coded decorator), token refreshes 30 per 5 minutes. **Of 30 riders at an onboarding event on one Econet NAT, 10 can sign in in the first 5 minutes and at most 20 in the first hour.** At about 90 active users per NAT IP, token refreshes start failing for everyone behind it. D2 below makes this worse: the app shows the 429 as a connection error. | Riders can't sign up or stay signed in, and are told their network is bad | `auth/auth.controller.ts:34`, `config/env.ts:164-167`, `common/throttle.guard.ts:72-78` |

## Fix soon

| # | Area | Finding | Where |
|---|---|---|---|
| A1 | Code delivery | **A failed resend kills the code already delivered.** The new code is stored *before* the send, so if the vendor fails on Resend, the code in the user's WhatsApp/SMS answers "Invalid code". | `auth/auth.service.ts:376-377` |
| A2 | Code delivery | **Failed sends use up the 5-per-hour limit.** The limiters are charged before the send, so after a vendor outage the user can be locked out for an hour. | `auth/auth.service.ts:362-364` |
| A3 | Code delivery | **Production boots green with no WhatsApp, Bird or local-sms credentials**, and every sign-in then returns 503. Only `console` and `sms` are refused at boot. | `config/env.ts:196-274, 472-481` |
| B1 | ID check | **A rider held because their ID matches another account is told to "Finish verifying", and each tap starts a new paid Didit session.** The hold clears the session token, so `/auth/me` reports no pending state, the app falls back to "unfinished", and `retryKyc` mints a new session. | `riders/rider.service.ts:920-930`, `auth/auth.service.ts:175-179`, mobile `gates.ts:312-314`, `rider.service.ts:519-568` |
| B2 | ID check | **In manual KYC mode, a declined rider who retries is told "pending", but the row stays `failed`**, so it never reaches an admin. | `riders/rider.service.ts:478` |
| C1 | Push | **Sign-out leaves the device's push token on the signed-out account.** The app clears the session before sending the token delete, so the delete gets a 401. `/auth/logout` doesn't clear tokens either. On a shared phone, the next person gets the previous rider's pushes. | mobile `auth-context.tsx:146-158`, `use-push-registration.ts:172` |
| C2 | Push | Food-offer push has no expiry and no lock-screen alarm, both of which the rider-v2 handoff asks for. | see lane C |
| C3 | GPS | **Going online without coordinates skips the service-area check.** No `lat`/`lng`, or only one of them, still sets the rider online. The app sends exactly that when GPS times out, so the rider shows "Online" but never gets jobs. | `riders/riders.controller.ts:88` |
| C4 | GPS | **The heartbeat never re-checks the area.** Beats from Bulawayo or (0,0) return online and move the rider's live position there. | `riders/rider.service.ts:696-745` |
| C5 | GPS | **An idle rider's position freezes.** The app re-reads location only when the board is opened, not on resume, so the 20 s heartbeat keeps sending the first position. | see lane C |
| D1 | Screens | **New riders are asked for their name twice.** After C5, tapping "Start ID check" on R1 shows the name step again with empty fields, because saving the name never refreshes the cached account. The Account header also shows the phone number instead of the name. | mobile `app/profile/setup.tsx:96`, `src/query/use-bootstrap.ts:15`, `app/rider/become.tsx:131-136` |
| D2 | Screens | **Every 429 shows as "Couldn't reach LyniaGo. Check your connection".** The API's rate-limit body is a bare JSON string, not `{message}`, so the app's parser misses it. | API `common/throttle.guard.ts:78` + `all-exceptions.filter.ts:26`, mobile `src/api/client.ts:308-317` |
| D3 | Screens | **The code screen mixes SMS and WhatsApp.** It says "Sent by SMS" but offers "Resend on WhatsApp", after the phone screen promised WhatsApp. Lane A found the same for Bird Verify replies without `last_channel`. Owner call on wording (see run 1's "Doc vs code"). | mobile `src/ui/onboarding/copy.ts:17,37`, `app/verify.tsx:257,263`, API `bird-verify.ts:49-51` |
| D4 | Screens | `getActiveOrder` returns `undefined` when there is no active job, so every rider-board poll logs a React Query error. | mobile `src/api/orders.ts:171` |

**Polish / worth knowing** (details in the lane reports):
- **Code delivery:**
  - The Bird webhook counts a retried event twice.
  - Webhook POSTs answer 201 rather than 200; check that Meta accepts this.
  - Vendor error bodies are logged verbatim.
  - The app has no Android SMS Retriever, so the hash line in the SMS does nothing.
  - A garbled 200 on Bird Verify check is shown as a wrong code.
- **ID check:**
  - Three quick Start taps bill three Didit sessions.
  - A plain Didit "Declined" stores no reason, so the rider sees generic copy.
  - Expired-ID changes and review holds write no audit row.
  - A later Didit webhook can overturn an admin's hand-approval (product call).
  - If Didit ever sends the face score on a 0–1 scale, every approval auto-declines.
  - The current app no longer uploads a KYC photo at sign-up.
- **GPS:**
  - No sweeper marks quiet riders offline. They are only left out of matching after 30 s, out of supply counts after 120 s and out of push after 15 min.
  - Epworth and Mt Hampden can't be edge-tested, because their zones sit inside other towns' zones.
  - The `TRUST_PROXY` comment still describes GCP (`env.ts:37-49`).
  - With `TRUST_PROXY=1`, a forged `X-Forwarded-For` dodges the per-IP limit when nothing sits in front of the API. In production this depends on the Azure Container Apps ingress appending the caller's IP, which couldn't be observed live.
- **Screens:**
  - The C1 hero art looks cropped on the right.
  - The rider header says "Set your location" while a GPS fix is in use.
  - C1 has only about 16 px to spare at 320×640.

## What passed

- **Code delivery:**
  - Every channel's request is correct: E.164 numbers, auth headers, the WhatsApp template and copy-code button, the Bird `from` and category and idempotency key, the SMS text with its hash line, and Bird Verify on WhatsApp.
  - The code delivered to the fake verifies end to end.
  - Every vendor error (400/401/429/500, malformed JSON) and a 35 s hang give 503 "Couldn't send the code — try again in a moment." Hangs are cut at 10 s, under the app's 15 s timeout.
  - No token, phone number or code showed up in responses or logs.
  - Both webhooks accept a valid signature and reject bad, missing or stale ones, and the WhatsApp verify-token handshake works.
- **ID check:**
  - Starting the check sends the right request to Didit. A Didit error or timeout gives a clean 503 and leaves no half-made rider.
  - Webhook signatures, stale timestamps and replays are all handled.
  - The V3 `face_matches[]` score bands work as coded: high passes, borderline is held, low is declined.
  - The national ID number is stored when a rider is held for review and adopted when an admin approves (D-75, IR26-07/08/09).
  - Duplicate-ID holds work, and so does the online gate after each outcome.
- **Photos:**
  - Every upload check works: the type allowlist, the size limit, fake image bytes, someone else's key, and storage down.
  - Signed links last 600 s for upload and 900 s for admin view.
- **Push:**
  - Token register and validation work, and so does re-homing a token to a new account.
  - The FCM boot guard refuses a missing project or bad key.
  - 121 push and notification unit tests pass.
- **GPS:**
  - Every testable service-area edge (100 m inside vs outside) gives the right result and copy.
  - Swapped coordinates, (0,0), out-of-range values and strings are rejected.
- **Screens:**
  - C1–C5 match the handoff's structure and copy word for word: phone, short-number error, code, wrong-code copy, name, Home. R1 matches too.
  - Going online in Harare from the board works: `PATCH /riders/online` 200, heartbeats 201.
  - API down and a 5 s slow network both show a clean error, and a cold start with the API down still reaches C1.
  - Nothing is clipped at 320×640.

## Live server (read-only, 2026-10-05 ~07:45 UTC)

| Check | Result |
|---|---|
| `GET /healthz` | 200: db, redis and queues OK, provider `azure`. 0.9–1.2 s from a US cloud container (not representative of Harare). |
| `GET /app/feature-flags`, `/app/service-flags`, `/app/order-flags` | Restaurants, auto-dispatch, merchant wallet, shops, pharmacy and prescriptions are **all on** |
| `GET /app/version-gate` (android and ios) | `minSupportedVersion: "0.0.0"`. **The force-update gate is inert** (`health.controller.ts:40-45`), so a broken build can't be forced off phones until it is raised. |
| Signed-out `/auth/me`, `/wallet/config`, `/admin/riders`; forged bearer | 401 "Missing bearer token" / "Invalid or expired token" |
| Security headers | HSTS 2 years with includeSubDomains and preload; nosniff; X-Frame-Options DENY; `private, no-cache` |
| CORS preflight | `merchant.lyniago.com` is allowed with `authorization, content-type, x-device-id` (`main.ts:119`). An unknown origin gets no allow header. |
| `POST /auth/otp/request {"phone":"123"}` | 400 with the same copy as local (`contracts.ts:840`). Rejected before any send, so it cost nothing. |
| TLS certificate | Not verifiable from here (the container's egress proxy re-signs TLS) |

Not done on the live server, because each would send a real code or bill a real ID check: a real sign-up, going online, and the
live NAT or ingress IP behaviour.

## Still needs a person with a phone (≈30 minutes, Android, in Harare)

1. **Real code delivery:** sign up with a fresh Econet number and then a NetOne number. Note the channel and sender name, how long the code takes to arrive, whether the Resend cooldown is long enough, and whether autofill offers the code. Then tap Resend once and check that the *first* code is now refused (this confirms A1 on device).
2. **Real ID check:** finish one Didit check with a real Zimbabwe national ID and face. Note the face score's scale (0–100 or 0–1) and whether the ID number is pre-filled. Deny camera permission once and note what the app does.
3. **Push:** confirm the `PUSH_PROVIDER` repo Variable is `fcm` (LB1). Then, with the rider online, place a parcel nearby from a second phone and check the alert arrives with the app in the background and with the screen locked.
4. **GPS:** go online indoors and outdoors in Harare and note how long the fix takes. Then turn location off and tap Go online. If it says Online, that confirms C3.
5. **Carrier NAT (LB2):** put three or more phones on the same mobile hotspot and have them all sign up within 5 minutes. Note when the "Check your connection" message appears.
6. **Things the web run couldn't reach:** the ID-check sheet webview; R3 "You're verified" appearing once; the out-of-area and permission-denied gates on the board; and a cold start that restores the signed-in session.

## Process notes (follow-up)

- No repo code was changed. Lane D ran the app from a **scratch copy** of `apps/mobile` with `react-native-web` and a web stub for
  `react-native-maps`, because the repo has no web target dependency. `git status --porcelain` was clean afterwards.
- Lane D screenshots `B01–B05` and `C09` were signed-out runs (on web the session is in memory only), so they test nothing and were
  left out of `shots/`.
- Parallel lanes shared one source IP, so some lanes hit the 10-per-5-minute verify limit during the run. That is LB2 being
  reproduced, not a test fault.
