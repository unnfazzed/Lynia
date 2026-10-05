# Lane D: mobile onboarding screens (C1–C5, R1–R3, ID-check sheet) in react-native-web, run 2026-10-05

**How it ran.** The real Expo Router app ran on web (`expo start --web`, Metro) against `http://localhost:3000`, driven by Playwright with Chromium (`/opt/pw-browsers/chromium-1194`) at 360×720 (DPR 2) and 320×640. Every request to a host other than localhost was aborted.

The repo has no `react-native-web`, and putting it into the repo's `node_modules` was not permitted. The app was therefore run from a **scratch copy of `apps/mobile`** (source only), with three changes to the copy:
- `node_modules` symlinked to the repo's pnpm store, plus `react-native-web@0.21.2` from the scratchpad.
- `platforms` gained `"web"`.
- Metro got `watchFolders` and `unstable_serverRoot: "/"`, and a web-only `react-native-maps` stub (it imports native-only codegen, so the map shows as a grey box).

The repo was untouched: `git status --porcelain` printed nothing at the end.

Screenshots are in `shots/`. Phones used: +263 77 600 00{17,27,37,47,57}.

**Caveats on the screenshots:**
- `B01–B05` come from a run that tried to restore a saved browser session. It failed because on web the session lives in memory (`expo-secure-store`), so those shots show a signed-out Account. They do not test any step and are kept only as evidence of that.
- `C09` is also a signed-out reload.
- The useful rider shots are `C02–C08` and `C10`.

## Results

