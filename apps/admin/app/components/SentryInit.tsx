"use client";

import { useEffect } from "react";

/** Errors per page load, at most: a render loop must not burn the free quota (CLAUDE.md, free plans). */
export const MAX_ERRORS_PER_PAGE = 20;

let started = false;

/**
 * Admin console error reporting (owner 2026-11-08): Sentry, errors only (no tracing, no replay, no PII), on the free
 * plan. The DSN comes from the server at request time (`ADMIN_SENTRY_DSN`, set by deploy-admin-azure.yml from a
 * repository variable), so one image serves any host; with none, nothing loads. No PostHog here: a handful of ops
 * users isn't worth analytics events (owner's choice). Never throws.
 */
export function SentryInit({ dsn }: { dsn: string | null }) {
  useEffect(() => {
    if (!dsn || started) return;
    started = true;
    let sent = 0;
    void import("@sentry/browser")
      .then((Sentry) =>
        Sentry.init({
          dsn,
          environment: "production",
          tracesSampleRate: 0,
          sendDefaultPii: false,
          maxBreadcrumbs: 30,
          beforeSend(event) {
            sent += 1;
            return sent > MAX_ERRORS_PER_PAGE ? null : event;
          },
        }),
      )
      .catch(() => undefined);
  }, [dsn]);
  return null;
}
