/** The SDK's shape, as a TYPE only — `typeof import(...)` is erased at compile time, so naming it
 *  costs nothing at runtime and the module stays off the startup graph until it is actually wanted.
 *  Same pattern, and the same reasoning, as `posthog-react-native` in ./analytics.tsx. */
type SentryModule = typeof import("@sentry/react-native");

let sentry: SentryModule | null = null;
let loadAttempted = false;
let enabled = false;

/**
 * Load the SDK, ONCE, and never let that failure escape.
 *
 * WHY THIS IS NOT A TOP-LEVEL IMPORT ANY MORE (MOB-BOOT-04, docs/COLD-START-CRASH-RCA-2026-08-21.md).
 * `app/_layout.tsx` imports this module at module scope, on purpose, so crash handlers arm before app
 * code runs. But `app/_layout.tsx` is itself evaluated EAGERLY by expo-router while it builds the route
 * tree (`getRoutesCore.js` calls `loadRoute()` for every `_layout`), and the app's only React error
 * boundary is the `Try` that expo-router builds FROM that load — so it cannot catch it. A synchronous
 * throw anywhere in this graph is therefore not an error screen, it is a process kill: uncaught JS →
 * `DefaultJSExceptionHandler` rethrows on the native thread → "LyniaGo keeps stopping".
 *
 * `@sentry/react-native`'s entry point is not inert on import. It re-exports `./tracing` and
 * `./replay/CustomMask`, which between them make THREE unguarded module-scope
 * `UIManager.hasViewManagerConfig()` calls. Under the old architecture that resolved to
 * `PaperUIManager`, which wrapped the native lookup in a try/catch that logged and returned false —
 * fail-safe. Under the New Architecture (`newArchEnabled: true`, shipped in build #31) it resolves to
 * `BridgelessUIManager` → `unstable_hasComponent`, which THROWS, with no catch on either side. The
 * same three lines that could not crash build #30 are fatal in #31.
 *
 * So the import is deferred behind this function and guarded. Two consequences, both wanted:
 *  - a build with no DSN never evaluates the SDK at all (dev, jest, unprovisioned builds get a
 *    lighter cold start — the same win ./analytics.tsx took for PostHog);
 *  - a build WITH a DSN that cannot load or initialise the SDK degrades to no crash reporting,
 *    which is what this module already promised callers, instead of taking the app down with it.
 *
 * Crash-handler timing is unchanged: `initSentry()` is still the first statement in the root layout,
 * so the SDK still loads at that instant — it is only the failure that behaves differently now.
 *
 * `require` (not `import()`) because Metro bundles a statically analyzable require into the same
 * bundle: this defers evaluation, it does not add a network fetch.
 */
function loadSentry(): SentryModule | null {
  if (loadAttempted) return sentry;
  loadAttempted = true;
  try {
    sentry = require("@sentry/react-native") as SentryModule;
  } catch {
    // Nothing to report the failure TO — this is the reporter. Staying silent and inert is the whole
    // point: the app boots without crash telemetry rather than not booting.
    sentry = null;
  }
  return sentry;
}

export interface SentryConfig {
  dsn?: string;
  environment?: string;
  /** 0 = crashes/errors only (default). >0 enables perf tracing at that sample rate. */
  tracesSampleRate?: number;
}

/**
 * Read the Sentry config from the build-inlined `EXPO_PUBLIC_*` env. NOTE: `babel-preset-expo` inlines
 * these at BUILD time (they travel with the binary), so this reflects what the release was built with,
 * not a runtime value — which is exactly why {@link initSentry} takes an explicit override for tests.
 */
function envConfig(): SentryConfig {
  const rawRate = Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);
  return {
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
    tracesSampleRate: Number.isFinite(rawRate) ? Math.min(Math.max(rawRate, 0), 1) : 0,
  };
}

/**
 * Mobile crash reporting (roadmap 1.1 / LR20). `@sentry/react-native` catches JS **and** native
 * (Java/Kotlin, ObjC/Swift) crashes on riders'/customers' phones — the client RUM (`telemetry/rum.ts`)
 * and PostHog only see screens/latency, never a crash. Mirrors the API's inert-without-DSN seam.
 *
 * INERT WITHOUT CONFIG: with no `EXPO_PUBLIC_SENTRY_DSN` the SDK is never even loaded, so dev, jest,
 * and any build the founder hasn't wired a DSN into stay silent. The DSN is a write-only ingest key —
 * safe to embed in the binary, like every RN app.
 *
 * NEVER THROWS. Both halves are guarded — the module load (see {@link loadSentry}) and `Sentry.init`
 * itself. This runs at the root layout's module scope, where there is no error boundary above it, so a
 * throw here is a process kill rather than a caught error. That is not a hypothetical: it is the
 * failure class MOB-BOOT-04 was opened for.
 *
 * FOUNDER STEP (LR20): add `EXPO_PUBLIC_SENTRY_DSN` (+ optionally `_ENVIRONMENT`) as an EAS build
 * secret, build a release, force a test crash, confirm it appears symbolicated in the dashboard.
 *
 * Perf tracing defaults OFF: this app targets metered 2G/3G and perf transactions send far more data
 * than crash events — opt in via `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`. Crash capture is always on
 * once a DSN is set.
 */
