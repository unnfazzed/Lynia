# Plan — Test-phase Android APK (GitHub-built, sideloadable)

> Goal: hand a tester a sideloadable Android APK, built on GitHub, that runs the **full** customer
> *and* rider journeys against the live API (`https://lyniago.lyniafinance.com`) with no WhatsApp BSP
> and no Didit KYC. Reviewed by the gstack Engineering planner (+ independent outside voice) and the
> Design planner. Decisions locked with the founder — see the review report at the bottom.
>
> **Headline finding from review:** the OTP + KYC vendor bypass and the deploy/revert runbook
> **already exist and ship**. The only new work is the APK build workflow plus two small mobile fixes.

## What already exists (reuse — do NOT rebuild)

- **OTP bypass** — `apps/api/src/auth/auth.service.ts:97-104`: with `OTP_CHANNEL=console` the code is
  returned in the `POST /auth/otp` response for allowlisted `OTP_TEST_PHONES` numbers, and
  `phone.tsx`/`verify.tsx` pre-fill it. Pure config; no app/API change.
- **Rider KYC bypass** — `apps/api/src/riders/rider.service.ts:73-74`: `stubAutoPass = KYC_PROVIDER
  === "stub" && KYC_MODE === "auto"` (both defaults) creates the rider **already `verified`** so they
  go online immediately. `retryKyc` mirrors it (`:112-113`). **No code change — the draft's
  `KYC_TEST_PHONES` idea was redundant and is dropped.**
- **Deploy + revert runbook** — `docs/PILOT-READINESS.md:331-390` ("Vendor-free QA testing") gives the
  exact `gh variable set OTP_CHANNEL/KYC_PROVIDER/PUSH_PROVIDER/OTP_TEST_PHONES` commands, the
  customer+rider test scripts, and the flip-to-launch (`gh variable delete`) checklist.
  `.github/workflows/release.yml:147-153` wires those as opt-in repo Variables with launch-safe
  defaults (`whatsapp`/`didit`/`fcm`). **Config is that runbook — not new work, and not ad-hoc
  `gcloud` edits (the next `release.yml` deploy rebuilds env from repo Variables and would clobber
  them).**

## Precondition (the only thing that makes this safe)

Setting `OTP_CHANNEL=console` + `KYC_PROVIDER=stub` on the **live production** service breaks OTP
delivery for every non-allowlisted number (`ConsoleOtpSender.send` only logs — `otp-sender.ts:104`)
and auto-verifies **every** rider with no ID check. This is acceptable **only because there are no
real users pre-pilot** (`PILOT-READINESS.md:335-336`). Reverting the QA variables before launch is
mandatory, per the existing checklist.

---

## Deliverable 1 (the real work) — GitHub Actions: sideloadable release APK

New workflow `.github/workflows/android-test-apk.yml`.

- **Trigger:** `workflow_dispatch` (manual button); optional `push` on `test-apk/**` tags.
- **Toolchain:** `actions/checkout` → `pnpm/action-setup` → `actions/setup-node@v4` (node 22, pnpm
  cache) → `actions/setup-java@v4` (Temurin **17** — required by Expo 52 / RN 0.76).
- **Install + prebuild:** `pnpm install --frozen-lockfile=false` → `pnpm --filter @lynia/shared
  build` → `pnpm --filter @lynia/mobile exec expo prebuild --platform android --no-install`
  (generates the un-committed `apps/mobile/android/` project).
