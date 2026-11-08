/**
 * Merchant web app telemetry (owner, 2026-11-08): Sentry for errors and PostHog for page views, both on their FREE
 * plans (CLAUDE.md "Both stay on their free plans"). So:
 *
 *   Sentry   errors only: no tracing, no replay, no PII; at most MAX_ERRORS_PER_PAGE events per page load (a render
 *            loop can't burn the shared quota), and the project's DSN carries its own rate limit.
 *   PostHog  page views only: no autocapture, no session recording, no person profiles for anonymous visitors.
 *
 * INERT WITHOUT CONFIG: with no `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_POSTHOG_KEY` (baked in at build time by
 * deploy-merchant-web.yml from repository variables) neither SDK is even loaded. Both load lazily, after first paint.
 * Never throws: telemetry must not break the kitchen screen.
 */

export const MAX_ERRORS_PER_PAGE = 20;

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let started = false;

export function startTelemetry(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  if (SENTRY_DSN) void startSentry(SENTRY_DSN);
  if (POSTHOG_KEY) void startPostHog(POSTHOG_KEY);
}

async function startSentry(dsn: string): Promise<void> {
  try {
    const Sentry = await import("@sentry/browser");
    let sent = 0;
    Sentry.init({
      dsn,
      environment: "production",
      release: process.env.NEXT_PUBLIC_RELEASE || undefined,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      // Errors only: drop the default browser-tracing/replay integrations' bulk; keep the error handlers.
      integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
      maxBreadcrumbs: 30,
      beforeSend(event) {
        sent += 1;
        return sent > MAX_ERRORS_PER_PAGE ? null : event;
      },
    });
  } catch {
    /* no telemetry, the app still runs */
  }
}

async function startPostHog(key: string): Promise<void> {
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.init(key, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: "history_change",
      capture_pageleave: false,
      disable_session_recording: true,
      person_profiles: "identified_only",
      persistence: "localStorage",
      // Static export on Cloudflare: no cookies needed.
      disable_surveys: true,
    });
    posthog.register({ app: "merchant" });
  } catch {
    /* no analytics, the app still runs */
  }
}