export function initSentry(config: SentryConfig = envConfig()): void {
  if (!config.dsn) return;
  const sdk = loadSentry();
  if (!sdk) return;
  try {
    sdk.init({
      dsn: config.dsn,
      environment: config.environment,
      tracesSampleRate: config.tracesSampleRate ?? 0,
      // No PII: never attach IP / device id / user data to events (privacy + CDPA). Crash context only.
      sendDefaultPii: false,
    });
    enabled = true;
  } catch {
    // Same contract as a failed load: no telemetry, but the app still boots.
    enabled = false;
  }
}

/** True once a DSN-backed init succeeded. */
export function isSentryEnabled(): boolean {
  return enabled;
}

/**
 * Structured detail to attach to one event. Exists because the alternative — encoding the varying part
 * into the Error MESSAGE — is what made `compose-map-not-loaded (onMapReady=true)` hard to act on:
 * Sentry fingerprints on the message, so every distinct value opens a SEPARATE issue (the same failure
 * split across `…=true` and `…=false`), while the fields you actually want to filter and group by are
 * buried in a string nobody can query. Tags are indexed and filterable; keep them low-cardinality.
 */
export interface CaptureContext {
  /** Indexed + filterable in the Sentry UI. Low-cardinality values only (platform, a flag, a count). */
  tags?: Record<string, string>;
  /** Unindexed supporting detail, shown on the event body. Free-form. */
  extra?: Record<string, unknown>;
}

/**
 * Report an error to Sentry when enabled; a no-op otherwise. Safe to call unconditionally.
 *
 * `context` rides the SDK's `captureContext` argument rather than `withScope`, so the tags apply to
 * this event only and there is no scope left pushed if the caller throws mid-report.
 */
export function captureException(error: unknown, context?: CaptureContext): void {
  if (enabled && sentry) sentry.captureException(error, context);
}

/**
 * Leave a trail on the CURRENT event scope. Costs nothing on its own — breadcrumbs upload only if an
 * event is later sent, which matters on this app's metered-2G target — and they are the only way a
 * NATIVE crash can carry what the JS side was doing just before it.
 *
 * That gap is real: an unhandled Android `AssertionError` arrived from
 * `com.facebook.infer.annotation.Assertions` with no message and no context, and nothing in this app
 * sets a tag, a user, or a breadcrumb anywhere, so there was nothing to reconstruct it from. See
 * `docs/SENTRY-TRIAGE-2026-08-17.md` §2.
 */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (enabled && sentry) sentry.addBreadcrumb({ message, data, level: "info" });
}

/**
 * Deliberately crash the NATIVE layer (LR20 exit test). This is the only way to prove the Android half
 * of the pipeline end to end: a JS throw exercises source maps, but only a native crash exercises the
 * R8 `mapping.txt` upload that `experimental_android.enableAndroidGradlePlugin` turns on — and an
 * obfuscated native stack is the failure this whole provisioning exists to prevent.
 *
 * Reachable ONLY from the QA test build's banner (src/ui), never from a store release. Returns false
 * without crashing when Sentry is inert, so a tester on an unprovisioned build gets an honest "nothing
 * would be reported" instead of a hard crash that silently reports nothing.
 */
export function nativeCrash(): boolean {
  if (!enabled || !sentry) return false;
  sentry.nativeCrash();
  return true;
}

/**
 * Wrap the app root so Sentry can attach its error boundary + touch instrumentation.
 *
 * Passthrough whenever Sentry is not armed — which now also covers "the SDK could not be loaded".
 * Deliberately does NOT call {@link loadSentry} itself: this is invoked at `app/_layout.tsx` module
 * scope, AFTER `initSentry()`, so `enabled` is already settled, and a build with no DSN must not drag
 * the SDK onto the startup graph through the back door.
 *
 * The wrap call is guarded for the same reason `init` is — it is on the unguarded boot path, and a
 * root component that renders unwrapped is strictly better than one that never renders.
 */
export function wrap<C>(component: C): C {
  if (!enabled || !sentry) return component;
  try {
    return (sentry.wrap as unknown as (c: C) => C)(component);
  } catch {
    return component;
  }
}
