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
| **Production (Play)** | Android **App Bundle** (`.aab`) | EAS Build → Submit (`mobile-release.yml`) — **armed and shipping since 2026-08-04** | Google Play splits the AAB per device (ABI, screen density, language) at install time, so the **per-device download is smaller than the raw .aab**. Play App Signing manages the release key. First shipped artifact: **31.04 MiB raw** (see "First shipped artifact" below). |
| **OTA** | JS + asset bundle | `mobile-ota.yml` — **repaired, one store build from usable** (`REL-01`/`REL-02` both fixed, `docs/KNOWN_BUGS.md`); zero updates published to date | Only lands on binaries whose native fingerprint matches (`runtimeVersion: fingerprint`). Native/SDK changes need a store release, not an OTA. The live binary predates the fingerprint fix, so OTA size work only pays off from the next store build onward — until then every byte still ships via the store lane. |
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
| Release AAB (raw, pre-split) | _not measured (EAS not yet armed on 2026-07-20)_ | _first measured 2026-08-04:_ **32,546,001 B (31.04 MiB)** | _no before/after — see "First shipped artifact"_ |

Assets were byte-identical before/after (41 files, 6,230,271 B), so the whole JS delta is icon
bytecode — direct evidence the barrel import was bundling the full Lucide set. The `.hbc` saving
also shrinks every future OTA download.

Method: "Size report" step in android-test-apk.yml (native APK); `expo export` +
scripts/check-bundle-size.mjs (JS bundle). See "How to measure locally".

Two levers are applied in this program (in `apps/mobile`, via the sibling change set):

1. **R8/ProGuard code shrinking**, enabled for the Android **release** build through
   `expo-build-properties` (`android.enableProguardInReleaseBuilds` in the plugin block of
   `app.config.ts`). R8 tree-shakes and minifies the compiled Kotlin/Java + dependencies — the
   standard Android release-size win, and the source of essentially the whole `classes.dex` delta
   below. It runs at the native build step (EAS `.aab` and the QA `assembleRelease` APK), so it
   shrinks the **binary**, not the OTA JS bundle. Because Expo CNG regenerates `android/`, this MUST
   live in config, never a hand-edit of `build.gradle`.

   ⚠️ **Resource shrinking (`android.enableShrinkResourcesInReleaseBuilds`) is OFF as of 2026-08-04
   — it shipped a build that could not start.** The smoke test this section used to merely
   *recommend* was never run, and v0.17.12 reached the Play internal track unable to get past the
   splash: the app installed, showed its icon on white, and stayed there — no crash, no error
   screen, nothing in logcat. Mechanism: React Native's release asset pipeline copies every
   `require()`d **non-image** asset into `res/raw/` (here, the three subsetted Inter `.ttf`s), and
   they are reached only by runtime name lookup — never by a resource ID in Java or XML, which is
   precisely what AAPT2's resource shrinker treats as unreachable. With the fonts blanked,
   `expo-asset` fell through to fetching them over the network, and `Asset.downloadAsync()` has no
   timeout; since `app/_layout.tsx` gates **both** the first render and `SplashScreen.hideAsync()`
   on `useAppFonts()`, the app waited on that promise forever. See `docs/KNOWN_BUGS.md` → `MOB-BOOT-01`.

   The boot path is now independently safe — `useAppFonts` is time-bounded (`src/ui/fonts.ts`), so a
   stalled font load degrades to the system font instead of bricking startup. Re-enabling resource
   shrinking still needs **both** of: a `res/raw/keep.xml` (`tools:keep="@raw/*"`) shipped through a
   config plugin (CNG regenerates `android/`, so a hand-edit will not survive), and the smoke test
   below actually executed on a handset. The remaining prize is ~1 MiB of resources; weigh it
   against what it already cost once.

   **Release-build smoke test (run this before ANY future shrinking change):** R8/`shrinkResources`
   failure modes only manifest at runtime in release mode, and no CI check in this repo can catch
   them. Sideload the QA APK (`android-test-apk.yml`, which builds with R8 on) and exercise the
   reflective/resource-sensitive surfaces: **app launches past the splash**, fonts render as Inter
   (not the system face), map render, push notification (icon), image picker, secure store, OTA check.
2. **Per-icon Lucide imports (kill the barrel import).** `src/ui/Icon.tsx` imported its glyphs as a
   named import from the `lucide-react-native` package root — a *barrel* that re-exports the entire
   icon set. Metro/Hermes tree-shaking through a barrel is unreliable, so the whole set risked
   landing in the bundle. Replacing the barrel with per-icon deep imports guarantees only the ~two
   dozen glyphs the product actually uses are bundled. This shrinks the **JS bundle**, so it helps
   both the binary *and* every OTA — and it is a cross-platform win (helps iOS too, when it ships).
