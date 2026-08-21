# Cold-start crash RCA — internal-track builds #31 / #32 (2026-08-21)

**Ledger id:** `MOB-BOOT-04`. **Status:** narrowed by device observation (§1.1) — the native
`Application.onCreate` candidate is **refuted**, leaving a JS-evaluation / React-instance-creation
fatal. A hypothesis-agnostic fix has landed (§8.1); the specific throwing statement still needs a
stack trace. **Reported:** owner photograph, 2026-08-21
09:38 local (≈07:38 UTC) — the system dialog *"LyniaGo keeps stopping"* with *Open app again* /
*Close app*, on a Transsion-class Android handset. The app dies at cold start, repeatedly.

This is the **third** time a launch failure in this app has had to be diagnosed from a photograph
(`MOB-BOOT-01`, 2026-08-04; the v0.17.12 splash hang; now this). Section 6 is about why.

---

## 1. What is on the device

| Build | EAS build | Commit / version | Native surface | Verdict |
|---|---|---|---|---|
| **#30** | `6dc910c2-1e22-46ea-b5e1-dbfb6567d08c` | `866455b7` · v0.42.1 | pre-newArch, no Didit | **last known good** |
| **#31** | `6294977b-aa53-4bbd-a4d8-a2b839646765` | `a80e1456` · **v0.43.0** | newArch + Didit | **bad** |
| **#32** | `cd266ad0-f0c6-4f84-8710-c6bb828b549a` | `f89ce9a7` · v0.45.1 | **identical to #31** | **bad** |

All three built `profile=preview` and submitted `FINISHED` to the Play **internal** track.

Three facts that constrain everything below:

- **Build #31 shipped v0.43.0, not v0.44.0.** Verified at `a80e1456:apps/mobile/package.json`.
- **#32 shipped this morning at 07:11 UTC** and its submission was `FINISHED` by 07:34 UTC — four
  minutes before the photograph. The handset was most likely still on #31, but the distinction does
  not matter: `a80e1456..f89ce9a7` changes only the two version strings, and `pnpm-lock.yaml` is
  byte-identical. **#32 cannot fix #31.** There are two bad builds on the track.
- **No OTA has ever reached a device.** All four `mobile-ota.yml` runs concluded `failure`, latest
  2026-08-16. They failed at the *preflight guard* (`REL-02`), which correctly refused to publish an
  update no shipped binary could receive — the workflow is not broken, but its publish step has
  never executed.

### The regression range

`866455b7..a80e1456` is 16 commits. **Exactly two changes in it are native-affecting.** Between them
they touch three files — `apps/mobile/app.config.ts`, `apps/mobile/package.json` and `pnpm-lock.yaml`:

