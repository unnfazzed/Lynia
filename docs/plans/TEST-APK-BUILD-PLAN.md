# Plan — Test-phase APK build + vendor-blocker bypass (customer + rider)

> Goal: hand a tester a sideloadable Android APK, built on GitHub, that can run the **full**
> customer *and* rider journeys against the live API — without waiting on the WhatsApp BSP or a
> real Didit KYC run. Decisions locked with the founder: Gradle-in-Actions build, reuse the
> existing console+allowlist OTP path, add an equivalent test-only KYC bypass, point at the live
> API `https://lyniago.lyniafinance.com`.

## Context (what already exists — do not rebuild)

- **OTP bypass is already built and prod-safe.** `apps/api/src/auth/auth.service.ts` returns the
  code in the `requestOtp` response (`devCode`) when `OTP_CHANNEL=console` AND (`NODE_ENV!=production`
  OR the phone is in `OTP_TEST_PHONES`). The mobile `phone.tsx` already reads `devCode` and pre-fills
  `verify.tsx`. So for the customer path, **no app or API code change is needed** — it is deployment
  config on the live API.
- **KYC has a stub but it is not a pass.** `KYC_PROVIDER=stub` (default) → `StubKycVendor.submit()`
  returns `status:"pending"`, so a stub rider **never reaches `verified`** and cannot go online.
  The only path to `verified` today is the admin backstop `POST /admin/riders/:profileId/kyc`
  (AdminGuard). There is **no self-serve test bypass** for the rider journey — this is the one real
  code gap.
- **No APK build exists in CI.** `apps/mobile/package.json` build script is a no-op
  ("ships via EAS Build; not built in CI"). `app.config.ts` is fail-safe: missing
  `GOOGLE_MAPS_API_KEY` → blank map but build succeeds; missing `google-services.json` → push inert
  but build succeeds. `extra.apiUrl` is hardcoded to the live LB.

## Deliverable 1 — GitHub Actions: build a sideloadable test APK

New workflow `.github/workflows/android-test-apk.yml`:

- Trigger: `workflow_dispatch` (manual "Run workflow" button) + optional push on a `test-apk/**`
  tag. Manual is the primary path so a build is on-demand, not on every push.
- Steps: checkout → pnpm/action-setup → setup-node 22 (pnpm cache) → setup-java 17 (Temurin) →
  `pnpm install --frozen-lockfile=false` → `pnpm --filter @lynia/shared build` →
  `pnpm --filter @lynia/mobile exec expo prebuild --platform android --no-install` →
  `cd apps/mobile/android && ./gradlew assembleRelease` (or `assembleDebug` for zero signing setup) →
  `actions/upload-artifact` the resulting `.apk`.
- **Signing:** default to `assembleDebug` (auto debug keystore, installs on any device, no secrets).
  Release-signed is a follow-up if a stable upgrade path is needed. `assembleRelease` unsigned won't
  install — call this out.
- **Maps/FCM keys:** pass `GOOGLE_MAPS_API_KEY` from repo secret if present (map renders), and the
  `GOOGLE_SERVICES_JSON` file secret if present (push works). Both optional — build must still
  succeed when unset (app.config.ts already handles absence).
- Output: the APK downloadable from the Actions run summary. Document the sideload steps.

Open questions for the eng planner: expo prebuild in CI vs committing the `android/` project;
Gradle/JDK/AGP version pinning against Expo 52 / RN 0.76; build time + caching.

## Deliverable 2 — Rider KYC test bypass (the only code change)

Options (planner to choose):

- **A. Test-phone auto-verify in the stub (recommended).** Add `KYC_TEST_PHONES` (mirror of
  `OTP_TEST_PHONES`). When `KYC_PROVIDER=stub` and the rider's phone is allowlisted, mark KYC
  `verified` on submit (or immediately after) so the rider can go online. Hard-gate exactly like
  OTP: never active for a non-allowlisted number; the existing Didit signature path is untouched.
- **B. Document the admin-verify step.** No code change: after a test rider submits, call
  `POST /admin/riders/:profileId/kyc {status:"verified"}` with an admin token. Zero risk, but manual
  and needs an admin credential per tester — clunky for self-serve testing.

Recommendation: **A**, because it keeps the tester self-serve and matches the OTP bypass shape
(same allowlist mental model, same prod-safety proof). Reuse the `isTestPhone` normalization.

## Deliverable 3 — Deployment config on the live API (no code)

Set on the Cloud Run service for the test window:
`OTP_CHANNEL=console`, `OTP_TEST_PHONES=<tester numbers>`, and (if option A) `KYC_TEST_PHONES=<same>`.
`KYC_PROVIDER` stays `stub`. **Revert checklist** after testing: clear both allowlists, set
`OTP_CHANNEL=whatsapp`. Add this to `docs/PILOT-READINESS.md` launch gate.

## Safety invariants (must hold)

- No bypass path is reachable for a phone not on the allowlist, in any environment.
- Production launch requires both allowlists empty and `OTP_CHANNEL=whatsapp` — assert in the
  pilot-readiness gate; consider a boot-time warn if allowlists are non-empty in production.
- The debug-signed APK is for testing only, never a Play listing.

## Test / verification

- API unit tests for the KYC test-phone gate (mirror `otp` allowlist tests): allowlisted →
  verified, non-allowlisted → pending, empty list → pending.
- CI must stay green (typecheck/build/test unchanged for the console+stub defaults).
- Manual: run the workflow, sideload, complete customer signup + a full rider go-online → offer →
  deliver → OTP handoff loop against the live API.

## Out of scope

Real WhatsApp BSP, real Didit run, Firebase live FCM, iOS build, Play Store release.
