# Firebase Crashlytics — the second crash reporter

**Status:** code wired, **founder finishes with one console click**. Inert in every build that has no
`google-services.json` — which today is dev, jest, and the QA APK lane.

Crashlytics sits **alongside** Sentry, it does not replace it. Sentry stays the primary reporter and
the triage surface. This document is about the narrow, real gap Sentry cannot cover, why a second SDK
was judged worth its weight for exactly that gap, and what has to be true on a device before either
claim is believed.

---

## 1. Why a second crash reporter at all

`docs/APP-SIZE.md` states the rule this change bends: *one SDK per use case … never add a second
analytics/telemetry SDK alongside it.* That rule is right, and it is bent here on purpose, for one
reason:

> **Sentry arms from JavaScript. A crash that happens before its `init()` completes is invisible to
> it, by construction.**

That is not a theoretical gap. It is the last shipped outage:

- `docs/COLD-START-CRASH-RCA-2026-08-21.md` (**MOB-BOOT-04**) — build #31 died at `app/_layout.tsx`
  module scope because `@sentry/react-native`'s own import threw under the New Architecture. The
  crash reporter *was* the crash. Nothing was reported. The failure had to be diagnosed from a
  photograph of a tester's phone.

Crashlytics has no such dependency. The Firebase Android SDK arms from a `ContentProvider` during
**Application startup** — before React Native loads, before the Hermes bundle is evaluated, before
any file in `src/` exists. A process kill at JS module scope, a throw in `Application.onCreate`, an
R8-stripped class that explodes on first touch: all of it reaches the Crashlytics console with a full
native stack whether or not a single line of JS ever ran.

So the division of labour is:

| | Sentry | Crashlytics |
|---|---|---|
| Armed by | `initSentry()` in JS | native `ContentProvider`, pre-JS |
| Sees a crash *before* JS starts | ❌ | ✅ |
| Sees a crash *in the reporter's own import* | ❌ | ✅ |
| JS stacks, breadcrumbs, rich context | ✅ (primary) | basic (`logCrumb` / `setCrashKeys`) |
| Where triage happens | ✅ primary | second opinion / boot failures |

**If you are deciding whether to keep both:** the honest test is whether MOB-BOOT-04-class boot
crashes still feel like a live risk. If they stop being one, this is the SDK to drop — not Sentry.

---

## 2. What is wired, and where

| File | Role |
|---|---|
| `apps/mobile/src/telemetry/crashlytics.ts` | The JS seam. Deferred require, never throws, inert without provisioning. |
| `apps/mobile/app/_layout.tsx` | `bootStep(initCrashlytics)` at module load; `bootStep`'s catch now reports to **both** reporters. |
| `apps/mobile/app.config.ts` | The two config plugins, attached **only** when a `google-services.json` is present. |
| `apps/mobile/firebase.json` | RNFirebase build-time flags (see §4). |
| `apps/mobile/src/ui/index.tsx` | The QA forced-crash gate now covers both reporters (see §6). |
| `apps/mobile/__mocks__/@react-native-firebase/*` | Jest mocks; the real SDKs need a native host. |
| `tools/parity/mobile/shims/firebase-*.js` | Screenshot-lane shims — the lane renders as an unprovisioned build. |

Packages: `@react-native-firebase/app` + `@react-native-firebase/crashlytics`, both pinned to
**21.14.0** — the last 21.x, which is the line that pairs with Expo SDK 52 / RN 0.76. Do not bump to
22.x without also moving the Expo SDK.

### The seam's contract

Identical in shape to `src/telemetry/sentry.ts`, and for the same reasons:

- **Deferred require.** Neither Firebase package joins the startup graph until `initCrashlytics()`
  asks for it. A build with no Firebase app never evaluates the SDK at all.
- **Never throws.** It is armed from `app/_layout.tsx` module scope, where expo-router has not yet
  built the error boundary that would catch anything — a throw there is a *process kill*, not an
  error screen. It would be a poor joke for the module added to observe MOB-BOOT-04 to reproduce it.
- **Inert without provisioning.** `getApps()` returning empty *is* the gate. Every export becomes a
  no-op; nothing logs, nothing throws.

⚠️ **`isCrashlyticsEnabled() === false` does NOT mean crash capture is off.** It means the *JS
addenda* are no-ops. The native handler armed before JS started and stays armed. This trips people up.

---

## 3. Provisioning — what the founder actually has to do

**There is no new credential.** Crashlytics rides the *same* `google-services.json` that already
provisions FCM push (`app.config.ts` → `googleServicesFile`, supplied as the `GOOGLE_SERVICES_JSON`
EAS **file** secret, or dropped at `apps/mobile/google-services.json` for a local dev build; the file
is gitignored).