- **Build a RUNNABLE APK (P1 correction):** a plain `assembleDebug` APK will **not run** when
  sideloaded — the RN 0.76 debug variant loads JS from a Metro dev server the tester won't have. Build
  a **release-type APK with the JS bundle embedded**, signed with a **throwaway keystore generated in
  the workflow** (founder decision: no stored keystore; reinstalls may need uninstall-first):
  ```bash
  keytool -genkeypair -dname "CN=Lynia Test" -alias lynia-test -keystore /tmp/test.keystore \
    -storepass lyniatest -keypass lyniatest -keyalg RSA -keysize 2048 -validity 365
  cd apps/mobile/android && ./gradlew assembleRelease \
    -Pandroid.injected.signing.store.file=/tmp/test.keystore \
    -Pandroid.injected.signing.store.password=lyniatest \
    -Pandroid.injected.signing.key.alias=lynia-test \
    -Pandroid.injected.signing.key.password=lyniatest
  ```
  Signing via injected Gradle properties means the generated `build.gradle` isn't edited. The release
  variant runs the bundle task, so JS is embedded and the app runs offline.
- **Keys/flags passed to the build:**
  - `GOOGLE_MAPS_API_KEY` from a repo **secret** (founder decision: supply it) so the map renders.
    Restrict the key in GCP by package `zw.co.lynia` + the throwaway keystore's SHA-1.
  - `LYNIA_TEST_BUILD=1` (for the TEST BUILD banner, Deliverable 2).
  - `GOOGLE_SERVICES_JSON` optional: GitHub has no file secrets — base64-decode a secret to disk and
    export its path. Absent is fine (`app.config.ts:59-62` tolerates it; push stays inert).
- **Output:** `actions/upload-artifact` the `.apk` (from `app/build/outputs/apk/release/`). Document
  the sideload steps in the workflow summary / tester notes.
- **TOP BUILD RISK (P2) — de-risk before trusting green CI:** pnpm's symlinked `node_modules` store
  frequently breaks RN Gradle autolinking in a monorepo (repo `.npmrc` is empty → default linker).
  First run may fail resolving `react-native`/native modules. Mitigation: if autolinking fails, set
  `node-linker=hoisted` for the mobile build (a mobile-scoped `.npmrc` or a CI install step) and
  re-prebuild. Treat the first successful CI build as the acceptance gate, not the merge.
- **Secondary:** no Gradle cache = cold ~15-40 min RN-new-arch build per run. Add
  `gradle/actions/setup-gradle` caching after the first green build.

## Deliverable 2 (small mobile fixes, founder chose "both")

- **Bug fix (P2, blocks the rider test) — `apps/mobile/app/rider/become.tsx:111`:** the National ID
  `Field` uses `keyboardType="number-pad"`, but Zimbabwean IDs are alphanumeric (e.g. `63-123456 A
  12`). A tester cannot type a real ID → the KYC form can't be completed. Change to the default
  keyboard (drop the `keyboardType` prop, matching `bikeReg` right below).
- **TEST BUILD banner (P2, build-gated so it never leaks to a real release):**
  - `apps/mobile/app.config.ts:64` — add `extra.testBuild: process.env.LYNIA_TEST_BUILD === "1"`. Only
    the test workflow sets the env, so an EAS release build leaves it falsy.
  - `apps/mobile/src/ui` `Screen` — when `Constants.expoConfig?.extra?.testBuild` is true, render a
    thin bar ("TEST BUILD — live API") above `children`. One component, one place, zero prod risk.

## Deliverable 3 (config — reuse the existing runbook, no new work)

Turn QA mode on with the documented `gh variable set` commands
(`PILOT-READINESS.md:353-361`): `OTP_CHANNEL=console`, `KYC_PROVIDER=stub`, `PUSH_PROVIDER=noop`,
`OTP_TEST_PHONES=<tester numbers>`, then `gh workflow run release.yml`. Revert with the
`gh variable delete` checklist (`:379-387`) before launch.

## Test / verification

- **New:** the APK workflow is verified by a green run that produces an installable APK which **opens
  and reaches the phone screen offline** (proves JS is bundled) — the real acceptance test, not just
  a compiled artifact.
- **Mobile fixes:** unit/RTL — `become.tsx` renders the ID field with a text keyboard; `Screen`
  renders the banner iff `extra.testBuild`. `pnpm --filter @lynia/mobile test` + typecheck stay green.
