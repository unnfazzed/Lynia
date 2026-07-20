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

/** Report an error to Sentry when enabled; a no-op otherwise. Safe to call unconditionally. */
export function captureException(error: unknown): void {
  if (enabled) Sentry.captureException(error);
}

/** Wrap the app root so Sentry can attach its error boundary + touch instrumentation. Inert (passthrough)
 *  until `initSentry` runs with a DSN, so wrapping unconditionally is safe. */
export const wrap = Sentry.wrap;