1. Firebase console → the `zw.co.lynia` Android app → **Release & Monitor → Crashlytics** → *Enable*.
2. Build the **`preview`** profile (never `production` — see `CLAUDE.md`, the SA holds testing-track
   permissions only).
3. Install it and fire the forced-crash gate (§6). The first report completes console setup.

That is the whole activation path. Until step 1 is done the SDK still collects; the console simply
has nothing to show you.

### Turning it off again

`EXPO_PUBLIC_CRASHLYTICS_DISABLED=1` at build time disables collection.

This is an `EXPO_PUBLIC_*` JS-bundle value on purpose, **not** a native manifest flag: an
`EXPO_PUBLIC_*` string is a Metro build-time substitution that touches no native config, so it is
**OTA-shippable** to already-installed binaries through `mobile-ota.yml`. If Crashlytics ever has to
be killed in the field — a reporting loop, a privacy hold — that can reach phones the same day. A
manifest flag would need a store build (REL-01/REL-02 in `docs/KNOWN_BUGS.md`).

`initCrashlytics()` writes the resulting value through to native in **both** directions, because the
native side persists the last value into preferences that outlive the process — a build that once
shipped disabled would otherwise stay disabled after the switch was lifted.

---

## 4. `apps/mobile/firebase.json`

RNFirebase reads this at **build** time (its Gradle script walks up from `android/` and finds it at
`apps/mobile/firebase.json`). JSON carries no comments, so the reasoning lives here.

```json
{
  "react-native": {
    "crashlytics_auto_collection_enabled": true,
    "crashlytics_javascript_exception_handler_chaining_enabled": true,
    "crashlytics_is_error_generation_on_js_crash_enabled": true
  }
}
```

- **`auto_collection_enabled`** — leave `true`. This is what arms the native handler pre-JS, i.e. the
  entire reason this SDK is here. The runtime kill switch above is the way to turn it off.
- **`javascript_exception_handler_chaining_enabled`** — **load-bearing for coexistence.** Crashlytics
  installs a global JS exception handler; with chaining on it calls through to the handler that was
  already installed, so **Sentry still sees unhandled JS errors**. Turning this off would silently
  blind Sentry to the crashes it is the primary reporter for.
- **`is_error_generation_on_js_crash_enabled`** — produces a readable JS stack rather than an opaque
  native frame for a JS-originated crash.

All three default to `true`; they are written explicitly because a silent default that a future
RNFirebase bump could flip is not something to leave implicit under two coexisting reporters.

**Two flags are deliberately absent.** `crashlytics_ndk_enabled` and `crashlytics_debug_enabled`
exist as constants in RNFirebase 21.14.0 (`Constants.java`) but are **not read** by
`ReactNativeFirebaseCrashlyticsInitProvider` — verified in the installed source. Writing them would
be cargo cult: config that looks like it does something and does nothing.

Precedence, also from that source, worth knowing when a value seems stuck:
**native SharedPreferences** (what `setCrashlyticsCollectionEnabled` writes) **> `firebase.json` >
AndroidManifest meta-data.**

> ⚠️ **`firebase.json` is a native build input that is NOT a fingerprint source.** The expo-updates
> `fingerprint` runtimeVersion hashes autolinked modules, config plugins, `expo-build-properties`,
> patches and native dirs (`apps/mobile/fingerprint.config.js`) — adding the Firebase packages and
> plugins rotated it correctly. But editing *only* this file changes what the next binary is built
> with **without** rotating the runtimeVersion, so two binaries with different Crashlytics build
> flags can share one. It does not break the OTA safety property (JS cannot land on an incompatible
> native layer), but it does mean "which flags is that install running?" is not answerable from the
> runtimeVersion alone. Prefer the runtime kill switch in §3 for anything you may need to change.

---

## 5. Known interaction: two native crash handlers ⚠️

`firebase-crashlytics-ndk` is an unconditional dependency of the RNFirebase crashlytics module, and
`@sentry/react-native` ships its own NDK layer enabled by default. **Both install native signal
handlers on the same process.** Both are written to chain to the previously installed handler, and
running both is common practice — but handler chaining is *runtime* behaviour that no static check
and no CI job in this repo can exercise.

**This is the one thing device QA must actually confirm** (§6): that a single forced native crash
shows up in **both** consoles. If it lands in only one, that is the interaction failing, and the
resolution is to drop one reporter's NDK layer — not to assume it is fine because the build was green.

The JS side has no such ambiguity: handler chaining is explicit and configured (§4).

---

## 6. Verification — the LR20 forced-crash gate

Device-gated. Nothing here is provable off-device, and a green CI run says nothing about it.

Long-press the gold **TEST BUILD** banner → *Crash telemetry test*. The dialog now names both
reporters' armed state (`Sentry: ACTIVE · Crashlytics: INERT`, etc.) because "armed" is no longer one
state — a build can genuinely have one and not the other.