3. **Subsetted self-hosted Inter (A-O13 / LC-A05, 2026-08-03).** The 3 self-hosted Inter TTFs
   (`src/ui/fonts.ts`) shipped each weight's full Google-Fonts charset (Latin + Cyrillic + Greek +
   Vietnamese extensions, ~342-344 KB each) though a repo-wide scan of every literal character in
   `apps/mobile/src`+`app` found only 23 distinct non-ASCII codepoints ever rendered, all common
   Latin-1 punctuation/symbols/one emoji, zero non-Latin script. `apps/mobile/scripts/subset-fonts.mjs`
   (pyftsubset via the `fonttools` Python package, dev-time only — never runs in CI) regenerates
   committed, glyph-subsetted assets in `apps/mobile/assets/fonts/` from the Unicode ranges pinned in
   `scripts/font-safe-ranges.mjs` (Latin script + common symbols/punctuation/math/arrows/box-drawing/
   dingbats/emoji — deliberately excluding Cyrillic/Greek/Vietnamese-extensions/CJK). `fonts.ts`
   `require()`s these local assets instead of importing `@expo-google-fonts/inter` (moved to a
   devDependency — it's now only the subsetting script's source material, not a runtime import).
   Measured via `expo export --platform android`: **Android export total 7,240,457 → 6,546,466 bytes
   (−693,991 B / −9.6%)**; each font file 342-344 KB → 112-113 KB (−67.3%). Hermes bundle unchanged
   (fonts are export assets, not JS). `scripts/check-font-charset.mjs` (wired into `pnpm lint`) fails
   CI if a future UI string introduces a character outside the safe ranges — the regression guard
   against a silent tofu-box on-device. **Trade-off, recorded explicitly:** a user who types a
   Cyrillic/Greek/CJK character into a free-text field (name, order note, KYC) sees a tofu box for
   that one glyph — same as today for any character outside Inter's original charset, and neither of
   Zimbabwe's other official languages (Shona, Ndebele) needs a script beyond the retained Latin
   Extended-A/B range.
4. **Bundle trim before the budget reset (2026-10-02, owner decision "trim first, then reset").**
   Today's v2-handoff PRs had raised the budget again and again until it was nearly full. Before
   resetting it, the bundle was attributed by source (an `expo export --no-bytecode --source-maps`
   build, then generated bytes summed per source file from the source map), and the dead weight was
   cut without changing any screen:
   - **Dependency-internal stubs** (`apps/mobile/metro-shims/bundle-trim-redirect.js`, Metro
     resolver, each rule scoped to the one file that pulls the weight in):
     - `assert` under `@ide/backoff` (expo-notifications' push-token retry): the npm polyfill pulled
       in `util`, `get-intrinsic`, `call-bind` and ~35 helper packages (~67 KB minified JS) to back
       five `assert(condition, message)` checks. The stub keeps that exact throw-on-falsy contract.
     - PostHog's in-app survey UI (`posthog-react-native`'s index re-exports `./surveys`, plus
       `@posthog/core/surveys`, ~63 KB): the app mounts `PostHogProvider` only, never the survey
       provider, so the survey UI can never render.
     - zod's `fromJSONSchema` (~12 KB): nothing calls it. The stub throws if anything ever does.
   - **More Sentry web-only code** (`metro-shims/sentry-browser-redirect.js`, same stub as replay
     and feedback): `@sentry/browser` page-load tracing, JS profiling, the offline IndexedDB
     transport, report dialog, web-worker / ReportingObserver / context-lines / GraphQL / Spotlight
     integrations and the four feature-flag adapters; `@sentry/react`'s React-Router and TanStack-Router
     instrumentation; `@sentry-internal/browser-utils`' web-vitals trackers (~69 KB together). Each is
     redirected only when the package index is the importer, after checking every name
     `@sentry/react-native` imports from those packages, so the RN SDK's live paths (breadcrumbs,
     httpClient, outgoing-request tracing, fetch transport) resolve the real modules.
   - **Dead app code:** the 8c home header and cards (`HomeHeader`/`HomeStatusRow`, `LiveOrderCard`,
     `RestaurantCard`), `BrandHeader`, `CodeInput`, `Avatar`/`RiderMini` and `Celebrate`. They were
     only re-exported from the `src/ui` barrel (Metro does not tree-shake, so a re-export ships the
     module); no live route rendered them after the v2 handoffs. Also removed: three retired
     payment-prompt API calls (cash only since D-59) and two unused constants (~15 KB). The kit primitives
     that `tools/parity/codegen/emit.mjs` may emit (`PriceMath`, `Banner`, `MenuRow`, `Stepper`…)
     were kept on purpose, even where no screen renders them today.

   In minified JS that is −230 KB (4,505,061 → 4,274,737 B attributed). Measured like for like with the CI command: **Hermes bundle 7,571,639 → 7,210,515 B (−361,124 B,
   −4.8%)**, export total 7,932,794 → 7,571,670 B. The same build with source maps (the debug-info-free
   bytecode an EAS build or `eas update` ships) went 4,593,128 → 4,370,312 B (−222,816 B, −4.9%).

   > **Measurement note:** the CI number is about 2.8 MB larger than the bytecode that ships. A
   > plain `expo export` (no `--source-maps`) leaves Hermes debug info in the `.hbc`; builds that emit a
   > source map strip it out. The budget therefore measures a debug build, not what users download. It is
   > still a valid like-for-like trend line, so the CI method is unchanged here. Switching the guardrail to
   > `--source-maps` (without counting the `.map`) would track the real download, but it needs a
   > recalibrated budget and is a separate decision.

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
| Self-hosted Inter (subsetted, `assets/fonts/*.ttf`) | Font assets (no longer a runtime JS dep) | `assets/` (TTF) | Ship **only the weights actually used** (2026-08-01) **and only the glyph ranges actually rendered** (A-O13, 2026-08-03: 65-67% per-file cut). `@expo-google-fonts/inter` is a devDependency now — the subsetting script's source material, not something the app imports. Candidate for native font embedding on a future EAS build (`PERFORMANCE.md` backlog). |

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

