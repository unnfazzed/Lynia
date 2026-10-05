# Lane C: push, GPS/location, carrier-NAT limits (report only)

Checkout: origin/main at /home/user/Lynia. Run on 2026-10-05, about 40 minutes.
Instances: base `:3000` (noop push, OTP_RL_IP_MAX=1000) for location tests. Own instances `:3031` (default limits, TRUST_PROXY default `1`, BROADCAST_HEARTBEAT_MAX_AGE_MS=8000, Redis db 6) and `:3032` (default limits, TRUST_PROXY=false, Redis db 7). Short-lived `:3033` runs were used only to exercise the push boot guard. All of these are killed now. Nothing contacted FCM, Google, Expo or production.

FCM endpoint override: **not possible.** `FcmPush` uses `firebase-admin` with hard-coded Google hosts (`apps/api/src/adapters/push/fcm.push.ts:100-125`). There is no URL env. The real send is therefore **BLOCKED**. Everything up to the HTTP call was covered by code reading plus `vitest run src/adapters/push src/notifications/notifications.service.spec.ts`, which gave **5 files, 121 tests passed** (the repo uses vitest, not jest).

## Results

| # | Step | Expected (code, file:line) | Actual | Result |
|---|---|---|---|---|
| A1 | `POST /notifications/device-token` with valid token + `android` | Upsert keyed on token, bound to JWT subject (`notifications.controller.ts:82-89`, `notifications.service.ts:180-190`) | 201 `{ok:true}`, row created | PASS |
| A2 | Empty token / 4097 chars / `platform:"windows"` | zod: token 1..4096, platform enum (`packages/shared/src/contracts.ts:305-308`) | 400 each, with field errors | PASS |
| A3 | Whitespace-only token `"   "` | Should be rejected (no trim) | 201, row stored | FAIL (polish) |
| A4 | Register with no bearer | JwtAuthGuard (`notifications.controller.ts:16`) | 401 | PASS |
| A5 | Re-register the same token without platform | Platform kept (`notifications.service.ts:187`) | 201, platform kept | PASS |
| A6 | Second account B registers A's token | Re-home to B (`notifications.service.ts:170-190`) | Row moved to B; B's `platform:"ios"` overwrote `android` | PASS (see obs. O4) |
| A7 | A deletes a token now owned by B | No-op, scoped by profileId (`notifications.service.ts:193-195`) | 200, B's row intact | PASS |
| A8 | **Sign-out cleanup.** App flow: `logout` → `apply(null)` → effect cleanup → `DELETE /device-token` | Token removed on sign-out (`use-push-registration.ts:172`, comment at :34-41) | The DELETE goes out **with no bearer** because the session is already null (`auth-context.tsx:146-158`, `client.ts:168`). Result: **401**. The row stays bound to the signed-out user. `/auth/logout` never touches device_tokens (`auth.service.ts:835-860`). The old access token stayed valid for DELETE (200) right after logout, so ordering alone is the bug | **FAIL** |
| A9 | Dead token pruning | `messaging/registration-token-not-registered`, `invalid-registration-token` and `mismatched-credential` → prune; transient errors → keep (`fcm.push.ts:8-14`, `notifications.service.ts:596-599`) | Unit tests pass (fcm.push.spec, notifications.service.spec) | PASS (unit) |
| A10 | Real FCM send | — | No override possible | BLOCKED |
| A11 | `PUSH_PROVIDER=fcm`, `CLOUD_PROVIDER=azure`, no `FCM_PROJECT_ID` | Boot refuses (`push.module.ts:15-20`) | exit 1, "Missing FCM_PROJECT_ID…" | PASS |
| A12 | Same, with an invalid SA JSON | Boot refuses (`fcm.push.ts:24-39`) | exit 1, "Invalid FCM_SERVICE_ACCOUNT_JSON…" | PASS |
| A13 | `PUSH_PROVIDER=fcm`, CLOUD_PROVIDER default (`gcp`), no creds | Warn only (`push.module.ts:93-98`) | Booted, logged a WARN | PASS (by design) |
| A14 | Production with `PUSH_PROVIDER=noop` | Something should stop prod running with push off | No guard in `env.ts` (prod guards at :439-500 don't mention push). Terraform hard-sets `noop` (`infra/azure/containerapps.tf:51`). The release defaults to `noop` (`release-azure.yml:412`). I could not read the repo Variable (gh API 403 via proxy) | **FAIL** (see F1) |
| A15 | Rider push events and payloads | Read from code | See O1 | PASS (code) |
| A16 | Push copy vs `src/ui/notifications/copy.ts` | Handoff `N` strings | KYC/standing push titles match (`aVerifiedT`, `aIdT`, `aPausedT`, `aBlockedT`, `aRestoredT`). Bodies differ, e.g. push "You're verified — go online to start taking deliveries." vs feed "You can take parcel and food jobs." (`rider.service.ts:1092-1095` vs `copy.ts:41-45`). The handoff doesn't own push bodies, so not a parity defect | PASS / note |
| A17 | Food offer alarm: "looping alarm … full-screen intent over the lock screen" (`handoff/rider-v2/README.md:316`) | Implemented | No full-screen intent or looping alarm anywhere in mobile. `food_offer` is a plain push with no TTL (`food-dispatch.service.ts:269-275`; `notifyProfiles` has no ttl param, `notifications.service.ts:516-518`) | FAIL (fix soon) |
| B1 | `PATCH /riders/online` at Harare centre | 200 | 200 | PASS |
| B2 | 100 m inside / 100 m outside the outer edge of Harare, Chitungwiza, Norton, Ruwa, Domboshava, Goromonzi (computed with the same haversine, R=6371) | inside → 200; outside → 403 `out_of_area` (`rider.service.ts:604-608`, `service-area.ts:40-43`) | All 6 inside → 200, all 6 outside → 403 with "You're outside the service area — go online from Harare, Chitungwiza, Norton, Ruwa, Epworth, Domboshava, Mt Hampden and Goromonzi" | PASS |
| B3 | Epworth and Mt Hampden edges | — | Both discs lie entirely inside other discs, so they have no exposed edge to test (zones are redundant) | NOT RUN (n/a) |
| B4 | Bulawayo / swapped lat-lng / (0,0) | 403 out_of_area | 403 ×3 | PASS |
| B5 | lat 91, lng 181, string numbers, null, `NaN`, `1e400` | 400 (`riders.controller.ts:30-34`) | 400 each | PASS |
| B6 | **No coordinates** `{online:true}` | Spec says area check is skipped for old clients (`riders.controller.ts:28-29`) | 200 online, no area check | **FAIL** (F3) |
| B7 | **lat only** (Bulawayo lat, no lng) | Should be 400 or checked | 200 online. Controller drops a half pair to `undefined` (`riders.controller.ts:88`) | **FAIL** (F3) |
| B8 | `accuracy: 50000` | Not in schema; zod strips it | 200. Accuracy is neither accepted nor used anywhere | PASS / obs. O6 |
| B9 | Heartbeat while offline | 403 "You're offline…" (`rider.service.ts:728`) | 403 | PASS |
| B10 | **Heartbeat from Bulawayo / (0,0) / swapped while online** | Rider leaving the area should be taken offline or flagged | 201 `{online:true}` every time. No `isInServiceArea` in `heartbeat()` (`rider.service.ts:696-745`). Redis `rider:geo` moved to Bulawayo. PG `geog` stayed at Harare (throttled flush). `/riders/nearby` at Bulawayo returned this rider | **FAIL** (F4) |
| B11 | Staleness: what takes a rider offline | — | **Nothing does.** There is no sweeper and no cron. `is_online` stays `true` until an explicit offline or a demotion (grep `isOnline: false`). Staleness is handled at read time: 120 s for supply/nearby (`policy.ts:340`), 30 s for offer selection (matching.service.ts:114), 15 min for the push audience (`policy.ts:352`). Observed with BROADCAST_HEARTBEAT_MAX_AGE_MS=8000: nearby lists the rider within 8 s of a beat and drops them 11 s after it. PG still `is_online=t` | PASS (as designed) / obs. O5 |
| B12 | Heartbeat with `{}` | Liveness only | 201 | PASS |
| C1 | 30 distinct phones, one source IP, no XFF, default limits (`:3031`) | 20 OTP sends per IP per hour (`env.ts:165`, `auth.service.ts:68`) | 17×201, then 429 (3 earlier sends on the same IP counted). **20/hour/IP confirmed.** Copy: "Too many requests — try again later", no `Retry-After` header | PASS (behaviour) / **FAIL** for CGNAT (F2) |
| C2 | Verify those codes from the same IP | 10 per 5 min per IP (`auth.controller.ts:34`) | 7×201, then 10×429 (3 earlier verifies counted). **10 per 5 min per IP confirmed** | PASS / FAIL for CGNAT (F2) |
| C3 | `POST /auth/refresh` from one IP | 30 per 5 min, keyed on IP because it is unauthenticated (`auth.controller.ts:47-48`, `throttle.guard.ts:72`) | 30×401, then 429 | PASS / **FAIL** for CGNAT (F2) |
| C4 | `TRUST_PROXY=1`, client-sent `X-Forwarded-For` with no real proxy in front | Spoofable: the rightmost XFF is trusted | After the IP bucket was exhausted, `XFF: 10.9.9.x` got 201 three times. Bypass confirmed **when the app is reached directly** | PASS (expected) |
| C5 | `TRUST_PROXY=false` + XFF | XFF ignored | 20×201, then 429 | PASS |
| C6 | Production topology | `TRUST_PROXY="1"` (`infra/azure/containerapps.tf:40`). Cloudflare DNS-only (`infra/azure/outputs.tf:65`, `docs/CLOUDFLARE.md:47`). ACA Envoy ingress appends the peer IP to XFF, so rightmost = real client and a client-injected XFF lands to the left and is ignored. The `env.ts:37-49` comment still describes the GCP ALB (stale). No Azure-side edge rate limit (no Front Door/WAF in `infra/azure`). The GCP Cloud Armor CGNAT fix (KNOWN_BUGS LC-INF1) has no Azure equivalent | Read-only. ACA append behaviour taken from Microsoft docs, not observed | PASS (code) / NOT RUN (live) |

## Failures

**F1 · Launch blocker (needs a decision): production push is off unless someone flips a Variable, and nothing says so at boot.**
- **User impact:** riders get no "New delivery nearby", "You got the job" or KYC pushes. A pocketed rider (heartbeat stopped after about 120 s) is reachable only by push, so they silently miss jobs.
- **Second impact:** `NoopPush` returns `ok:true` (`noop.push.ts:12-15`). The F-18 "notify me" drain therefore counts customers as notified and clears them (`rider.service.ts:767-770`) when no push was sent.
- **Code:** `infra/azure/containerapps.tf:51`, `.github/workflows/release-azure.yml:412`. No prod guard in `apps/api/src/config/env.ts:439-500`.
- **Verification gap:** the real value of `vars.PUSH_PROVIDER` could not be read from here (gh 403).

**F2 · Launch blocker for onboarding events (and at scale, for all users): the app-layer per-IP limits ignore carrier CGNAT.**
- **Onboarding event, 30 riders on one Econet NAT IP with defaults** (production sets no `OTP_RL_*`):
  - first 5 minutes: **10** can finish sign-in (verify 10/5 min/IP, and wrong-code attempts burn the same budget);
  - first hour: **20 at most** can even receive a code (OTP 20/h/IP, and every "resend" counts);
  - the other **10 see "Too many requests — try again later" for up to 60 minutes**, with no Retry-After and no countdown.
- **Steady state:** `/auth/refresh` is 30 per 5 min per IP and the access TTL is 15 minutes (`expiresIn: 900`). That supports roughly **90 concurrently active app users per CGNAT egress IP** before refreshes 429. The mobile client maps a refresh 429 to "The network is unstable…" (`apps/mobile/src/api/client.ts:263-266`), so every rider behind that IP fails requests together.
- **Prior art:** the team already recorded Zim CGNAT as CRITICAL for Cloud Armor (`docs/KNOWN_BUGS.md:645`) but not for these limiters.
- **Code:** `apps/api/src/config/env.ts:165`, `apps/api/src/auth/auth.controller.ts:34,48`, `apps/api/src/common/throttle.guard.ts:72`.
- **Suggested fix:** key verify on phone+IP and refresh on the session id (from the token prefix), and raise or override `OTP_RL_IP_MAX`.

**F3 · Fix soon: the out-of-area gate is bypassed whenever the client omits coordinates or sends only one of them.**
- **Server:** `riders.controller.ts:88` turns a half pair into `undefined`; `rider.service.ts:604-608` only checks when a location is present.
- **App:** it goes online with `loc == null` whenever the GPS fix times out and there is no last-known fix (`app/rider/(tabs)/index.tsx:278-280`, `setOnline(next, loc ?? undefined)` at :252).
- **User impact:** a rider with no fix (or in Bulawayo with a weak fix) shows "Online", is never indexed (no `recordFix`), and silently gets no jobs.
- **Fix:** require both coordinates or neither (zod `.refine`), and decide whether a location-less go-online should be allowed.

**F4 · Fix soon: the heartbeat never re-checks the service area, so a rider can stay online anywhere.**
- `rider.service.ts:696-745` has no `isInServiceArea`.
- **Observed:** heartbeats from Bulawayo, (0,0) and swapped coordinates all returned `{online:true}`. The rider moved in Redis geo to Bulawayo while PG `geog` stayed at Harare (`tracking.service.ts:342-348`, throttled), so the Redis and PG nearby paths disagree.
- **User impact:** an out-of-area rider stays "Online". If Redis is down, the PG fallback can count them as Harare supply.
- **Copy mismatch:** the app copy promises "Jobs show again as soon as you're back inside" (`src/ui/rider/copy.ts:105`), but the reverse transition is never enforced.

**F5 · Fix soon: an idle rider's reported position freezes at the moment the board was last focused.**
- `requestLocation` runs only on focus and when a job ends (`app/rider/(tabs)/index.tsx:129-133, 185`).
- The 20-second heartbeat sends that same `locRef` (`:327`). The board socket re-scopes only when `loc` changes (`src/realtime/use-rider-board.ts:207-213`).
- There is no `watchPositionAsync` outside an active job (`src/realtime/use-rider-location.ts:104` is job-only), and resuming the app doesn't re-locate (`useFocusEffect` ≠ AppState).
- **User impact:** a rider who waits on the board while riding across town keeps getting jobs and "nearby" pushes for where they started.

**F6 · Fix soon: sign-out leaves the device bound to the signed-out account's push token** (A8).
- `apps/mobile/src/auth/auth-context.tsx:146-158` clears the session before `use-push-registration.ts:172` runs its DELETE, so the DELETE is unauthenticated → 401. `auth.service.ts:835` logout doesn't clear tokens either.
- **User impact:** on a shared phone, the next person holding it keeps getting the previous rider's pushes (pickup area, fare, account and KYC notices) until another account signs in on that device. That is a privacy leak once FCM is on.
- **Fix:** unregister before `apply(null)` (the access token is still valid; verified 200 after logout), or accept the token in `/auth/logout`.

**F7 · Fix soon: food-offer push has no TTL and no full-screen alarm.**
- **Code:** `food-dispatch.service.ts:269-275`, `notifications.service.ts:516-518`; handoff rule at `rider-v2/README.md:316`.
- **User impact:** a timed offer can arrive minutes or hours late, and a backgrounded rider gets only an ordinary banner instead of the designed lock-screen alarm.

**F8 · Polish:**
- A whitespace-only device token is accepted (`contracts.ts:306`). FCM would prune it on the first send.
- KYC `expired` mid-shift takes the rider offline with no push (`rider.service.ts:1040-1043`, deliberately silent).
- The `:3000` 400 for invalid JSON echoes a fragment of the request body.

## Observations
- **O1 · Rider push events (all `data` values are strings):**

  | Event | Title / body | Data |
  |---|---|---|
  | Broadcast | "New delivery nearby" / "Pickup at {pickup} · asking ${fare} — tap to bid before it's taken." | `{orderId, kind:"broadcast"}`, TTL = remaining auction window (`notifications.service.ts:355-375`) |
  | Status `assigned` | "You got the job" | `orderId, status` (`:29`) |
  | Status `completed`, `cancelled` | — | (`:35,41`) |
  | `food_offer` | — | (`food-dispatch.service.ts:274`) |
  | KYC verified / failed | — | `kind:"account"` (`rider.service.ts:1091-1096`) |
  | Pause / blocked / restored ×2 | — | `kind:"account"` (`admin-riders.service.ts:248,315,358,413`) |
  | Wallet | — | `wallet.service.ts:561` |
  | SOS | — | `sos.service.ts:88` |

  The app routes these as follows (`apps/mobile/src/push/push.ts` `pushRoute`):
  - `broadcast` → `/rider`
  - `food_offer` → `/rider/food-offer`
  - `account` → `/rider`
  - `assigned` → `/rider/job`
  - `completed` → `/rider`

  A foreground `account` push invalidates `["me"]` (`use-push-registration.ts:203-208`).
- **O2:** stub KYC (`KYC_PROVIDER=stub`) creates the rider already verified and sends no "You're verified" push (`rider.service.ts:352-353`). The push only fires on the Didit webhook and admin paths, so the earlier noop/stub run could never have exercised it.
- **O3 · Mobile token:** the app uses the native FCM `getDevicePushTokenAsync` (not Expo push). The Android channel is "default" / HIGH. Registration happens only if permission is already granted (check, don't request), with up to 4 retries on reachability or foreground, plus rotation handling (`push.ts`, `use-push-registration.ts`). Permission is primed in `app/permissions.tsx`. The rider board shows the J8 notifications-off state from `getPermissionsAsync`.
- **O4:** `platform` is client-controlled on re-home. One account can flip a row to `ios`, which routes a real FCM token to APNs and fails until it is pruned. Minor.
- **O5 · No staleness sweeper.** A killed app leaves `is_online=true` forever. The rider is excluded from supply after 120 s and from the push audience after 15 min, and silently "resumes" on the next successful heartbeat without the go-online gate (commission floor) being re-run. That is by design (`rider.service.ts:680-694`) but worth knowing.
- **O6 · Mobile location settings:**
  - Board fix: `Accuracy.Balanced`, 9 s timeout, then last-known with no `maxAge` (`app/rider/(tabs)/index.tsx:112-117`). A day-old fix can be sent as the go-online position.
  - Active job: foreground `watchPositionAsync` plus a background `startLocationUpdatesAsync` foreground service (Balanced, 25 m / 10 s; notification "LyniaGo — delivery in progress"), Android only. No `ACCESS_BACKGROUND_LOCATION`. On iOS it degrades to foreground-only (`src/realtime/background-location-task.ts:83-110`).
  - No accuracy value is ever sent to or accepted by the API.
- **O7 · What the rider sees when location permission is denied:** the "gps" gate with "Can't find your location" / "Jobs are matched by distance, so location must be on while you ride.", plus "Open location settings" and a retry ghost (`app/rider/(tabs)/index.tsx:542-551`, `src/ui/rider/copy.ts:99-101`). The auto go-online is suppressed (`:272`). Denial is re-read only on focus, so revoking permission mid-shift keeps the rider online on the last position.
- **O8:** an `out_of_area` 403 body carries `{reason, message}` without `statusCode`. The app maps it via `src/logic/gates.ts:64-66`. Fine.
- **O9:** one-off oddity. The first `/riders/nearby` call on fresh `:3031`, right after go-online at Harare, returned `[]`. An identical rerun returned the rider. I could not reproduce it, so low confidence.
- **Test residue left in the local DB:** profiles `+26377500003{1,2,3,9}`, `+2637751001xx`, `+2637753xxxxx` and device tokens `laneC-*`. Redis dbs 6 and 7 were used by my instances.

<details><summary>Evidence (abridged)</summary>

```
# service-area edges (inside = -100 m, outside = +100 m, on the bearing where outside leaves the union)
Harare in(-17.605269,31.0522)=200 out(-17.60347,31.0522)=403 out_of_area
Chitungwiza in(-18.035722,31.166043)=200 out(-18.036187,31.167871)=403
Norton in(-17.794267,30.7)=200 out(-17.792469,30.7)=403
Ruwa in(-17.81259,31.291458)=200 out(-17.811032,31.292402)=403
Domboshava in(-17.530967,31.17)=200 out(-17.529169,31.17)=403
Goromonzi in(-17.780967,31.37)=200 out(-17.779169,31.37)=403
Bulawayo 403 · swapped 403 · (0,0) 403 · lat91 400 · lng181 400 · "string" 400 · null 400 · NaN 400 · 1e400 400
{"online":true} (no coords) 200 · {"online":true,"lat":-20.1325} 200 · accuracy:50000 200

# heartbeat while online
hb Bulawayo {"online":true} [201] · hb (0,0) [201] · hb swapped [201] · hb lat 91 [400] · hb {} [201]
PG: is_online=t, geog POINT(31.0522 -17.8292) ; Redis GEOPOS rider:geo → 28.6265,-20.1325

# staleness (BROADCAST_HEARTBEAT_MAX_AGE_MS=8000)
12:36:01 beat → nearby(Bulawayo) = [self, 0.09 m]
12:36:12 nearby(Bulawayo) = []   (PG is_online still t)

# device-token sign-out
POST device-token 201 → POST /auth/logout {"revoked":true} → DELETE device-token (no bearer) 401
device_tokens: laneC-tok-signout | df0d6348-… (still bound)
DELETE with the pre-logout access token → 200

# NAT (:3031, defaults, same source IP)
otp/request ×30: 17×201, 13×429 "Too many requests — try again later" (3 prior hits ⇒ 20/h)
otp/verify: 7×201, 10×429 (3 prior ⇒ 10/5min)
auth/refresh ×32: 30×401, 2×429
XFF spoof (TRUST_PROXY=1, no proxy): 3×201 after bucket exhausted
:3032 TRUST_PROXY=false, varying XFF: 20×201, 2×429

# push boot guard
CLOUD_PROVIDER=azure PUSH_PROVIDER=fcm → exit 1 "Missing FCM_PROJECT_ID: every FCM push send fails…"
+ FCM_SERVICE_ACCOUNT_JSON='{"client_email":"a@b"}' → exit 1 "Invalid FCM_SERVICE_ACCOUNT_JSON: missing client_email or private_key…"
CLOUD_PROVIDER=gcp (default) PUSH_PROVIDER=fcm → boots, WARN "relying on ADC's ambient project"
vitest src/adapters/push + notifications.service.spec: 5 files, 121 passed
```
</details>

## Still needs a real phone / real network
- **A push arriving on a device:** needs a Firebase project, `PUSH_PROVIDER=fcm` on staging and a real Android build. Check:
  - the banner, the HIGH channel, and the tap routing for broadcast, food_offer, account and assigned;
  - TTL drop for a stale broadcast;
  - cold-start tap;
  - token rotation;
  - pruning on uninstall.
- **The F6 sign-out leak on a device:** sign out, then trigger a rider push to the old account.
- **Real GPS in Harare:** `Accuracy.Balanced` error radius and time-to-first-fix on Go-class handsets (how often the 9 s timeout falls back to a stale last-known fix or `loc=null`, which is F3). Also confirm the foreground service keeps fixes while Google Maps is in front.
- **Real Econet/NetOne NAT:** how many subscribers share one egress IP, and whether 20 OTP/h, 10 verify/5 min and 30 refresh/5 min per IP trip in practice. Also confirm that ACA Envoy appends, rather than replaces, `X-Forwarded-For` behind Cloudflare DNS-only (log `req.ip` on staging from a phone that sends a spoofed XFF).