The gate kept **two** buttons rather than growing to four, deliberately: RN's Android `Alert` slices
`buttons` to three and **silently drops the rest** (`react-native/Libraries/Alert/Alert.js`), so a
fourth option would render as a QA gate that looks present and tests nothing. Instead:

- **JS error** → reports to Sentry **and** records a Crashlytics non-fatal. Verifies both JS
  pipelines and Sentry's source-map upload.
- **Native crash** → kills the process once. Both reporters' native handlers are armed against the
  same signal, so it should surface in **both** consoles — and that it does is exactly the §5 check.
  (It fires Sentry's `nativeCrash()` first, falling back to Crashlytics' `crash()` for the build
  shape that has a `google-services.json` but no Sentry DSN. Both refuse and return `false` when
  inert, rather than faking a crash that would report nothing.)

Checklist:

- [ ] Both consoles marked ACTIVE in the dialog on a `preview` build.
- [ ] **JS error** → visible in Sentry (named frames, not Hermes bytecode) **and** as a Crashlytics
      non-fatal.
- [ ] **Native crash** → visible in **both** consoles with real `zw.co.lynia.*` frames, not
      `a.b.c(SourceFile:1)`. Deobfuscation is the R8 `mapping.txt` upload — Sentry's comes from
      `experimental_android.enableAndroidGradlePlugin`, Crashlytics' from its own Gradle plugin.
- [ ] Confirm no boot regression: the app still launches on a cold start on a low-end handset.

---

## 7. Cost

Measured with `expo export --platform android`, before vs after, on this branch:

| | Before | After | Δ |
|---|---|---|---|
| Hermes JS bundle | 6,206,687 B | 6,348,686 B | **+141,999 B (+2.29%)** |
| Android export total | 6,558,323 B | 6,700,322 B | **+141,999 B (+2.17%)** |

**Within budget — `apps/mobile/size-budget.json` was NOT raised.** But Hermes headroom falls from
3.8% to **1.6%** (≈104 KiB), so the next JS-heavy PR is likely to be the one that has to raise it.
Flagged rather than pre-emptively bumped: growth must be *intentional*, and the budget is not yet
exceeded.

Cold start is essentially unaffected on the JS side — the deferred require means the code is
*bundled* but not *evaluated* at startup. The native side adds a Firebase `ContentProvider` to
Application startup; that is the price of arming before JS, and it is the feature, not a side effect.

Binary size grows too (Firebase Android SDK, BoM 33.12.0 + `firebase-crashlytics-ndk`) — not measured
here, because it needs a real AAB. Worth checking against `docs/APP-SIZE.md` on the next store build.

---

## 8. Build wiring, and the iOS trap

The plugins are attached **only** when a `google-services.json` is present:

```ts
...(googleServicesFile ? ["@react-native-firebase/app", "@react-native-firebase/crashlytics"] : []),
```

This is not stylistic. The app plugin's Android mod **throws** without `android.googleServicesFile`
("Path to google-services.json is not defined") — attaching it unconditionally would break prebuild
for every unprovisioned build, local dev and the QA APK lane included.

Verified against a real prebuild (`expo prebuild -p android`) with a stub credentials file:

- `android/build.gradle` → `com.google.firebase:firebase-crashlytics-gradle:3.0.3` +
  `com.google.gms:google-services` on the buildscript classpath
- `android/app/build.gradle` → `apply plugin: 'com.google.gms.google-services'` and
  `apply plugin: 'com.google.firebase.crashlytics'`
- `android/app/google-services.json` copied into place
- both modules autolinked (`expo-modules-autolinking react-native-config`)

The Crashlytics Gradle plugin's job is the R8 `mapping.txt` upload. That is load-bearing:
`enableProguardInReleaseBuilds` is on, so without it every native frame arrives obfuscated — the same
unreadable-stack failure Sentry's Android Gradle plugin is enabled for.

> ⚠️ **iOS is not provisioned, and this is the sharp edge.** The app plugin registers its iOS mods
> unconditionally, and `withIosGoogleServicesFile` throws without an `ios.googleServicesFile`. Those
> mods only execute on an **iOS** prebuild — EAS runs `prebuild -p android` here and every build lane
> in this repo is Android, so nothing today reaches them. But a bare `expo prebuild` (no `-p`) **will
> fail** until an iOS `GoogleService-Info.plist` is added. Do that in the same change that first
> builds for iOS, along with `expo-build-properties` → `ios.useFrameworks: "static"`, which
> RNFirebase requires.

**This is a NATIVE change.** New native modules and Gradle plugins shift the expo-updates
`fingerprint` runtimeVersion, so it reaches devices only through a **store build** — no OTA can carry
it, and no OTA can repair it (REL-01/REL-02).
