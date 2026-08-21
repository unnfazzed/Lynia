/** The SDKs' shapes, as TYPES only — `typeof import(...)` is erased at compile time, so naming them
 *  costs nothing at runtime and neither module joins the startup graph until it is actually wanted.
 *  Same pattern, and the same reasoning, as `@sentry/react-native` in ./sentry.ts. */
type CrashlyticsModule = typeof import("@react-native-firebase/crashlytics");
type FirebaseAppModule = typeof import("@react-native-firebase/app");

let sdk: CrashlyticsModule | null = null;
let instance: ReturnType<CrashlyticsModule["getCrashlytics"]> | null = null;
let loadAttempted = false;
let enabled = false;

/**
 * WHAT CRASHLYTICS ADDS THAT SENTRY CANNOT (and why this module exists at all).
 *
 * Sentry (./sentry.ts) is the primary reporter and stays that way — richer JS context, breadcrumbs,
 * the triage workflow this team already uses. Crashlytics is here for the ONE failure class Sentry
 * structurally cannot see: **a crash that happens before, or during, the JS bundle's own startup.**
 *
 * That is not a hypothetical gap on this app, it is the last shipped outage.
 * `docs/COLD-START-CRASH-RCA-2026-08-21.md` (MOB-BOOT-04): build #31 died at `app/_layout.tsx` module
 * scope because `@sentry/react-native`'s own import threw under the New Architecture. The crash
 * reporter WAS the crash, so nothing was reported — the failure had to be diagnosed from a
 * photograph of a testers's phone. Sentry arms from JS, so any crash upstream of `initSentry()`
 * running successfully is invisible to it, by construction.
 *
 * Crashlytics does not have that dependency. The Firebase Android SDK arms from a
 * `ContentProvider` during *application* startup — before React Native loads, before Metro's bundle
 * is evaluated, before this file exists. A process kill at JS module scope, a native crash in an
 * `Application.onCreate`, an R8-stripped class that blows up on first touch: all of it lands in the
 * Crashlytics console with a full native stack, whether or not any JS ever ran.
 *
 * SO: NOTHING IN THIS FILE TURNS CRASH CATCHING ON. It is already on, natively, by the time this
 * module can be imported. Everything here is the JS-side *addenda* — custom keys, logs, explicit JS
 * error records, the collection kill switch — and every one of them is best-effort.
 */

/**
 * Load both SDKs, ONCE, and never let that failure escape.
 *
 * Deferred behind a function rather than imported at the top, for the exact reason the RCA above
 * documents: this module is reachable from `app/_layout.tsx` module scope, where expo-router has
 * already begun building the route tree and the `Try` boundary it would be caught by does not exist
 * yet. A synchronous throw in this graph is a process kill, not an error screen. It would be a poor
 * joke for the module added to *observe* MOB-BOOT-04 to reproduce it.
 *
 * `require` (not `import()`) because Metro bundles a statically analyzable require into the same
 * bundle: this defers evaluation, it does not add a network fetch.
 */
function loadSdk(): CrashlyticsModule | null {
  if (loadAttempted) return sdk;
  loadAttempted = true;
  try {
    // The `app` package is what actually reads the native `google-services.json`-derived config. A
    // build with no credentials file (dev, the QA APK lane, any unprovisioned build — see the
    // `googleServicesFile` gate in app.config.ts) links the native modules but initialises no default
    // Firebase app, so `getApps()` is empty. Checking that FIRST is what keeps this module honestly
    // inert instead of throwing "No Firebase App '[DEFAULT]' has been created" on every call.
    const app = require("@react-native-firebase/app") as FirebaseAppModule;
    if (app.getApps().length === 0) return null;
    sdk = require("@react-native-firebase/crashlytics") as CrashlyticsModule;
  } catch {
    // Nothing to report the failure TO — this is a reporter. Staying silent and inert is the point.
    sdk = null;
  }
  return sdk;
}

export interface CrashlyticsConfig {
  /**
   * Master switch, applied explicitly at init so the value is deterministic rather than whatever a
   * previous launch persisted into native prefs. Defaults to `EXPO_PUBLIC_CRASHLYTICS_DISABLED !== "1"`.
   *
   * Deliberately an `EXPO_PUBLIC_*` JS-bundle value and NOT a native manifest flag: an
   * `EXPO_PUBLIC_*` string is a Metro build-time substitution that touches no native config, so it
   * is **OTA-shippable** to an already-installed binary through `mobile-ota.yml`. If Crashlytics
   * ever has to be switched off in the field — a reporting loop, a privacy hold — that can reach
   * phones the same day. A manifest flag would need a store build (REL-01/REL-02).
   */
  enabled?: boolean;
  /** Recorded as the `environment` custom key so preview and production reports are separable. */
  environment?: string;
}

/** Read the build-inlined `EXPO_PUBLIC_*` config. Same build-time-inlining caveat as ./sentry.ts:
 *  this reflects what the release was BUILT with, which is why {@link initCrashlytics} takes an
 *  explicit override for tests. */
function envConfig(): CrashlyticsConfig {
  return {
    enabled: process.env.EXPO_PUBLIC_CRASHLYTICS_DISABLED !== "1",
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
  };
}

/**
 * Arm the JS half of Crashlytics: settle the collection switch and stamp the app-level custom keys.
 *
 * INERT WITHOUT PROVISIONING. With no `google-services.json` baked into the build there is no default
 * Firebase app, `loadSdk()` returns null, and every export below becomes a no-op — so dev, jest and
 * the QA APK lane stay silent exactly like the Sentry seam does without a DSN.
 *
 * NEVER THROWS, for the reason set out at the top of this file.
 *
 * FOUNDER STEP: Crashlytics needs no new credential of its own — it rides the SAME
 * `google-services.json` that already provisions FCM push (app.config.ts `googleServicesFile`). In
 * the Firebase console open **Release & Monitor → Crashlytics** once for the `zw.co.lynia` Android
 * app and press *Enable*; the first report from a real build completes the setup. See
 * `docs/CRASHLYTICS.md`.
 */
