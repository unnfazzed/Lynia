# APP-SIZE.md — mobile download & OTA size strategy

**Owner intent:** keep LyniaGo small to install and cheap to update. Our users are in Zimbabwe,
where mobile data is expensive and often prepaid — every megabyte of the Play download and every
megabyte of an OTA update is money out of a real person's pocket. This doc is the playbook: why
size matters, what we ship, the levers we pull to shrink it, and the guardrails that keep it from
quietly creeping back up.

The discipline is borrowed from DoorDash's app-size program (see Sources): treat binary size as a
first-class, measured, budgeted metric, and make every increase an **intentional** decision rather
than an accident that ships.

---

## Why size matters here

- **Play download size is a cost to the user.** On a metered/prepaid connection the initial install
  is a direct data charge. A smaller APK/AAB is a lower barrier to the first install and to
  reinstalls after a wipe.
- **OTA update size is ALSO a cost — and it recurs.** LyniaGo ships JS/asset fixes over the air
  (`expo-updates`, `mobile-ota.yml`). Every installed device that picks up an update downloads the
  changed bundle. A bloated JS bundle is paid for *repeatedly*, on every OTA, by every active user —
  which is exactly why the per-PR guardrail below watches the **JS bundle** specifically, not just
  the native binary.
- **Low-end devices.** The target market runs cheap Android hardware with limited storage; a lean
  app is one that installs and stays installed.

Two numbers therefore both matter, and they are different things: the **native binary** (what Play
delivers) and the **JS bundle** (what an OTA delivers). We measure and budget both.

## What we ship

| Channel | Artifact | Built by | Notes |
|---|---|---|---|
| **Production (Play)** | Android **App Bundle** (`.aab`) | EAS Build → Submit (`mobile-release.yml`, dormant until EAS is armed) | Google Play splits the AAB per device (ABI, screen density, language) at install time, so the **per-device download is smaller than the raw .aab**. Play App Signing manages the release key. |
| **OTA** | JS + asset bundle | `mobile-ota.yml` (dormant until EAS is armed) | Only lands on binaries whose native fingerprint matches (`runtimeVersion: fingerprint`). Native/SDK changes need a store release, not an OTA. |
| **QA / dogfood** | universal signed release **APK** | `android-test-apk.yml` (on-demand) | A single universal APK (all ABIs) for sideloading — deliberately *larger* than a Play per-device split. Useful as a size upper bound and for the per-category breakdown. |

Android-only today. iOS is not built or shipped yet (see the iOS checklist below).

## Levers applied

Measured on 2026-07-20 (before = `main` @ `bc1ed92`, run 29729902349; after = `main` @ `e72f90f`
post-merge, run 29739035561 — identical workflow, method, and runner class):

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| QA APK total (on-disk, universal) | 72,972,672 B (69.6 MiB) | 59,791,441 B (57.0 MiB) | **−13,181,231 B (−18.1%)** |
| — of which `classes*.dex` (uncompressed) | 34.6 MiB | 8.6 MiB | **−75%** (R8 minification) |
| — of which native `lib/` (4 ABIs, uncompressed) | ~49 MiB | ~49 MiB | unchanged (expected — R8 doesn't touch `.so`; Play's AAB split ships one ABI per device) |
| Hermes JS bundle (`.hbc`) | 6,883,309 B (6.56 MiB) | 5,015,672 B (4.78 MiB) | **−1,867,637 B (−27.1%)** |
| Android `expo export` total (JS + assets) | 13,116,438 B (12.51 MiB) | 11,248,801 B (10.73 MiB) | **−1,867,637 B (−14.2%)** |
| Release AAB (raw, pre-split) | _not yet measured — `mobile-release.yml` is dormant until EAS is armed; its "Measure AAB size" step reports this on the first armed release_ | | |

Assets were byte-identical before/after (41 files, 6,230,271 B), so the whole JS delta is icon
bytecode — direct evidence the barrel import was bundling the full Lucide set. The `.hbc` saving
also shrinks every future OTA download.

Method: "Size report" step in android-test-apk.yml (native APK); `expo export` +
scripts/check-bundle-size.mjs (JS bundle). See "How to measure locally".

Two levers are applied in this program (in `apps/mobile`, via the sibling change set):

