# On-device QA & real-network checklist (LR16–LR20)

> The device track is **hardware-gated** — an emulator can't reproduce real-network flakiness, a real FCM
> token (Expo Go can't mint one), or native GPS/permission behaviour. This is the runbook to execute on a
> **dev build** on a **real, low-end Android phone**. Build the test APK via the `Android Test APK`
> workflow (`.github/workflows/android-test-apk.yml`); QA-mode config in `docs/PILOT-READINESS.md`.

## LR16 — on-device `/qa` (dev build, real device)

- [ ] **Native map + tap-to-pin** — pickup & drop-off pins drop where tapped; reverse-geocoded landmark
      shows; out-of-corridor pin is rejected with the honest "out of service area" state.
- [ ] **Live tracking map** (both sides) — rider marker interpolates smoothly; camera fits once then a
      recenter button works (no camera-fight); pickup/drop-off pins render.
- [ ] **FCM device token** — after sign-in the app mints a **native** device token
      (`getDevicePushTokenAsync`) and `POST`s it to `/notifications/device-token`; sign-out `DELETE`s it.
- [ ] **Push receipt per notice** — offer-received (customer), assigned (rider), each lifecycle status,
      expired, cancelled, and the nearby-order broadcast all arrive on the device.
- [ ] **KYC hand-off** — in-app browser opens the Didit flow; the app auto-polls while pending and
      resolves to verified/declined with the honest reason.
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
- [ ] **Data usage per delivery** measured (expensive-data reality check for the corridor).

## LR20 — crash telemetry (Sentry) + store readiness

### Crash telemetry runbook (do on the dev build — native SDK, not verifiable off-device)
There is client RUM (`apps/mobile/src/telemetry/rum.ts`) but **no crash reporter** — a crash on a
tester's phone is currently invisible. Wire `@sentry/react-native` (catches JS **and** native crashes;
Crashlytics is the alternative):

1. `cd apps/mobile && npx @sentry/wizard@latest -i reactNative` (or `expo install @sentry/react-native`).
2. Add the Expo config plugin in `app.config.ts` (`plugins: ["@sentry/react-native/expo"]`) with the
   org/project.
3. Init behind an env DSN so it's **inert without config** (mirrors the OTEL/push seam):
   ```ts
   import * as Sentry from "@sentry/react-native";
   if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
     Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1 });
   }
   export default Sentry.wrap(RootLayout); // wrap the router root
   ```
4. Add `EXPO_PUBLIC_SENTRY_DSN` as an EAS secret; keep it unset in dev so local runs stay quiet.
5. **Verify**: trigger a forced test crash from a **release** build → it appears in the Sentry dashboard
   with a symbolicated stack. (This is the LR20 exit test.)

- [ ] Add Sentry (or Crashlytics) per the above; forced test crash visible from a release build.
- [ ] Consider the same for the admin app (`@sentry/nextjs`) — lower priority.

> **API side wired (roadmap 1.1).** `@sentry/node` is initialized in `apps/api/src/main.ts` via
> `observability/sentry.ts`, `AllExceptionsFilter` reports every unexpected 500 (with its
> correlationId), and the deploy plumbing exists: `release.yml` injects `SENTRY_DSN` (secret) +
> `SENTRY_ENVIRONMENT=production` behind the **`SENTRY_ENABLED`** repo Variable, exactly like the
> Didit/WhatsApp/Bird vendor gates. It is **inert until activated** — founder steps:
>
> 1. Create a Sentry project (Node.js) → copy its DSN.
> 2. `gcloud secrets create SENTRY_DSN …` + `gcloud secrets versions add SENTRY_DSN --data-file=-` with
>    the DSN, then grant the **runtime SA** `roles/secretmanager.secretAccessor` on it.
> 3. Set the repo Variable **`SENTRY_ENABLED=true`** (optionally `SENTRY_TRACES_SAMPLE_RATE`, default 0.1).
> 4. Deploy (push to `main`); the startup log should read `Sentry enabled (env=production)`. Force a
>    test error and confirm it appears in the dashboard with its correlationId.
>
> Order matters: create the secret (step 2) **before** flipping `SENTRY_ENABLED` (step 3), or the
> `--set-secrets` deploy fails on a missing target — the same rule the vendor gates follow.
>
> The mobile (`@sentry/react-native`) and admin (`@sentry/nextjs`) halves are the device/build-gated
> steps above and are intentionally left for an on-device pass so the calibrated JS bundle-size budget
> isn't changed blind.

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
- [ ] Staged rollout: internal → closed track → the corridor.
