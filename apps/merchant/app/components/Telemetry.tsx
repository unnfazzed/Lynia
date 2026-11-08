"use client";

import { useEffect } from "react";
import { startTelemetry } from "../lib/telemetry";

/** Starts Sentry + PostHog once, after first paint (app/lib/telemetry.ts). Renders nothing. */
export function Telemetry() {
  useEffect(() => {
    startTelemetry();
  }, []);
  return null;
}
