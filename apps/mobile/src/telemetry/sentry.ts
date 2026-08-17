import * as Sentry from "@sentry/react-native";

let enabled = false;

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
 * INERT WITHOUT CONFIG: with no `EXPO_PUBLIC_SENTRY_DSN` the SDK never initializes, so dev, jest, and
 * any build the founder hasn't wired a DSN into stay silent. The DSN is a write-only ingest key — safe
 * to embed in the binary, like every RN app.
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
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    tracesSampleRate: config.tracesSampleRate ?? 0,
    // No PII: never attach IP / device id / user data to events (privacy + CDPA). Crash context only.
    sendDefaultPii: false,
  });
  enabled = true;
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
  if (enabled) Sentry.captureException(error, context);
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
  if (enabled) Sentry.addBreadcrumb({ message, data, level: "info" });
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
  if (!enabled) return false;
  Sentry.nativeCrash();
  return true;
}

/** Wrap the app root so Sentry can attach its error boundary + touch instrumentation. Inert (passthrough)
 *  until `initSentry` runs with a DSN, so wrapping unconditionally is safe. */
export const wrap = Sentry.wrap;
