# On-device QA & real-network checklist (LR16–LR20)

> The device track is **hardware-gated**: an emulator can't reproduce real-network flakiness, a real FCM
> token, or native GPS/permission behaviour. Run this on a **real, low-end Android phone**.
>
> Two ways to get the app on a phone:
> - **The Closed testing build from Play** (v0.51.0 / vc 45 and later, plus OTA updates). This is the
>   R8-shrunk, Play-signed build users get, with Sentry. Prefer it whenever the shipped configuration
>   matters.
> - **The `Android Test APK` workflow** (`.github/workflows/android-test-apk.yml`): a sideloadable APK
>   with a throwaway keystore and the gold TEST BUILD banner (its long-press holds the crash tests). It
>   talks to the live API, so it signs in like any user. The vendor-free QA bypass runs only on a local
>   API (`docs/AZURE-OWNER-RUNBOOK.md` §8).

## 🔴 SDK 54 / API-36 — the hardware items still open

The Expo SDK 54 upgrade (React Native 0.81, React 19, `targetSdkVersion` 36; `docs/KNOWN_BUGS.md` "Expo
SDK 54 upgrade 2026-09-28") shipped to `Closed testing` after an emulator pass, not a handset pass. Check
these on the testers' phones. At least one handset must run **Android 16**, where targeting 36 changes
back handling.

The `Android Emulator Smoke` workflow (`.github/workflows/android-emulator-smoke.yml`) runs that APK on
Android 10, 13 and 16 emulators and walks everything a signed-out user can reach: cold start,
onboarding, phone sign-in with the keyboard up, links into each route with back, relaunch after
force-stop, an offline cold start and the 320x640dp phone. It uploads screenshots and a logcat crash
scan, and fails when a primary button touches the screen edge. Its first run caught onboarding's button
running off the bottom on Android 10, 13 and 16 (`SDK54-09`, `docs/KNOWN_BUGS.md`). It covers the
signed-out half of the cold-start, Inter, back and edge-to-edge items below. The rest needs a phone:
anything behind sign-in, push, background GPS, the camera, and low-end CPU speed.

- [ ] **Cold start on a low-end phone** — the app gets past the splash to the first screen, on a fresh
      install and on a relaunch after force-stop. The New Architecture stays off (`MOB-BOOT-04`); a
      white screen or an instant close is a stop.
- [ ] **Inter everywhere** — titles in bold Inter, labels in semibold, body in regular, not the
      system font (`SDK54-01`). Include a text field's typed text and the order screen's countdown
      clock during an auction.
- [ ] **Back** — the hardware back button and the back gesture behave as on the current
      closed-testing build: back one screen, or close the open sheet or modal. They must never leave
      the app from deep inside it.
- [ ] **Edge-to-edge on every Android version** — SDK 54 draws under the system bars even below
      Android 15. On every top-level screen, nothing hides behind the status bar or the navigation
      bar, and the keyboard doesn't cover a focused field. Start with notifications, onboarding, role,
      help and phone sign-in, which moved to the safe-area `SafeAreaView` (`SDK54-05`).
- [ ] **Offline cache** — open a few screens, force-stop, turn on airplane mode, relaunch: the last
      data shows instead of empty screens (`SDK54-04`).
- [ ] **Push** — a notification arrives with the app closed, and shows as a banner with the app
      open.
- [ ] **Rider online mode** — background location keeps reporting with the screen off
      (expo-task-manager 14, expo-location 19).
- [ ] **Map, camera, photo picker** — the map draws with its pins, and a photo can be taken and
      picked (react-native-maps 1.20, expo-image-picker 17).
- [ ] **Crash reporting** — the LR20 forced-crash gate below reaches Sentry
      (`@sentry/react-native` 6 → 7).

## LR16 — on-device checks (real device)

- [ ] **Native map + tap-to-pin** — pickup & drop-off pins drop where tapped; reverse-geocoded landmark
      shows; a pin outside Zimbabwe is rejected with the honest "out of service area" state (the service area
      is the whole country, D-99).
- [ ] **Live tracking map** (both sides) — rider marker interpolates smoothly; camera fits once then a
      recenter button works (no camera-fight); pickup/drop-off pins render.
- [ ] **FCM device token** — after sign-in the app mints a **native** device token
      (`getDevicePushTokenAsync`) and `POST`s it to `/notifications/device-token`; sign-out `DELETE`s it.
- [ ] **Push receipt per notice** — offer-received (customer), assigned (rider), each lifecycle status,
      expired, cancelled, and the nearby-order broadcast all arrive on the device.
- [ ] **KYC in-app sheet** — "Finish verifying" opens the ID check **inside the app** (Lynia header
      "ID check · Have your national ID ready" over the embedded flow — no browser tab, no URL bar,
      and **no vendor naming anywhere in Lynia-drawn copy**, D-38); the camera permission is asked
      before the sheet; document capture + selfie work inside it; finishing closes the sheet
      automatically and lands on "Finishing verification…"; the app auto-polls while pending and
      resolves to verified/declined with the honest reason.
- [ ] **KYC sheet exits** — ✕ asks "Leave the ID check?"; leaving lands on the "Finish verifying
      your ID" wall (resume works, no new session minted); airplane mode before opening lands on
      "We couldn't open the ID check" with a working "Try again" — and restoring connectivity then
      tapping "Try again" completes normally.
- [ ] **KYC browser fallback** — with the camera permission hard-denied ("Don't allow" twice /
      "Don't ask again"), "Finish verifying" opens the in-app browser tab instead of the sheet, the
      flow completes there, and finishing lands on the branded "All done here" page
      (`GET /kyc/return`) whose "Back to LyniaGo" / auto `lynia://` bounce returns to the app and
      the "Finishing verification…" wall.
- [ ] **GPS degradation (T11)** — mid-delivery: revoke location permission → app shows a "location paused"
      state, last-known position stays labelled-stale (not frozen-silent); turn GPS off → same; background
      the rider app → the customer sees a stale-but-labelled marker, not a lie.
- [ ] **Background / kill / resume mid-delivery** — background then foreground the app on both roles →
      the socket resumes and the REST snapshot reconciles state (no ghost/incorrect status).

## LR17 — real-network pass (low-end Android, throttled)

Run the core journeys on a **≤2 GB-RAM device** under **throttled 3G/EDGE** and flapping connectivity.

- [ ] **Cold start** completes in a reasonable time; no white-screen hang.
- [ ] **Create → auction → tracking → OTP hand-off → rate** each complete under 2–5 s latency.
- [ ] **Airplane-mode mid-flow on every screen** → the 15 s `AbortController` surfaces a retry state
      (`apiFetch`), never an unbounded hang; `OfflineBanner` shows; `websocket→polling` fallback engages;
      optimistic mutations roll back honestly when the write is lost.
- [ ] **Marker interpolation** stays smooth under 2–5 s WS latency (no teleport).
- [ ] **Data usage per delivery** measured (expensive-data reality check).

## LR20 — crash telemetry (Sentry) + store readiness

### Crash telemetry (Sentry) — wired; verify it on each new binary

`@sentry/react-native` catches JS **and** native crashes. It is wired in `src/telemetry/sentry.ts`
(`initSentry()`, no PII, tracing off by default), `app/_layout.tsx` (`Sentry.wrap`, the
`ErrorBoundary`), the `app.config.ts` plugin (org `lyniago`, project `lynia-mobile`, R8 mapping upload
via `enableAndroidGradlePlugin`) and `metro.config.js`. A release build **fails fast** when
`EXPO_PUBLIC_SENTRY_DSN` or `SENTRY_AUTH_TOKEN` is missing on EAS (`app.config.ts`), and `mobile-ota.yml`
and `android-test-apk.yml` pass the DSN from the `EXPO_PUBLIC_SENTRY_DSN` repo secret, because they build
on the runner.

Verify on every new binary before promoting it:

- [ ] Install it, long-press the gold TEST BUILD banner → "Crash telemetry test", and fire **both**
      options. **JS error** proves the source maps; **Native crash** proves the R8 mapping. Each lands in
      Sentry with a readable stack, the right `environment`, and release `zw.co.lynia@<version>+<versionCode>`.
- [ ] The app boots and logcat shows no Sentry integration errors (this also covers the Metro shim
      `metro-shims/sentry-browser-redirect.js`, MOB-BOOT-03-SIB-1, which jest cannot test).
- [ ] After an OTA, a forced JS error still arrives (proves the OTA carried the DSN).

**API side.** `@sentry/node` reports every unexpected 500 with its correlationId. It is on when the repo
Variable `SENTRY_ENABLED=true` and the `SENTRY_DSN` secret is in Key Vault
(`infra/azure/vendor-secrets.sh`, `docs/AZURE-OWNER-RUNBOOK.md` §3); the release then sets
`SENTRY_ENVIRONMENT=production-azure`.

- [ ] Force a test error on the API and confirm it appears with its correlationId.
- [ ] Consider the same for the admin app (`@sentry/nextjs`) — lower priority.

## Background GPS during Maps navigation (foreground service) — NEW BINARY required

> The "Follow route in Google Maps" hand-off backgrounds the rider app; the Android foreground
> service (`src/realtime/background-location-task.ts` + `isAndroidForegroundServiceEnabled` in
> `app.config.ts`) keeps the customer's live map moving through it. This is a **native manifest
> change** (FOREGROUND_SERVICE / FOREGROUND_SERVICE_LOCATION) — the fingerprint runtimeVersion
> shifts, so it ships **only in a freshly built binary, never via OTA**. Verify on a real Android
> phone (Android 12+ if possible — strictest foreground-service-start rules); an emulator won't
> reproduce OEM battery-killer behaviour.

Setup: two devices (or device + browser) — rider app on the phone under test, customer tracking
view (`order/[id]`) on the second. Location permission granted as **"While using the app"** only.

- [ ] **Stream survives the nav hand-off** — accept a job → tap **Follow route in Google Maps** →
      drive/walk ~200 m with the app backgrounded behind Maps → the customer's rider marker keeps
      moving the whole time (updates roughly every 10 s / 25 m; it must NOT freeze at the hand-off
      point like the pre-fix behaviour).
- [ ] **Foreground-service notification** — the moment the job goes active, a persistent
      notification appears: "LyniaGo — delivery in progress / Sharing your location with the
      customer for this delivery." It stays pinned while backgrounded and cannot be swiped away.
- [ ] **Streaming stops at delivered** — complete the OTP hand-off → the notification disappears
      within seconds and the customer map receives no further rider positions. Repeat for a
      **cancelled** job (either side): same result.
- [ ] **No streaming without an active job** — with the rider online but unassigned, background the
      app for 5+ minutes: no location notification, and Settings → Apps → LyniaGo → Battery/data
      shows no ongoing location use.
- [ ] **While-in-use permission only** — Settings → Apps → LyniaGo → Permissions → Location reads
      "Allow only while using the app"; the app must never prompt for "Allow all the time"
      (Play-policy gate: we deliberately do not request `ACCESS_BACKGROUND_LOCATION`).
- [ ] **Silent degrade** — revoke location permission mid-job (T11 above): the job screen shows the
      location-paused state, no crash, and the foreground-service notification clears. On **iOS**
      (when relevant) the background start is EXPECTED to no-op — foreground-only streaming, no
      error surfaced.
- [ ] **Dead-zone coalescing still holds** — airplane-mode ~1 min while backgrounded behind Maps,
      then restore: the customer map jumps once to the rider's CURRENT position (one fix, no stale
      breadcrumb flood), matching the foreground reconnect behaviour.

### Store readiness
- [ ] Play listing + versioning/build-number discipline in `app.config.ts`.
- [ ] **Privacy notice** URL (from `docs/DATA-RETENTION.md`) — must state what's collected + retention +
      how to request erasure; the app's "delete my account" action calls `DELETE /auth/me`.
- [ ] Play **data-safety form** matches what the app actually collects (location, phone, national ID).
- [ ] Staged rollout: Closed testing → production at 10% (Play granted production access 2026-10-14).