| # | Step | Expected (code / handoff, file:line) | Actual | Result | Shots |
|---|---|---|---|---|---|
| 1 | Cold start → C1 Welcome | Hero card, mark + wordmark, H1 "Parcels and food / across town.", 3 facts, "Continue with your number", "Want to earn? Ride with LyniaGo →" (`calm-mint-v2-2026-10/README.md:80-85`; `src/ui/onboarding/copy.ts:8-13`) | Lands on `/onboarding`. Structure and copy match word for word. Hero art looks cropped on its right edge (see Polish) | PASS | A01, 00 |
| 2 | C2 Phone | Back, "What's your number?", "We'll send a 6-digit code on WhatsApp.", +263 prefix segment, "77 245 1180" format, help "Starts with 71, 73, 77 or 78.", "Send code", Terms/Privacy (`README.md:86-89`; `app/phone.tsx:54-122`) | All present, verbatim. Number formats as "77 600 0007" | PASS | A02, A04 |
| 3 | C3 invalid (short number) | Danger border + "That number looks short. Zimbabwe mobiles have 9 digits after +263." (`README.md:90`; `copy.ts:21`) | Shown exactly, with a red border | PASS | A03 |
| 4 | C4 Code | "Enter the code", "Sent on WhatsApp to … Change", 6 boxes, "Resend in 0:42", grey "Resend on WhatsApp", no Verify button (`README.md:91-95`) | Structure matches. Local API reports channel `sms`, so the screen reads "Sent **by SMS** to +263 77 600 0027. Change", **but "Resend on WhatsApp" is still drawn** (see Fix soon F3) | PASS (structure) / copy issue | A05 |
| 5 | C4 wrong code once | Danger text "That code isn't right. Check the message and try again." (`README.md:95`; `app/verify.tsx:138-139`) | Shown, all 6 boxes turn red. (First attempt instead hit the IP throttle and showed "Couldn't reach LyniaGo. Check your connection…", see F2) | PASS | A06 (pass); first-run A06 overwritten, described in F2 |
| 6 | C4 right code → C5 | Auto-verify on the 6th digit → `/profile/setup` (`app/verify.tsx:124-127`) | `POST /auth/otp/verify` 401 then 201 → `/profile/setup?phone=…&deliveryChannel=sms` | PASS | A07 |
| 7 | C5 Name | "What should riders call you?", First name · Surname side by side, verified phone row, "No ID needed…" note, "Start using LyniaGo" (`README.md:96-100`; `copy.ts:46-52`) | All present, verbatim | PASS | A08, C01 |
| 8 | C5 → Home | `PATCH /auth/me` → Home | `PATCH /auth/me` 200 → `/home` with "Where should we deliver?" card and the floating tab bar. `/shops*` returned 503 locally (shops/pharmacy rails are off on this API) | PASS | A09 |
| 9 | Account tab → "become a rider" | BecomeCard "Earn with your bike" → `/rider/become` (`app/(tabs)/account.tsx:63-68`) | Card shown with a "Start" button → `/rider/become`. **The Account header shows the phone, not "Rudo Chikore"**: the cached `me` is stale (F1) | PASS (with F1) | C02 |
| 10 | R1 Why ride | Hero, "Ride with LyniaGo." / "Earn on your terms." (violet), 3 chips, checklist (account Done · ID check ~2 min), note, "Start ID check" (`README.md:105-110`; `copy.ts:61-75`; D-55/D-62 changes applied) | Matches, including the D-55 "ID check" (no vendor name) and the D-62 note | PASS | C03 |
| 10a | R1 "Start ID check" opens the check (D-75) | With a name on the account: `becomeRider()`, then the ID-check sheet (`app/rider/become.tsx:126-138, 88-114`) | **The name step opens instead, with empty fields**, even though C5 had just saved the name (F1). Re-typing the name gives `PATCH /auth/me` → `POST /riders/become` 201 → `/rider` | **FAIL** | C04 |
| 11 | ID-check sheet | `KycCheckHost` sheet presents the hosted check (`src/kyc/KycCheckHost.tsx`, `src/kyc/verify.ts:6-18`) | Not reached. `KYC_PROVIDER=stub` + auto mode returns no `sessionToken`/`verificationUrl` (`apps/api/src/riders/rider.service.ts:352-383`), so become.tsx skips the sheet by design (`become.tsx:110-112`). Even with a session, `react-native-webview` has no web build | BLOCKED (stub + web) | none |
| 12 | Stub outcome → R2/R3 | Stub auto-pass → verified → R3 "You're verified, Rudo", "Go online" once (`app/rider/(tabs)/index.tsx:210-226`; `README.md:116-119`) | **R3 never showed.** The board opened straight to "Good afternoon, Rudo · Online" with "Nothing in range yet". The R3 once-flag `riderWelcomeSeen` reads device storage, which most likely isn't real on web, so this is not proven to be an app bug | BLOCKED on web (needs device) | C05 |
| 13 | Go online (Harare) | Board online, `PATCH /riders/online`, heartbeat, open jobs near the location | `PATCH /riders/online` 200, `GET /orders/open?lat=-17.8292&lng=31.0522` 200, heartbeats 201. There is no "Go online" button because the board is always online (`index.tsx:67-81`). Header still says **"Set your location"** although the GPS fix is in use (Polish P2) | PASS | C05, C06 |
| 14 | Out of area (Bulawayo -20.15, 28.58) | Gate "You're outside the service area" (`src/ui/rider/copy.ts:103-105`) | No gate after 25 s. Board unchanged and still "Online"; heartbeats kept returning 201. The run did not prove the browser's location watch picked up the new coordinates | NOT CONCLUSIVE | C08 |
| 15 | Location permission denied | Location gate / fallback | After `clearPermissions` the board stayed "Online" with no prompt for 20 s. A mid-session revoke may not reach a web `watchPosition`. Untested at cold start (a web reload loses the session) | NOT CONCLUSIVE | C10 |
| 16 | API down (requests to :3000 aborted) on C2 "Send code" | Error line, no crash (`app/phone.tsx:45-47`) | "Can't reach LyniaGo — check your connection and try again." in red under the field, plus an offline banner "You're offline — some things may be out of date." | PASS | D03 |
| 17 | API down at cold start | App boots to C1 | Boots to `/onboarding` (C1) normally | PASS | D06 |
| 18 | Slow network (5 s, then timeout) on C2 | Busy state, then an error | Busy spinner on "Send code", then the same "Can't reach…" line | PASS | D04, D05 |
| 19 | 320×640: C1, C2, rider board | No clipping, no horizontal scroll | C1 fits exactly (scrollWidth 320, scrollHeight 640); the "Ride with LyniaGo →" link sits about 16 px from the bottom edge. C2 and the board are fine. Search placeholder shortens to "Search food or shops" | PASS (tight) | D01, D02, C07 |

## Failures

### Launch blocker
None confirmed on web. The ID-check sheet and R3 are unverified (BLOCKED) and need a phone; see the last section.

### Fix soon

**F1. A new user is asked for their name a second time when they become a rider, and the form is blank.**
- **User impact:** someone who signs up and then taps "Earn with your bike" in the same session types their name twice. Account and other screens also show their phone number instead of their name until `me` refetches.
- **Cause:** `app/profile/setup.tsx:96` saves with `updateProfile()` (`PATCH /auth/me`) but never updates or invalidates the `["me"]` query. Bootstrap seeded that query with a nameless `me` (`src/query/use-bootstrap.ts:15`), so `start()` in `app/rider/become.tsx:126-138` sees no name and goes to `setStep("name")`. No `GET /auth/me` happened between C5 and R1 in the network log.
- **Scope:** the React Query cache behaves the same on native, so this is very likely to reproduce on a phone too.

**F2. Rate-limit responses are shown as a connection problem.**
- **User impact:** after too many OTP attempts, or several users behind one carrier NAT IP, the user sees "Couldn't reach LyniaGo. Check your connection and try again." when the real problem is "too many tries, wait". They will retry and stay locked.
- **Cause:** the throttle throws `HttpException("Too many requests — try again later", 429)` (`apps/api/src/common/throttle.guard.ts:76-79`, and the same shape in `AuthService.enforceRate`). `apps/api/src/common/all-exceptions.filter.ts:26` sends `getResponse()` as-is, so the body is a bare JSON string with no `message` field. `friendlyMessage` (`apps/mobile/src/api/client.ts:307-317`) then falls back to the connection copy.
- **Related:** `/auth/otp/verify` is throttled at 10 per 5 minutes **per IP** when the caller is not signed in (`apps/api/src/auth/auth.controller.ts:34`). Shared-IP lanes hit it during this run.