export function initCrashlytics(config: CrashlyticsConfig = envConfig()): void {
  const mod = loadSdk();
  if (!mod) return;
  try {
    const crashlytics = mod.getCrashlytics();
    const wanted = config.enabled ?? true;
    // Set explicitly in BOTH directions. `setCrashlyticsCollectionEnabled` writes through to native
    // preferences that survive the process, so a build that once shipped `false` would keep honouring
    // it after the kill switch was lifted if we only ever called this on the disable path.
    mod.setCrashlyticsCollectionEnabled(crashlytics, wanted);
    if (!wanted) {
      instance = null;
      enabled = false;
      return;
    }
    instance = crashlytics;
    enabled = true;
    if (config.environment) setCrashKeys({ environment: config.environment });
  } catch {
    // Same contract as a failed load: no Crashlytics addenda, but the app still boots. Note that the
    // NATIVE crash handler is unaffected by this catch — it armed before JS started and stays armed.
    instance = null;
    enabled = false;
  }
}

/** True once the JS half is armed against a real Firebase app. NOTE: `false` does NOT mean native
 *  crash capture is off — see the header. It means this module's addenda are no-ops. */
export function isCrashlyticsEnabled(): boolean {
  return enabled;
}

/**
 * Record a **handled** JS error as a non-fatal report. Safe to call unconditionally.
 *
 * Non-fatals are grouped by the error's name + stack, so — exactly like the Sentry fingerprinting
 * note in ./sentry.ts — keep the varying part OUT of the message and put it in {@link setCrashKeys}.
 */
export function recordError(error: unknown, jsErrorName?: string): void {
  if (!enabled || !sdk || !instance) return;
  try {
    sdk.recordError(instance, error instanceof Error ? error : new Error(String(error)), jsErrorName);
  } catch {
    // REPORTING MUST NEVER BECOME THE FAILURE. This is called from `app/_layout.tsx`'s `bootStep`
    // catch — the handler whose entire job is to stop a boot-step throw killing the launch. An
    // unguarded throw here would escape that catch, reach module scope, and kill the process anyway.
  }
}

/**
 * Leave a trail on the NEXT report. Costs nothing on its own (logs upload only if a crash is later
 * sent, which matters on this app's metered-2G target) and, like a Sentry breadcrumb, it is the only
 * way a native crash can carry what the JS side was doing just before it.
 */
export function logCrumb(message: string): void {
  if (!enabled || !sdk || !instance) return;
  try {
    sdk.log(instance, message);
  } catch {
    // A log is context for some LATER crash, so losing one costs nothing — and this is documented as
    // safe to call unconditionally, so callers sprinkle it through hot paths without wrapping it.
  }
}

/**
 * Attach indexed, filterable key/values to every subsequent report. Low-cardinality values only.
 *
 * This is the Crashlytics answer to Sentry tags, and it is what makes a NATIVE crash actionable: an
 * unhandled Android `AssertionError` arrived from `com.facebook.infer.annotation.Assertions` with no
 * message and nothing to reconstruct it from (`docs/SENTRY-TRIAGE-2026-08-17.md` §2).
 */
export function setCrashKeys(attributes: Record<string, string>): void {
  if (!enabled || !sdk || !instance) return;
  try {
    sdk.setAttributes(instance, attributes);
  } catch {
    // Same contract as logCrumb: context for a later report, never worth a throw.
  }
}

/**
 * Did the PREVIOUS launch end in a crash? Resolves false when Crashlytics is inert.
 *
 * Worth having on this app specifically: MOB-BOOT-04 was a crash LOOP — the app died at module scope
 * on every launch, so no in-app surface could ever report it. A boot that can ask "did I just die?"
 * can degrade itself (skip the optional boot steps, show a diagnostic) instead of looping silently.
 * Nothing consumes it yet; it is exposed because the answer is only available at startup.
 */
export async function didCrashOnPreviousExecution(): Promise<boolean> {
  if (!enabled || !sdk || !instance) return false;
  try {
    return await sdk.didCrashOnPreviousExecution(instance);
  } catch {
    return false;
  }
}

/**
 * Deliberately crash the NATIVE layer (the Crashlytics half of the LR20 exit test). This is the only
 * way to prove the pipeline end to end: it exercises the R8 `mapping.txt` upload that the Crashlytics
 * Gradle plugin performs on every release build, and an obfuscated native stack is the failure that
 * whole provisioning step exists to prevent.
 *
 * Reachable ONLY from the QA test build's banner (src/ui), never from a store release, and there it
 * is the FALLBACK: that button fires Sentry's `nativeCrash()` first and only calls this when Sentry
 * is inert. One native crash is seen by both reporters' handlers, so the common path needs just one —
 * but a build with a google-services.json and no Sentry DSN would otherwise have no way to force a
 * native crash at all, and that is a shape this repo can really produce.
 *
 * Returns false without crashing when Crashlytics is inert, so a tester on an unprovisioned build
 * gets an honest "nothing would be reported" instead of a hard crash that silently reports nothing.
 */
export function crashNow(): boolean {
  if (!enabled || !sdk || !instance) return false;
  // Deliberately NOT wrapped, unlike its neighbours. A tester is here precisely to learn whether the
  // crash pipeline works, so swallowing a failure would report success for a pipeline that is broken.
  // It is also not on any boot path, so it cannot cost a launch.
  sdk.crash(instance);
  return true;
}