- **Manual E2E (existing runbook script):** sideload → customer signup (allowlisted number,
  auto-filled code) → post order → from a second allowlisted rider account, become rider (auto
  `verified`) → go online → bid → deliver with handover OTP → rate.

## NOT in scope

- Real WhatsApp BSP, real Didit KYC run, Firebase live FCM, iOS build, Play Store release.
- `KYC_TEST_PHONES` per-phone gate — dropped; the stub auto-pass already covers the rider path, and a
  parallel allowlist beside the unconditional pass would gate nothing (would require tightening
  `stubAutoPass` itself — unnecessary pre-pilot).
- Gradle build caching — deferred to a follow-up after the first green build.
- Full E.164 phone normalization, input-field a11y (`textContentType`/label association), and the OTP
  "we sent a code" copy tweak — P3, real-user polish, filed as TODOs not built here.

## Implementation Tasks

- [ ] **T1 (P1) — ci/mobile — Add `android-test-apk.yml` building a bundled, signed release APK.**
  - Surfaced by: Eng review — `assembleDebug` won't run sideloaded; release + embedded JS + throwaway keystore.
  - Files: `.github/workflows/android-test-apk.yml`
  - Verify: green run; download APK; it installs and opens to the phone screen with no Metro.
- [ ] **T2 (P2) — ci/mobile — De-risk pnpm + Expo prebuild + Gradle autolinking.**
  - Surfaced by: Eng review — symlinked pnpm store breaks RN autolinking; may need `node-linker=hoisted`.
  - Files: `apps/mobile/.npmrc` (only if needed), the workflow install step.
  - Verify: prebuild + `assembleRelease` resolve all native modules on a clean CI runner.
- [ ] **T3 (P2) — mobile — Fix National ID keyboard.**
  - Surfaced by: Design review — `become.tsx:111` `number-pad` blocks alphanumeric ZIM IDs.
  - Files: `apps/mobile/app/rider/become.tsx`
  - Verify: field accepts letters; RTL test asserts text keyboard.
- [ ] **T4 (P2) — mobile — Build-gated TEST BUILD banner.**
  - Surfaced by: Design review — no test-vs-prod signal on a live-API build.
  - Files: `apps/mobile/app.config.ts`, `apps/mobile/src/ui`
  - Verify: banner shows with `LYNIA_TEST_BUILD=1`, absent otherwise.
- [ ] **T5 (P2) — ci — Supply `GOOGLE_MAPS_API_KEY` (repo secret) to the workflow; restrict key in GCP.**
  - Surfaced by: Design review — silent blank map → bug-report noise.
  - Files: `.github/workflows/android-test-apk.yml` (env), GCP key restriction (founder).
  - Verify: map tiles render on the customer home in the built APK.
- [ ] **T6 (P3, docs) — Cross-link this APK workflow from `PILOT-READINESS.md` QA section.**
  - Surfaced by: Eng review — the runbook exists; the APK is the missing "dev build" it references.
  - Files: `docs/PILOT-READINESS.md`
  - Verify: QA section links the workflow + sideload steps.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_found → resolved | Scope cut to APK-only; `assembleDebug`→bundled release APK; pnpm/prebuild autolinking flagged as top risk |
| Outside Voice | independent eng subagent | Cross-model 2nd opinion | 1 | issues_found → resolved | Confirmed KYC bypass already exists (`rider.service.ts:73`) and the PILOT-READINESS runbook already ships; APK signing/bundling corrected |
| Design Review | Design planner | UI/UX gaps for a QA build | 1 | issues_found → resolved | National-ID keyboard bug; build-gated TEST BUILD banner; supply Maps key |

- **CROSS-MODEL:** Eng planner and outside voice fully agree — Deliverables 2 & 3 already exist; the
  only genuine build is the APK, and a debug-variant APK won't run sideloaded. No unresolved tension.
- **VERDICT:** ENG + DESIGN CLEARED. Scope reduced to APK-only per founder. Ready to implement T1–T6.

NO UNRESOLVED DECISIONS