**F3. The code screen mixes SMS and WhatsApp.**
- **User impact:** when the code went by SMS, C4 says "Sent by SMS to …" but the resend control says "Resend on WhatsApp", and C2 promised WhatsApp. The user can't tell where to look.
- **Cause:** `src/ui/onboarding/copy.ts:17` (`phoneSub`) and `:37` (`resendOnWhatsApp`) are fixed strings, while `sentTo`/`channelName` (`:33-34`) follow the channel.
- **Design question:** the Calm Mint handoff draws WhatsApp, while CLAUDE.md says rev 2 moved OTP mocks to SMS. This is the owner's call; flagged, not judged.

**F4. The `["activeJob"]` query errors when there is no active job.**
- **User impact:** none visible yet. The query sits in an error state, so anything that relies on its success or idle state (job restore, notifications) can misbehave, and every rider-board poll logs an error.
- **Cause:** `getActiveOrder()` (`src/api/orders.ts:171-172`) resolves `undefined` when `/orders/mine/active` returns an empty 200 body. React Query logs "Query data cannot be undefined … ['activeJob']" on each poll. It is used by `app/rider/job.tsx:198`, `app/rider/food-job.tsx:116` and `app/notifications/index.tsx:284`; the error appeared on the board after go-online.

### Polish

- **P1. C1 hero art cut off on the right.** The illustration's right edge is cut off square while its left corners are rounded, and it sits off-centre (left gap ≈ 58 px vs right ≈ 46 px in the 360 shot; also at 320). This may be a react-native-svg-on-web artifact; check it on a device. `app/onboarding.tsx` hero / `hero-rider` art.
- **P2. Rider board header says "Set your location" while the board is already using the GPS fix** (`/orders/open?lat=-17.8292…`). It reads like an instruction the rider doesn't need. `app/rider/(tabs)/index.tsx` header.
- **P3. Two wordings for the same network failure:** "Can't reach LyniaGo — check your connection and try again." (phone screen, offline path) and "Couldn't reach LyniaGo. Check your connection and try again." (`client.ts:317`).
- **P4. A toast covers C4's back button.** It sits over the top of the screen while visible (first-run A06).
- **P5. No focus ring on C4 after the wrong code.** The handoff draws a 2 px brand border on the active box (`README.md:93`); after the wrong-code attempt no box shows it (A06, A07). Also, the focused C5 surname field shows an amber border; confirm that is the intended focus token.

## Observations: what does and doesn't work on web

- **Renders:** all C1–C5 and R1 screens, Home, Account, the rider board shell, the tab bar and the illustrations.
- **Session:** it does not survive a reload on web, because `expo-secure-store` has no web store. Cold-start resume, R2 "resumable", and the R3 once-flag can't be tested here.
- **Map:** `react-native-maps` is native-only and was stubbed to a grey box, so there is no live map on the board.
- **ID-check sheet:** `react-native-webview` has no web implementation, so the sheet can't be shown on web, and the stub KYC returns no session anyway. Camera/fake-media flags were set but no camera surface was reached.
- **Console warnings, benign on web:**
  - routes `*.view.tsx` lack a default export (`force-update.view.tsx`, `permissions-*.view.tsx` live under `app/`, so expo-router treats them as routes; worth checking that they aren't reachable as URLs on device);
  - a `rum.ts ↔ client.ts` require cycle;
  - `useNativeDriver` fallback.
- **Rate limits:** `/auth/otp/verify` is IP-throttled, and parallel test lanes on 127.0.0.1 share the budget. Spoofing `X-Forwarded-For` to get around it was refused, and the run went ahead after the window cleared.

## What still needs a real Android phone

1. **The ID-check sheet (D-75):** that R1 "Start ID check" opens the in-app check, and how it behaves with camera permission granted and denied. This needs a non-stub or `KYC_MODE=manual` backend that returns a `sessionToken`, or a Didit sandbox.
2. **R2 "Rider setup · Checking":** after the check, and resuming into R2 after killing the app.
3. **R3 "You're verified, <name>":** shown once with the free-jobs meter and "Go online". It did not appear on web.
4. **Out of area and location permission:** Bulawayo out-of-area and permission denied or revoked, with real GPS, a real OS permission dialog, and real background heartbeats.
5. **C4 code auto-fill:** that it fills from the incoming message, the native keypad, and the active-box focus ring.
6. **The map and hero art:** the map under the board, and whether the hero art is cropped on device.
7. **Session persistence and F1:** that the session survives a cold start, and whether F1 reproduces on device (expected: yes).
