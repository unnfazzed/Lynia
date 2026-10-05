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