1. **R8/ProGuard code shrinking + resource shrinking**, enabled for the Android **release** build
   through `expo-build-properties` (`android.enableProguardInReleaseBuilds` +
   `android.enableShrinkResourcesInReleaseBuilds` in the plugin block of `app.config.ts`). R8
   tree-shakes and minifies the compiled Kotlin/Java + dependencies and strips unused resources —
   the standard Android release-size win. It runs at the native build step (EAS `.aab` and the QA
   `assembleRelease` APK), so it shrinks the **binary**, not the OTA JS bundle. Because Expo CNG
   regenerates `android/`, this MUST live in config, never a hand-edit of `build.gradle`.
   **First-R8-release smoke test:** R8/`shrinkResources` failure modes only manifest at runtime in
   release mode. The QA APK (`android-test-apk.yml`) now builds with R8 on, so before the first
   store cut with shrinking enabled, sideload it once and exercise the reflective/resource-sensitive
   surfaces: map render, push notification (icon), image picker, secure store, splash, OTA check.
2. **Per-icon Lucide imports (kill the barrel import).** `src/ui/Icon.tsx` imported its glyphs as a
   named import from the `lucide-react-native` package root — a *barrel* that re-exports the entire
   icon set. Metro/Hermes tree-shaking through a barrel is unreliable, so the whole set risked
   landing in the bundle. Replacing the barrel with per-icon deep imports guarantees only the ~two
   dozen glyphs the product actually uses are bundled. This shrinks the **JS bundle**, so it helps
   both the binary *and* every OTA — and it is a cross-platform win (helps iOS too, when it ships).

## Guardrails

Size is measured and gated at three points, so a regression is caught early and a legitimate
increase is a reviewed, on-the-record decision:

1. **Per-PR JS bundle budget** — `ci.yml` job `mobile-bundle-size`. On any PR that touches
   mobile-relevant paths (`apps/mobile/**`, `packages/shared/**`, `packages/design/**`,
   `pnpm-lock.yaml`, or the workflow itself) it runs a pure Metro/JS `expo export --platform android`
   (no Android SDK needed) and `scripts/check-bundle-size.mjs`, which compares the **export total**
   and the **Hermes bundle** against `apps/mobile/size-budget.json`. Over budget ⇒ the job **fails**.
   Unrelated PRs skip the work and stay green/fast (an in-job changed-files guard).
   - **The intentional-growth rule:** if a PR legitimately grows the bundle past budget, **raise the
     number in `size-budget.json` in the same PR** and justify it in one sentence in the PR
     description. Growth is allowed — silent growth is not.
   - A budget of `0` (or an absent key) is **report-only**: it measures and prints but never fails,
     so the guardrail is safe to land before the numbers are calibrated from a real measurement.
2. **QA-APK size report** — `android-test-apk.yml`, the "Size report" step. After assembling the
   signed release APK it writes the on-disk APK size plus an uncompressed per-category breakdown
   (native libs per ABI, `classes*.dex`, `res/`+`assets/`) to the run summary — release-candidate
   visibility into *where* the native weight is.
3. **Release-time AAB measurement** — `mobile-release.yml`, the best-effort "Measure AAB size" step.
   It records the raw `.aab` byte size to the run summary (and notes that Play's per-device download
   is smaller because the bundle is split). It is `continue-on-error` — a size-measurement failure
   must never break a release.

## Dependency size audit

Every dependency is either **native** (ships a compiled `.so`/`.dex`/Play-Services library → grows
the *binary*) or **JS** (lands in the Hermes bundle → grows the binary *and every OTA*), and many
Expo/RN packages are both. The rule, aligned with the DoorDash program: **one SDK per use case;
every new SDK must justify its size against what's already in the tree; prefer Expo modules already
present** (they reuse the shared `expo-modules-core` runtime instead of adding a parallel one).

Audit of `apps/mobile/package.json` runtime dependencies:

| Dependency | Weight class | Where it lands | Verdict |
|---|---|---|---|
| `react-native` / `react` | Native (baseline) | Hermes engine + RN core `.so` + `classes.dex` | Unavoidable platform floor. The dominant fixed cost of any RN app. |
| **`react-native-maps`** | **Native (heavy)** | Google Play Services **Maps** SDK (`play-services-maps` + `-base`) → `lib/` + `dex` | **The single heaviest optional native dep.** Core to the product (pickup/tracking map), so it stays — but it is the first place to look for native bloat, and a reason to never add a *second* mapping SDK. |
| `react-native-svg` | Native (moderate) | Native SVG renderer | Required by the Lucide icons. One vector-rendering lib — keep it the only one. |
| `react-native-screens`, `react-native-safe-area-context` | Native (small–moderate) | Navigation primitives | Required by `expo-router`. Standard, shared — keep. |
| `expo` + the `expo-*` modules (`-location`, `-notifications`, `-image-picker`, `-secure-store`, `-file-system`, `-task-manager`, `-updates`, `-router`, `-splash-screen`, `-font`, `-constants`, `-application`, `-device`, `-localization`, `-web-browser`, `-image-manipulator`, `-status-bar`, `-linking`, `-build-properties`) | Native + JS | Each autolinks a native module (`.dex`/`.so`) + JS glue | Individually small, collectively a real slice of the binary — but they **share `expo-modules-core`**, which is exactly why we prefer an Expo module over a third-party equivalent. Each one here maps to a real capability; audit the list when adding, don't accumulate. |
| `@tanstack/react-query` (+ `-persist-client`, `query-async-storage-persister`) | JS (moderate) | Hermes bundle | The one data-fetch/cache layer (see `PERFORMANCE.md`). Justified and central — do not add a second caching/fetching lib. |
| `socket.io-client` | JS (moderate) | Hermes bundle | The one realtime transport. Sizeable but core to the offer loop / live tracking. One realtime SDK only. |
| `posthog-react-native` | JS | Hermes bundle | The one analytics SDK, and it's **key-gated** (only initializes when a key is present, `src/telemetry/analytics.tsx`) — but its code still ships regardless. Justify keeping it at each review; never add a second analytics/telemetry SDK alongside it. |
| `lucide-react-native` | JS | Hermes bundle (SVG path data per glyph) | Icons. Subject to the **barrel-import** trap (see Levers) — must be imported per-icon so only used glyphs bundle. |
| `@expo-google-fonts/inter` | JS + font assets | Bundle + `assets/` (TTF) | Ship **only the weights actually used**; each Inter weight is a real TTF. Candidate for native font embedding on a future EAS build (`PERFORMANCE.md` backlog). |

**New-dependency checklist (apply in review):** Does an existing dep already cover this use case? Is
it an Expo module (shared core) or a parallel native runtime? What does it add to the binary *and*
the OTA bundle (check the `mobile-bundle-size` job's report on the PR)? If it's net-new weight for a
non-core capability, it needs an explicit justification — the same bar as bumping `size-budget.json`.

## iOS pre-launch checklist

Nothing ships to iOS yet. When it does, size discipline carries over — most of it is automatic, a
few switches must be verified:

- **App thinning / slicing is automatic** from asset catalogs: the App Store delivers per-device
  slices (only the needed image scales/resources), analogous to Play's AAB split. Put images in
  asset catalogs so slicing can work.
- **Verify release build settings stay on:** *Strip Swift Symbols* (`STRIP_SWIFT_SYMBOLS`) and
  dead-code stripping should remain enabled in the Release configuration — they are on by default;
  don't let a config change turn them off.
- **Keep the Lucide/per-icon discipline** — it's a cross-platform bundle win, iOS included.
- **Measure via App Store Connect before launch** — the app-thinning report / "App Store file sizes"
  gives the real per-device download; check it as the iOS equivalent of the AAB/APK numbers here.
- **Add an iOS size step to CI when iOS ships** — mirror the Android APK/AAB size steps
  (`.ipa` size to the run summary) so iOS gets the same release-candidate visibility.

## How to measure locally

**JS bundle (fast, no Android SDK):**

```bash
pnpm --filter @lynia/shared build
cd apps/mobile
pnpm exec expo export --platform android --output-dir dist
node scripts/check-bundle-size.mjs dist
```

The Hermes bytecode is the `.hbc` under `dist/_expo/static/js/android/`; the script prints the
export total, the Hermes bundle size, and (once `size-budget.json` is calibrated) headroom vs budget.

**Native binary:** run the **Android Test APK** workflow (`android-test-apk.yml`, `workflow_dispatch`)
and read its "Size report" step for the on-disk APK size + per-category breakdown; or build locally
with the same `./gradlew assembleRelease` and `unzip -l` the APK. Remember the QA APK is *universal*
(all ABIs) — a Play per-device download is smaller.

## Sources / further reading

- DoorDash — *Shrinking your mobile app: strategies for a leaner, faster app*:
  <https://careersatdoordash.com/blog/doordash-shrinking-your-mobile-app/>
- Companion in this repo: `docs/PERFORMANCE.md` (speed/latency/cost strategy — the OTA-size backlog
  items live there), `docs/LAUNCH-DEPLOYMENT-STRATEGY.md` (the AAB/OTA channels).