- `63acca8` (#835) — `newArchEnabled: true`. Fabric + TurboModules + **bridgeless**. Never built
  before #31. That commit touched only `app.config.ts` (+45 lines, 44 of them comment) and
  `docs/DESIGN-DEVIATIONS.md`.
- `a80e145` (#847) — `@didit-protocol/sdk-react-native@4.7.2`, its Expo config plugin, and
  `-keep class me.didit.**` R8 rules.

The dependency delta is **exactly one package**: `pnpm-lock.yaml` moved by 20 lines, all Didit. Zero
other native dependency was added, removed or bumped. `src/query/**`, `src/boot/**`, `src/auth/**`,
`src/telemetry/**`, `src/ui/fonts.ts`, `app/_layout.tsx`, `app/index.tsx`, `src/logic/boot-route.ts`,
`metro.config.js`, `babel.config.js`, `plugins/**`, `eas.json` and all of `packages/shared/**` are
**unchanged** across the whole range.

**The persisted on-device state contract is unchanged and cannot throw.** `Session`, `rolePreference`
and `onboardingSeen` all read through `try/catch → null` paths, and the react-query persister's
`persistBuster` is the app version, so a v0.42.1 cache is discarded rather than hydrated. There is no
mechanism by which upgrading over #30 crashes where a fresh install would not. **This is a
fresh-install crash, not an upgrade-only one.**

---

## 1.1 Device evidence (owner, 2026-08-21)

> *"I see the green splash screen but it crashes after that."*

This is decisive, and it is worth being precise about what it does and does not settle.

**Refuted: the native `MainApplication.onCreate` candidate.** The green splash is painted by the
Activity's splash theme, which cannot appear unless `Application.onCreate` has already completed. So
`SoLoader.init`, `DefaultNewArchitectureEntryPoint.load()` and `libappmodules.so` all succeeded. The
New Architecture's native entry point is **not** where this dies.

**What remains,** in order of the startup sequence, both of which occur after the splash is up:

1. **React instance creation** — `TurboModuleManager` building the module registry, which calls
   `getReactModuleInfoProvider()` on every package including Didit's.
2. **JS bundle evaluation** — the root layout's module graph (§2), which is where candidate #1 lives.

`(1)` was refuted independently on R8 grounds (§4), which leaves **candidate #1 as the leading
explanation**. Note the splash would be *held* through JS evaluation by
`preventAutoHideAsync()`, and expo-router's global `ErrorUtils` handler hides it before delegating on
a fatal — so "splash, brief flash, dialog" is exactly the shape candidate #1 predicts.

**Still not settled by this observation:** which statement throws. Candidate #1 names Sentry's
`hasViewManagerConfig` probes as the most likely, but any synchronous throw in that module graph
produces an identical symptom. That is precisely why the fix in §8.1 is written to be
hypothesis-agnostic rather than to target Sentry alone.

## 2. The structural defect that makes all of this fatal

This is the finding that matters most, because it is the difference between *a broken feature* and
*a dead app*, and it is ours, not a vendor's.

**The root layout's entire module graph executes inside a React render with no error boundary above
it.** Verified in the installed `expo-router@4.0.22`:

- `ExpoRoot` → `ContextNavigator` → `store.initialize()` → `getRoutes(ctx)`, which **eagerly**
  calls `loadRoute()` for every `_layout.tsx` (`getRoutesCore.js:412`, `:461`).
- `app/_layout.tsx` therefore evaluates — with all 121 local modules and every third-party package it
  imports — during `ContextNavigator`'s render.
- The app's only React error boundary is the `Try` that `useScreens.js:66-77` builds **from** the
  loaded root layout. It cannot catch the load that produces it.
- `Sentry.wrap` adds no boundary (`sdk.js:125-136` is `TouchEventBoundary` + `Profiler` only), and
  Expo's `registerRootComponent` adds none in production.

So a synchronous throw anywhere in that graph is a process kill: uncaught JS →
`ReleaseDevSupportManager.handleException` → `DefaultJSExceptionHandler` rethrows as a
`RuntimeException` on the native thread → **"LyniaGo keeps stopping."**

Module-scope statements currently sitting in that unguarded zone include `initSentry()`
(`_layout.tsx:32`), `SplashScreen.setOptions({fade:false})` (`:41`, the only completely uncaught call
in the block), `prewarmFonts()`, `prewarmBootReads()`, and two literal `throw`s in `src/config.ts:12`
and `:18`.

---

## 3. Ranked candidate root causes

### #1 — PRIMARY (leading, after §1.1). Sentry's module-scope `UIManager` probes stopped being fail-safe the moment the New Architecture shipped

**Universal — every user, every launch, both roles. Fully source-verified except for the final
native step.**

`app/_layout.tsx:24` imports `@sentry/react-native` at module scope — deliberately, so crash handlers
arm before app code. Its index re-exports `./tracing` and `./replay/CustomMask`, which contain
**three unguarded module-scope `UIManager.hasViewManagerConfig()` calls**:

- `dist/js/tracing/timetodisplaynative.js:6` — `export const nativeComponentExists = ...`
- `dist/js/replay/CustomMask.js:26` and `:36` — two module-scope IIFEs

The semantics of that call changed with `newArchEnabled: true`:

| | build #30 (Paper) | build #31 (bridgeless) |
|---|---|---|
| resolver | `PaperUIManager.js` → `getViewManagerConfig` | `BridgelessUIManager.js:292-294` → `unstable_hasComponent` |
| on failure | **`try { … } catch (e) { console.error(…); config = null }`** (`PaperUIManager.js:41-52`) → degrades to `false` | **no `try/catch` anywhere.** `NativeComponentRegistryUnstable.js:26` throws outright; a Java exception from the native lookup propagates into JS |

On #30 this code **could not** crash the app — the error was swallowed and logged. On #31 the same
three lines run unguarded, at module scope, in the one place in the app with no error boundary above
it. Any native ViewManager/package defect introduced by this build becomes an uncaught JS fatal at
cold start instead of a `console.error`.

*Confirmed:* the call sites, that they are module-scope and unguarded, that they are on the eager
path, that Paper had a catch and bridgeless does not, and that this changed exactly with the flag.
*Not confirmed without a device:* that the underlying native lookup actually throws on that handset.

### #2 — REFUTED by device observation (§1.1). The New Architecture native entry point failing in `MainApplication.onCreate`

**Refuted:** the green splash cannot paint if this path fails. Retained here with its reasoning
because it was the leading alternative and the elimination is the useful part. **Universal. Pre-JS.** `MainApplication.kt` calls `SoLoader.init(...)` then, under
`IS_NEW_ARCHITECTURE_ENABLED`, `DefaultNewArchitectureEntryPoint.load()` — which in RN 0.76.9
defaults to `turboModules=true, fabric=true, bridgeless=true` and ends at
`SoLoader.loadLibrary("appmodules")`. **Before build #31 this path had never run on a device, and it
was never device-validated afterwards** — a FINISHED build records no launch. It has since run, and
§1.1 shows it succeeded. A failure here
kills the process inside `Application.onCreate`, before any Activity, before any JS, before
`initSentry()` — which is exactly why Sentry has nothing.

*Signature that would have confirmed it, and was NOT observed:* no splash at all, plus
`UnsatisfiedLinkError: dlopen failed: library "libappmodules.so" not found`, or an
`IllegalStateException` from `isConfigurationValid`, or a `SIGABRT` tombstone — with a frame in
`MainApplication.onCreate` and **no JS frame anywhere in the trace**.

### #3 — REAL P1, but NOT this crash. The Didit import throws on the rider board

`app/rider/(tabs)/index.tsx:20` → `src/kyc/verify.ts:18` → `TurboModuleRegistry.getEnforcing('SdkReactNative')`
at module scope. Under the New Architecture `getEnforcing` does not merely look up — it **constructs**
the Java module and `TurboModuleManager.java:302` synchronously calls `nativeModule.initialize()`,
which is `SdkReactNativeModule.kt:33-38` → `DiditSdk.initialize(context)` → a Retrofit
`create()` over an obfuscated interface. First execution of that native SDK on any device, ever.

**But it is caught.** Route modules load through `getComponent={() => getQualifiedRouteComponent(route)}`
(`useScreens.js:201`) — a **thunk** React Navigation invokes only when it renders that screen, inside
`SceneView`, inside the root `Try`. So this produces the *"Something went wrong / Reload"* screen, not
a process death — and "Reload" loops forever, because Metro caches factory errors permanently
(`require.js:296-302`).

`src/kyc/verify.ts` documents *"Never throws: … an unlinked native module … resolves to `failed`"*.
That contract is false: the `try/catch` wraps the **call**, never the **import**. The repo's own Jest
mock states the failure in plain English — *"importing it under jest-expo throws before any test body
runs"* — and it was mocked rather than fixed. **The mock is the confession.**

> An earlier reading of this claimed the import was universal, on the grounds that `app/rider/become.tsx`
> hoists to the root Stack (there is no `app/rider/_layout.tsx`) and that import mode is `sync`. The
> hoisting and the sync mode are both true; the conclusion is not. `sync` means "not `React.lazy`", not
> "eager at mount" — `getComponent` is still a thunk. Recorded here so it is not re-derived.

### #4 — CONFIRMED, harmless at boot. Didit's reflection runs for every user

`new SdkReactNativePackage()` is in the generated PackageList regardless of route, and
`ReactPackageTurboModuleManagerDelegate` calls `getReactModuleInfoProvider().getReactModuleInfos()`
during instance creation. So `SdkReactNativePackage.kt`'s reflective probe of RN's `ReactModuleInfo`
constructor arity executes on **every** cold start, for every customer who will never touch KYC. It
resolves correctly — see §4. It does not construct the module, which is why #3 stays rider-only.

---

## 4. Refuted hypotheses — recorded so nobody spends a build on them

- **BouncyCastle vs expo-updates.** The Didit plugin does exclude the `jdk15to18` family app-wide,
  and expo-updates does declare `bcutil-jdk15to18:1.78.1`. But expo-updates uses exactly two classes
  (`ASN1Primitive`, `DEROctetString`), both supplied by Didit's replacement `bcprov-jdk18on:1.80`;
  and independently, `UpdatesConfiguration.kt:118-120` makes `CertificateChain` reachable only when a
  `CODE_SIGNING_CERTIFICATE` manifest entry exists, which this app does not emit. **Never
  class-loaded.** *(Residual, ledger-worthy: `bcutil-jdk18on` is not supplied, so NFC passport
  reading in the `all` variant would `NoClassDefFoundError` — masked by Didit's own `-dontwarn`.
  Irrelevant to Zimbabwean IDs; real if NFC is ever exercised.)*
- **R8 stripping `ReactModuleInfo`'s constructors.** RN 0.76.9 has both a 6-param primary and a
  7-param deprecated constructor, so Didit's arity probe lands correctly either way. More decisively:
  `android/app/build.gradle` uses `getDefaultProguardFile("proguard-android.txt")`, which in AGP
  8.6.0 still emits **`-dontoptimize`** — so R8 runs shrink + obfuscate only, and every mechanism that
  could change a constructor's arity is off. The 6-param constructor is provably reachable from live
  RN call sites. *(Standing risk: this holds only while the non-optimizing default file is used.)*
- **Kotlin 2.0.21 / Compose skew.** The `2.0.21` in Didit's `android/build.gradle` is only the
  wrapper module's default KGP version, and `getExtOrDefault` correctly lets the app's `1.9.25` win.
  The shipped AAR is **class file major 55, `kotlin.Metadata(mv=[1,9,0])`**, pinning
  `kotlin-stdlib:1.9.22` and Compose BOM 2024.02.00. No metadata incompatibility — and one would have
  been a compile failure, not a runtime one.
- **minSdk / targetSdk / ABI / 16 KB pages.** Merged `minSdk=24`; every Didit AAR declares 23
  (lower merges silently). Merged compile/target 35. **No Didit AAR ships `jni/` at all**; the only
  new native code is MediaPipe, `System.loadLibrary`'d at detection time, not process start.
- **`react-native-maps` Fabric interop.** Real and still unverified, but maps are not on the boot
  path — this is a first-*render* risk on `/send`, not a cold-start one. It will bite the moment
  #1/#2 are fixed.
- **A bad OTA bundle.** No OTA has ever published (§1).

---

## 5. Why 1,486 green tests and a green EAS build saw none of it

- **Both failing modules are `moduleNameMapper`'d out of existence.** `jest.config.js` maps
  `@sentry/react-native` and `@didit-protocol/sdk-react-native` to hand-written mocks, so
  `timetodisplaynative.js`, `CustomMask.js` and the real TurboModule entry never execute.
- **`UIManager` does not exist in Jest.** RN's `jest/setup.js` replaces it wholesale and stubs
  `hasViewManagerConfig`. `global.RN$Bridgeless` is never set. **`newArchEnabled: true` has zero
  JS-observable effect under jest-expo** — `BridgelessUIManager` is unreachable from any test here.
- **The rider board is never really loaded.** Its one test `jest.mock`s `src/kyc/verify`, and the
  parity guardrail lists `RJM.board` in `rendered-conformance.pending.json`, so `renderWired` never
  requires it.
- **The one test touching the root layout mocks away the entire boot** — `expo-splash-screen`,
  `src/boot/prewarm`, `src/ui/fonts` and `src/telemetry/sentry`, i.e. every module-scope statement
  in §2.
- **CI never compiles Android, links a native module, runs R8, or starts a process.** `app.config.ts`
  says so in terms: *"NOT PROVEN BY CI, AND CI CANNOT PROVE IT."* CI was green and CI was honest.

---

## 6. Why it reached a handset

**The gate existed, was explicit, and was rewritten to fit the build that had already shipped.**

`docs/plans/2026-08-20-kyc-in-app-plan.md` required, twice and in strong language, that the New
Architecture be proven on a device **before a line of KYC code**. When the code landed (`a80e145`)
the binding condition was *device-green before submission to any track*. Build #31's submission to
`internal` violated it. The very next commit — `5b63e78`, a docs-only commit whose only purpose was
to record that build — rewrote the sentence so the violation reads as designed:
*"deliberately pre-smoke on internal, and that is the lane working as intended, not an exception to
it."* No new information arrived between the two commits; only the build did.

The plan had, three paragraphs earlier, correctly named this exact anti-pattern — *"Stating an
unmeetable condition is worse than stating none"* — and then did it.

**The circularity argument used to justify the rewrite is false.** `.github/workflows/android-test-apk.yml`
builds a signed, sideloadable **`assembleRelease`** APK on a GitHub runner — R8 on, New Architecture
on, Didit linked, the same native surface as #31 — and it is `workflow_dispatch`, runnable from a
phone. A ten-minute dispatch would have caught this before an EAS slot and a Play submission were
spent. It was never run.

**The checklist that survived as "the only remaining runtime gate" could not have caught it either.**
`docs/QA-DEVICE-CHECKLIST.md` was last modified before both native PRs. It still instructs the tester
to verify *"in-app browser opens the Didit flow"* — the behaviour #847 deleted — so a correctly
working Route A build **fails** that item. It contains **no New Architecture items at all**. It does
carry a cold-start check — LR17's *"Cold start completes in a reasonable time; no white-screen hang"*
(`docs/QA-DEVICE-CHECKLIST.md:58`) — but it sits under the heading *"real-network pass (low-end
Android, throttled)"*, so it reads as a performance item conditional on a throttled low-end device
rather than the unconditional "does the app open at all" gate every release needs.

**And nothing knew the first build had never been opened**, so sixteen hours later #32 shipped the
identical native surface to the same track.

### Observability

**Sentry would not have caught this.** `@sentry/react-native`'s Android manifest hard-sets
`io.sentry.auto-init` to `false`, so native crash handlers arm only when JS reaches `Sentry.init()` —
called from `app/_layout.tsx` module scope. Everything before the JS bundle evaluates is
uninstrumented. The repo added a build-time guard that *"refuses to build a blind release"* without a
DSN, and then shipped a release that is blind for precisely the failure class that matters most.

**Silence in Sentry is therefore itself a finding** — it localises the crash to before JS init.

---

## 7. Diagnostics — do these before building anything

1. **Play Console → Quality → Android vitals → Crashes and ANRs**, filtered to build #31's
   versionCode (then #32's). AGP embeds R8's `mapping.txt` in the AAB
   (`BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`), so Play should deobfuscate
   automatically. This is the only place a real stack trace exists today. *(Caveat: vitals lag by
   hours and suppress clusters below a device-count privacy threshold — with one or two testers it
   may not surface.)*
2. **`adb logcat -b crash -v threadtime` on the handset while cold-launching.** Instant, no lag, no
   threshold. Beats everything else if a cable is available.
3. **Sentry `lyniago/lynia-mobile`, environment `preview`** — check only *whether any event exists*
   for `0.43.0` / `0.45.1`.
4. **One glance, no tooling — the cheapest discriminator there is:**

   > *When it fails, do you see the green Lynia splash for a moment first, or does it go straight
   > from the launcher to the dialog?*

   **No splash** strongly suggests #2 (native, `MainApplication.onCreate`).
   **Splash, then death** strongly suggests a fatal after the Activity starts — #1, or any other
   statement in the same module graph (`src/config.ts`'s throws, `SplashScreen.setOptions`,
   `prewarmFonts`, `prewarmBootReads`), which produce an identical symptom.
   Treat it as a heuristic that halves the list, never as a classifier: **only the stack trace names
   the throwing statement.**
   This halves the suspect list before a single build is spent.

---

## 8. Recovery

### 8.1 What has landed (JS-only, OTA-deliverable)

Two changes, both correct regardless of which candidate turns out to be right, and both deliberately
**hypothesis-agnostic** — they fix the *fatality* (§2), not one guess at the *fault*:

- **`src/telemetry/sentry.ts`** — the SDK is no longer a top-level import. It is `require`d lazily
  inside a guard (the pattern `analytics.tsx` already uses for PostHog), and `init` and `wrap` are
  guarded too. A build with no DSN now never evaluates the SDK at all; a build with one that cannot
  load or arm it degrades to no crash reporting, which is what this module already promised callers,
  instead of taking the app down. Crash-handler timing is unchanged — `initSentry()` is still the
  first statement in the root layout.
- **`app/_layout.tsx`** — every module-scope boot call (`initSentry`, `preventAutoHideAsync`,
  `setOptions`, `prewarmFonts`, `prewarmBootReads`) now runs through a `bootStep` guard that reports
  via `captureException` and continues. None of them is a correctness precondition: fonts fall back to
  the system face, prewarm's consumers call it again from their own effects, and the splash hides on
  first paint regardless. **A degraded boot beats no boot.**

Tests: 9 new (4 pinning that the Sentry seam stays inert rather than throwing when the SDK explodes on
import, when `init` throws, and that it is not loaded at all without a DSN; 5 making each boot step
hostile in turn and asserting the root layout still *evaluates* — asserted on `require`, not on
render, because the failure being pinned is module evaluation). Verified by mutation: removing a
single `bootStep` guard fails exactly the two tests that cover it. Full mobile suite 1,504 green,
typecheck and lint clean.

**Fingerprint unchanged** — the diff touches only `.ts`/`.tsx` under `app/` and `src/`; no
`app.config.ts`, `package.json`, `pnpm-lock.yaml`, `plugins/**`, `eas.json` or `fingerprint.config.js`.
So this is publishable to the `preview` channel and will match builds #31 and #32.

**What this does NOT do:** it does not fix the underlying native fault. If the throwing statement is
the Sentry probe, the app boots and loses crash reporting. If it is something else in the same graph,
the app boots and loses that step. If the fault is in React instance creation rather than JS
evaluation, this changes nothing and the rollback in §8.2 is the answer. It buys a working app and a
diagnosable one; it is not a substitute for the stack trace in §7.

### 8.2 The rollback path


**A native fix cannot be OTA'd** (`runtimeVersion: { policy: "fingerprint" }`). But note a correction
to the usual assumption: `apps/mobile/fingerprint.config.js` sets `sourceSkips: ["ExpoConfigVersions"]`,
so version bumps do **not** rotate the runtimeVersion. Builds #31 and #32 differ only in version
strings, so **they share a runtimeVersion and a JS-only fix published to the `preview` channel would
match both**. That makes a JS-only hotfix worth attempting in parallel — never as the plan.

**Rolling back is rolling forward.** Play refuses a track release with a versionCode at or below one
already released, so #30's AAB **cannot be re-promoted**; the internal track has no staged rollout to
halt and no downgrade mechanism. Tell the testers out of band to uninstall — that is the only action
that touches devices — and consider setting the repo variable `EAS_RELEASE_ENABLED=false` so a
mistaken dispatch cannot become a third bad build.

**Recommended sequence:**

1. **Revert both native changes together** — `newArchEnabled: false` **and** remove the Didit
   dependency, plugin registration and keep rules. Do **not** revert the flag alone: the Didit SDK
   *requires* the New Architecture, so flag-off-with-SDK-present crashes for a reason that teaches
   nothing.
2. **Carry §8.1's fixes into that build** — they are already on the branch and are correct regardless
   of which candidate wins. Note what §8.1 does **not** yet cover, and why the Sentry change had to go
   further than "make `initSentry()` lazy": deferring only the init call would have left
   `sentry.ts`'s top-level `import` and its `export const wrap = Sentry.wrap` evaluating at module
   load, and **no `try/catch` in `_layout.tsx` can catch a static import failure in its own dependency
   graph** — which is why the import itself was removed. Still open, same class, not yet done:
   `src/kyc/verify.ts` should `require()` inside its existing `try` (restoring its own documented
   contract, §3 #3), and `src/config.ts`'s two module-scope `throw`s should become a check at first
   fetch.
3. **Sideload before Play.** Dispatch **Android Test APK**, install the artifact, confirm it cold
   starts. ~15 minutes, no EAS quota. *This is the step that was skipped for #31 and #32.*
4. **Dispatch `mobile-release.yml` with `profile: preview` explicitly** — the workflow default is
   `production`, which builds fine and then fails at submission on service-account permissions,
   burning one of a limited monthly allowance.
5. **Verify both halves.** `--no-wait` means a green job proves only that the build was *queued*.
   Read the `eas-build-status.yml` Recap for build `FINISHED` **and** submission `FINISHED track=internal`.
6. **Then re-land the two native changes one at a time**, each with a device smoke behind it — the
   sequencing the plan asked for in the first place.

---

## 9. Guardrails

The repo already enforces pixel parity by machine because human sign-off kept being asserted rather
than performed. This lane has no such guardrail. In priority order:

1. **Emulator cold-start smoke on the release APK** (CI-blocking, path-gated to
   `app.config.ts` / `package.json` / `pnpm-lock.yaml` / `plugins/**` / `fingerprint.config.js`).
   Assemble release, boot an emulator, launch, assert the process is alive after N seconds and
   logcat has no `FATAL EXCEPTION`. **It is the only proposal here that exercises both
   candidate paths in CI** — but it is not a guarantee: an x86_64 emulator cannot prove behaviour on a
   specific handset, and candidate #1 may depend on a device-specific bridgeless lookup. Guardrail 3
   is a ledger gate: it installs nothing and reads no logcat, so it is process coverage, not runtime
   coverage. Costs ~20-35 min of runner time on the ~5% of PRs that touch
   those paths. Must be *required*, never `continue-on-error`.
2. **Boot-path import lint** (near-zero cost). Forbid any module reachable from the eager boot graph
   — `app/_layout.tsx` and every `app/**/_layout.tsx` — from statically importing a package on a
   native-only denylist, and **derive that denylist from the `moduleNameMapper` entries that point at
   `__mocks__/`**. Every module the suite has to fake because the real one explodes on import is, by
   definition, a module that must not sit on the boot path. Self-extending.

   Caveat on that derivation: a `__mocks__/` entry is a *proxy* for import-time hostility, not proof of
   it — a module can be mocked for speed or determinism instead. Treat the mock list as the seed for
   the denylist and confirm each entry against actual import-time behaviour, so the lint blocks
   modules that genuinely throw rather than everything anyone found convenient to fake.
3. **Device-smoke ledger gate.** A `docs/DEVICE-SMOKE-LEDGER.md` row per shipped build, and a
   `mobile-release.yml` preflight that refuses to dispatch while the previous build on the channel is
   still `PENDING`. **#32 would have been blocked.** It turns a gate that prose can rewrite into a
   file CI reads.
4. **Sentry native auto-init** via a `withAndroidManifest` plugin (`io.sentry.auto-init=true` with
   `tools:replace`), plus `autoInitializeNativeSdk: false` in JS. Cannot prevent a crash; prevents
   the *next* one being diagnosed from a photograph. Native change — reaches the next build only.

---

## 10. Open items for the ledger

- `MOB-BOOT-04` — this incident. OPEN until a device trace confirms #1 or #2.
- The `src/kyc/verify.ts` import-time throw (§3 #3) — real P1, independent of the crash.
- Missing `bcutil-jdk18on` breaks Didit NFC in the `all` variant (§4).
- `docs/QA-DEVICE-CHECKLIST.md` still describes the deleted browser hand-off, has no New
  Architecture items, and files its only cold-start check (LR17) under a conditional low-end/throttled
  section instead of as an unconditional release gate.
- `react-native-maps` Fabric interop remains unverified on-device.
