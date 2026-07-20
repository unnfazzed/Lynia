import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";

let initialized = false;

/**
 * Crash / error reporting (roadmap 1.1). The API emits OTEL metrics + traces, but until now an
 * unexpected throw only reached the server log (AllExceptionsFilter tags it with a correlationId and
 * returns a safe 500) — there was no aggregated, alertable crash view. Sentry adds that.
 *
 * INERT WITHOUT CONFIG: if `SENTRY_DSN` is unset the SDK is never initialized and every
 * `captureException` below is a guarded no-op — so dev, test, and any env the founder hasn't wired a
 * DSN into stay completely quiet (the same seam the OTEL/push adapters use). Call once, before the
 * Nest app is created, so the SDK's global handlers are installed ahead of any request handling.
 *
 * FOUNDER STEP (LR20): provision a Sentry project, put its DSN in Secret Manager, expose it to the
 * runtime SA as SENTRY_DSN, then confirm a forced test error appears in the dashboard.
 */
export function initSentry(opts: {
  dsn?: string;
  environment?: string;
  tracesSampleRate: number;
  release?: string;
}): void {
  if (!opts.dsn) {
    Logger.log("Sentry disabled (SENTRY_DSN unset) — crashes go to logs only", "Sentry");
    return;
  }
  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment,
    tracesSampleRate: opts.tracesSampleRate,
    release: opts.release,
  });
  initialized = true;
  Logger.log(`Sentry enabled (env=${opts.environment ?? "unset"})`, "Sentry");
}

/** True once a DSN-backed init succeeded — lets callers skip building a Sentry payload when off. */
export function isSentryEnabled(): boolean {
  return initialized;
}

/** Report an unexpected error to Sentry when enabled; a no-op otherwise. Safe to call unconditionally. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
