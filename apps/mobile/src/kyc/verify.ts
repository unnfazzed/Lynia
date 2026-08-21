/**
 * The ONE place the app opens a KYC verification check — currently via the vendor-hosted web flow in
 * an in-app browser tab, because the Didit native SDK is REVERTED (MOB-BOOT-04, 2026-08-21).
 *
 * Route A (owner decision, 2026-08-20) put Didit's native capture/liveness UI inside LyniaGo. That
 * SDK requires React Native's New Architecture, and every build carrying that pair (#31–#33) dies at
 * cold start on a real handset. Per docs/COLD-START-CRASH-RCA-2026-08-21.md §8.2 both native changes
 * are reverted together, which removes the package this module used to import.
 *
 * The revert initially left this module a stub that resolved every launch `failed` — which walled
 * every pending rider behind `cant_start` ("We couldn't open the ID check") with a "Try again" that
 * could only fail the same way: the app had NO working path to finish or correct an ID check at all.
 * That dead-end is why the browser hand-off is restored here as the fallback lane: the server never
 * stopped returning `verificationUrl` (the vendor-hosted web flow — kept precisely because shipped
 * builds still open it), the verdict lane is unchanged (HMAC-signed webhook to /kyc/callback), and
 * `expo-web-browser` was part of build #30's proven-good native surface, so this is a JS-only change
 * that cannot re-introduce the cold-start crash.
 *
 * Re-landing the SDK: restore the native launch from git history at this file (2026-08-20) as the
 * PRIMARY path — try the token-holding native check first, and keep this browser lane as the fallback
 * for a missing/failed native module — together with the New Architecture flag and plugin/keep-rule
 * wiring in app.config.ts, one native change at a time, each behind a sideloaded device cold-start
 * smoke (RCA §8.2 steps 3–6). The SDK import must load lazily inside a try, exactly as the browser
 * module does below: this module's "never throws" contract once lied because a static import throws
 * before any catch can hold it (RCA §3 #3).
 */
import type { KycSdkResult } from "../logic/gates";

/**
 * Everything a launch attempt may need. `verificationUrl` feeds the browser lane below;
 * `sessionToken` is the native SDK's credential, carried so the call sites don't change shape when
 * the SDK re-lands as the primary path. Both come from the same retry/become response.
 */
export interface KycLaunchCredentials {
  sessionToken?: string | null;
  verificationUrl?: string | null;
}

/**
 * What one launch attempt tells the caller.
 *
 * `outcome` feeds `resolveKycGate` (completed → in_flight, cancelled → unfinished, failed →
 * cant_start). `sessionUnusable` is separate because it answers a different question: not "which wall
 * does the rider see" but "is the session credential we hold still worth re-opening".
 */
export interface KycLaunchOutcome {
  outcome: KycSdkResult;
  /**
   * The session itself is dead and re-opening it would fail identically — so the NEXT attempt must
   * mint a fresh one (`retryKyc({ force: true })`) instead of taking the server's free resume path.
   *
   * Native-SDK-only: the hosted web flow renders its own expired-session page inside the tab, so the
   * browser lane can never observe expiry and always reports `false` — retries stay on the server's
   * free resume path instead of burning a paid Didit session per tap.
   */
  sessionUnusable: boolean;
}

/**
 * Attempt to open a verification check.
 *
 * Never throws: every failure path — no https URL to open, a browser module that won't load (a
 * stripped build, no WebView), a launch that throws — resolves to `failed`, because the caller's job
 * is to pick a wall and `cant_start` is the truthful one. The in-app browser tab (not the system
 * browser) returns to the app when the rider closes it, so the caller can immediately re-check
 * status rather than leaving them stranded outside the app.
 */
export async function runKycVerification(creds: KycLaunchCredentials): Promise<KycLaunchOutcome> {
  const url = creds.verificationUrl;
  // https only — the URL crosses a trust boundary (server → OS browser surface), and anything else
  // (http, a scheme-less string, an intent: URL) is not a vendor verification page we should open.
  if (!url || !url.startsWith("https://")) {
    return { outcome: "failed", sessionUnusable: false };
  }
  try {
    // Lazy require inside the try, never a static import: a module that explodes at import time
    // would otherwise throw before any catch can hold it and break this function's "never throws"
    // contract (the exact failure RCA §3 #3 documents against this file).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WebBrowser = require("expo-web-browser") as typeof import("expo-web-browser");
    const browser = await WebBrowser.openAuthSessionAsync(url);
    // `success` is the redirect back; `cancel` / `dismiss` / anything else is the rider closing the
    // tab, which is "unfinished", not "failed" — they chose to leave, nothing broke.
    return { outcome: browser.type === "success" ? "completed" : "cancelled", sessionUnusable: false };
  } catch {
    // The browser module is missing or the tab could not open. Same rider-visible truth as before
    // this lane existed: the check never started, and `cant_start` says so.
    return { outcome: "failed", sessionUnusable: false };
  }
}