## Budget history

Every raise to `apps/mobile/size-budget.json`, with what caused it. "Growth must be intentional"
only means something if the growth is also *traceable* — a budget number with no recorded cause is
indistinguishable from a number someone bumped to get CI green.

| Date | Export total | Hermes | Why |
|---|---:|---:|---|
| Initial calibration | 12,400,000 | 6,200,000 | Set from the first real `expo export` measurement |
| 2026-07-29 | 12,480,000 | 6,230,000 | Two causes, measured separately (PR #427). **~43 KB / ~9.7 KB: dependency drift** — the production-dependency group bump (#424) pushed the bundle to 12,442,878 / 6,209,749 and was auto-merged over this same red check, so `main` was already over budget before #427 branched. **~3.1 KB: Play-compliance UI** — the in-app account-deletion confirm + privacy-notice row required for the Play listing, plus two `lucide` glyphs (`shield`, `trash-2`) imported per-file in the usual way. |
| (untracked) | 12,690,000 | 6,455,000 | **Reconciliation note (found by the 2026-08-01 Day-0 LC sweep):** the live `size-budget.json` reached these values with NO history rows — raises landed between 2026-07-29 and 2026-08-01 without the traceability this table exists for. Causes unrecovered; recorded here so the gap is visible. Lane LC-A's A-T1 owns keeping this table honest going forward. |
| 2026-08-01 | 7,850,000 | 6,455,000 | **Ratchet DOWN (Harare LC program, Day-0):** per-weight Inter subpath imports removed ~4.5 MB of never-registered font TTFs from the export (barrel import bundled all 36 weights for the 3 used) — measured 7,476,013 B post-fix, budget set to measured+5%. Hermes budget left unchanged (bundle is at 6,431,313 B — 0.4% headroom; LC-A's A-T1 diets the JS before ratcheting it). |
| (untracked) | 7,850,000 | 6,700,000 | **Reconciliation note (2026-09-28):** the Hermes budget reached 6,700,000 with no history row. Cause unrecovered; recorded so the gap is visible. |
| 2026-09-28 | 7,850,000 | 7,000,000 | **Expo SDK 52 → 54 upgrade** (React Native 0.76 → 0.81, React 18 → 19; Play's API-36 requirement). Measured like for like with the CI command: Hermes 6,573,627 → 6,849,939 B (+276 KB, +4.2%); export total 6,925,263 → 7,211,094 B, still inside its budget. By source-map attribution the growth is framework code: react-native +166 KB, expo-router 4 → 6 +120 KB, @sentry/core +96 KB, expo +82 KB, react-native-screens +68 KB, partly offset by web-streams-polyfill −262 KB and leaner @tanstack/query-core / zod builds −182 KB. Nothing web-only was added (only two tiny @radix-ui helpers from expo-router). Budget set to keep main's previous ~2% headroom. |
| (untracked) | 7,936,000 | 7,575,000 | **Reconciliation note (2026-10-02):** between 2026-09-30 and 2026-10-02 the v2-handoff PRs (merchant mobile D-48, After Send D-53, Rider v2 D-54, Calm Mint v2 D-55, Browse v2 D-57/D-58, Order flow v2 D-59, Orders v2 D-63, splash D-64; #995 → #1044) raised both numbers step by step, each in its own PR description but with no row here. By the end, main measured 7,932,794 / 7,571,639 B: 3.2 KB and 3.4 KB of headroom. |
| 2026-10-02 | 7,632,000 | 7,271,000 | **Trim first, then reset (owner decision).** The bundle trim in "Levers applied" item 4 measured 7,571,670 / 7,210,515 B (−361,124 B Hermes, −4.8%) on `main` @ `81f0244`. Each budget is that measurement plus ~60 KB (60,330 / 60,485 B, about 0.8%) of headroom, so the features landing in parallel have room without a raise each. Workstreams that merge before this reset are measured inside its headroom. A PR that needs more still raises the number in the same PR, with a row here. |
| 2026-10-02 | 7,687,000 | 7,326,000 | **Re-measured with everything combined.** The owner-decisions branch with Notifications v1 (#1045) merged in, plus free first jobs, merchant-paid free delivery, Popular ranking and the Notifications follow-up, measures 7,627,004 / 7,265,849 B, which used up the trim's headroom. Each budget is that measurement plus ~60 KB of headroom. Net of the trim, the bundle is still about 350 KB below the 7,979,000 limit `main` had before this PR. |
| 2026-10-06 | 7,878,000 | 7,517,000 | **First Run v2 (D-80, #1086).** About 30 new or redrawn screens land at once: permission asks for both sides (PC1–PC11, P1–P16), the app update screens (U1–U5) and soft-update banners, Personal details (D1–D7), Bike & documents (E1–E6), the ID-check outcomes (F1–F8), the rider entry (G1–G3), the shared `firstrun` primitives and the app-wide bottom toast, all with no new dependency. Measured on the PR head merged with `main` (tab bar glass #1087) at 7,818,092 / 7,456,937 B, +191 KB over the 2026-10-02 measurement; the dev gallery was removed to keep it there. Each budget is that measurement plus ~60 KB of headroom. |

> The dependency-drift half of that raise is worth a second look on its own: 43 KB arrived without a
> deliberate decision, which is exactly what this guardrail exists to prevent. If the size job is not
> a required status check, a red budget can be auto-merged — see `docs/ROUTINES.md` on the
> merge-on-green policy.

### First shipped artifact (2026-08-04)

The budget above governs the **JS export**; this is the first measurement of what Play actually
received, which is a different (and much larger) number — it includes the native layer, and this
table has never had a real one before.

| Artifact | Size | Notes |
|---|---:|---|
| Release `.aab` (build `c248fbf5`, v0.17.9 / vc 2, live on internal track) | **32,546,001 B — 31.04 MiB** | Raw App Bundle, **pre-split**. Measured by downloading the EAS artifact directly. |
| Release `.aab` (build `ea538ebe`, v0.17.9 / vc 1, rejected — targetSdk 34) | 32,545,990 B — 31.04 MiB | 11 bytes smaller; the API-35 target is essentially free in size terms. |

Play's **per-device download is smaller than both** — an App Bundle is split by ABI, screen density
and language at install time, and the precise figure is in Play Console → App bundle explorer.
Record it there once the internal testers install; the raw `.aab` is the only number CI can see
(`mobile-release.yml` reports it to the run summary, best-effort). This is the pre-shrink baseline
to judge future native growth against — R8 + resource shrinking were both on for these builds
(`expo-build-properties` → `enableProguardInReleaseBuilds` / `enableShrinkResourcesInReleaseBuilds`).

⚠️ **These figures are not comparable to the next build.** Resource shrinking was turned off on
2026-08-04 (`MOB-BOOT-01` — it stripped the bundled fonts and the app could not start), so the next
`.aab` will be roughly 1 MiB larger for reasons that are a deliberate correctness trade, not
regression. Re-baseline from that build.

## Sources / further reading

- DoorDash — *Shrinking your mobile app: strategies for a leaner, faster app*:
  <https://careersatdoordash.com/blog/doordash-shrinking-your-mobile-app/>
- Companion in this repo: `docs/PERFORMANCE.md` (speed/latency/cost strategy — the OTA-size backlog
  items live there), `docs/LAUNCH-DEPLOYMENT-STRATEGY.md` (the AAB/OTA channels).
