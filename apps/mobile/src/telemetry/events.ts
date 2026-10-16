import { analyticsEnabled } from "../config";

/**
 * Product-analytics EVENTS — the funnel steps a route pattern can't tell apart.
 *
 * PostHog only records screens as route patterns (analytics.tsx ScreenTracker), so R2, R3, F1–F8 and the
 * live board are all `/rider`, and P1–P13 are all `/permissions`: the rider onboarding funnel (sign-up →
 * ID check → outcome page → permissions → first time online) was invisible. These events name the step.
 *
 * NO PII, ever: event names and properties carry screen ids, outcomes, reason codes and durations — never
 * a name, a phone number, an ID number, an address or a position.
 *
 * This module never imports the SDK (it stays off the cold-start path, like analytics.tsx): the provider's
 * tracker registers the live client as the sink once it has loaded, and events raised before then wait in a
 * small bounded queue. Without an analytics key every call is a no-op.
 */
export type EventProps = Record<string, string | number | boolean | null>;

interface Sink {
  capture: (event: string, properties?: EventProps) => void;
}

let sink: Sink | null = null;
const queue: Array<{ event: string; props?: EventProps }> = [];
/** Events held while the SDK loads (it arms a few frames after the first interaction settles). */
const MAX_QUEUED = 50;

/** Record one funnel event. Safe to call unconditionally: never throws, no-op without an analytics key. */
export function track(event: string, props?: EventProps): void {
  if (!analyticsEnabled()) return;
  if (!sink) {
    queue.push({ event, props });
    if (queue.length > MAX_QUEUED) queue.shift();
    return;
  }
  try {
    sink.capture(event, props);
  } catch {
    // Analytics is an accelerant, never a dependency.
  }
}

/** The provider's tracker hands over the live client (null on unmount); queued events flush to it. */
export function setAnalyticsSink(next: Sink | null): void {
  sink = next && typeof next.capture === "function" ? next : null;
  if (!sink) return;
  for (const e of queue.splice(0)) {
    try {
      sink.capture(e.event, e.props);
    } catch {
      /* drop */
    }
  }
}

/** Test seam. */
export function __resetEvents(): void {
  sink = null;
  queue.length = 0;
}

/** The funnel's event names, in one place so a dashboard and the code can't drift. */
export const EVENTS = {
  /** A rider-side page the route can't name: `screen` = F1…F8 / R2 / R3 / board / become. */
  riderScreen: "rider_screen_shown",
  /** One ID-check launch: `lane` sheet | browser | none, `outcome` completed | cancelled | failed. */
  kycLaunch: "kyc_launch",
  /** The camera permission the in-app sheet needs was refused (the browser lane is tried instead). */
  kycCameraDenied: "kyc_camera_denied",
  /** The in-app sheet's WebView failed: `kind` error | http_error (`status` for http). */
  kycWebError: "kyc_web_error",
  /** The ID check appeared in the in-app sheet: `ms` from the sheet opening, `prewarmed`, `webview` (System WebView major). */
  kycSheetShown: "kyc_sheet_shown",
  /** A rider-permission screen shown: `screen` P1…P16, `flow` (from R3), "signup" (after sign-up, D-109) or a single step. */
  permScreen: "rider_perm_screen",
  /** A rider-permission step answered: `screen` P1…P16, `answer` (granted / coarse / denied / blocked / not_now …). */
  permAnswer: "rider_perm_answer",
  /** A customer after-sign-up permission screen shown (D-109): `screen` location | notifications. */
  signupPermScreen: "customer_signup_perm_screen",
  /** A customer after-sign-up permission step answered: `screen`, `answer` (granted / coarse / denied / blocked / not_now). */
  signupPermAnswer: "customer_signup_perm_answer",
  /** Go-online: `ok`, and the refusal `reason` code when the server said no. */
  goOnline: "rider_go_online",
  /** The first time this account went online on this phone: `ms_since_signup`. */
  firstOnline: "rider_first_online",
} as const;
