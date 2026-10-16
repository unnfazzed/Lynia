/**
 * The ONE place the app opens a KYC verification check.
 *
 * Two lanes, tried in order:
 *
 *  1. **In-app sheet** (KycCheckHost) — Didit's hosted flow rendered inside LyniaGo, in Lynia
 *     chrome. This is the owner's instruction (2026-08-20/22: riders never do KYC on the Didit
 *     website outside the app) delivered WITHOUT the native SDK + New Architecture pair that killed
 *     cold start on every build carrying it (MOB-BOOT-04,
 *     docs/archive/COLD-START-CRASH-RCA-2026-08-21.md). The webhook stays the verdict lane; the sheet only
 *     reports how the launch went.
 *  2. **In-app browser tab** (expo-web-browser, part of build #30's proven-good native surface) —
 *     the fallback when the sheet cannot present: no host mounted, the WebView native module is
 *     missing from the binary (an OTA'd JS bundle on a pre-WebView build — the fingerprint
 *     runtimeVersion normally prevents that pairing, but this module must not bet the rider's only
 *     verification path on it), or the rider denied the camera permission the embedded flow needs
 *     (a Custom Tab can still ask for camera per-site through the browser's own permission UI, so
 *     the tab genuinely recovers a rider the sheet would strand).
 *
 * Re-landing the native SDK (if MOB-BOOT-04's device trace ever lands and the migration is proven):
 * restore the token-holding native launch from git history at this file (2026-08-20) as a lane
 * above both of these — the call sites already carry `sessionToken` untouched.
 *
 * Never throws — every failure resolves to `failed`, because the caller's job is to pick a wall and
 * `cant_start` is the truthful one. All requires are lazy inside try blocks: a static import that
 * explodes would escape before any catch and break that contract (RCA §3 #3).
 */
import type { KycSdkResult } from "../logic/gates";
import { EVENTS, track } from "../telemetry/events";
import { addBreadcrumb } from "../telemetry/sentry";

/**
 * The deep link the API's `/kyc/return` landing redirects to (`apps/api/src/kyc/kyc.controller.ts`
 * KYC_RETURN_HTML) — the app's own scheme (app.config.ts `scheme`). The browser lane watches for it.
 */
export const KYC_RETURN_REDIRECT = "lynia://";

/**
 * Everything a launch attempt may need. `verificationUrl` feeds both lanes below; `sessionToken` is
 * the native SDK's credential, carried so the call sites don't change shape if the SDK re-lands as
 * the primary path. Both come from the same become/retry response.
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
   * Native-SDK-only: the hosted web flow renders its own expired-session page inside the sheet/tab,
   * so neither web lane can observe expiry and both always report `false` — retries stay on the
   * server's free resume path instead of burning a paid Didit session per tap.
   */
  sessionUnusable: boolean;
}

/**
 * Best-effort app-level camera permission for the embedded flow. Android WebViews can only GRANT a
 * page's getUserMedia ask when the app itself already holds CAMERA — there is no OS prompt at that
 * point — so it must be settled before the sheet opens. Reuses expo-image-picker (already the KYC
 * portrait's permission surface, BH-11) rather than adding a camera dependency.
 *
 * `true` means "open the sheet"; `false` means "the sheet's camera would be dead — prefer the
 * browser lane, whose per-site permission UI can still recover". A probe that cannot run at all
 * resolves `true`: the sheet then degrades inside Didit's own UI rather than being withheld on a
 * guess.
 */
async function cameraPermissionForSheet(): Promise<boolean> {
  try {
    // Only the in-app sheet needs the app's own camera grant — with no sheet to present, the browser lane
    // asks per-site itself, so there is nothing to ask here (and no dialog to pop for nothing).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const host = require("./KycCheckHost") as typeof import("./KycCheckHost");
    if (!host.canPresentKycCheck()) return true;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ImagePicker = require("expo-image-picker") as typeof import("expo-image-picker");
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await ImagePicker.requestCameraPermissionsAsync();
    return asked.granted;
  } catch {
    return true;
  }
}

/** When the rider tapped to start the check now launching (`primeKycLaunch`), for the launch timings. */
let launchStartedAt: number | null = null;

/** A tap older than this is not the one the launch belongs to (a stale prime from an earlier attempt). */
const LAUNCH_TIMING_WINDOW_MS = 2 * 60_000;

/** The in-app sheet's host module, or null when it can't load — required lazily, like everything here. */
function sheetHost(): typeof import("./KycCheckHost") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("./KycCheckHost") as typeof import("./KycCheckHost");
  } catch {
    return null;
  }
}

/**
 * The tap that starts a check: begin everything the check needs NOW, before the become / retry call that
 * mints the session returns (that call is paid and sometimes slow). Returns the camera-permission answer for
 * `runKycVerification`. Never rejects. When the sheet can't present, nothing is asked, held or warmed (the
 * browser lane has its own per-site ask and nothing to stand in for).
 *
 *  - the camera permission the in-app sheet needs (it used to be asked only after the session call came
 *    back, so the rider waited on the network and THEN on a permission dialog);
 *  - the sheet itself, on "Opening your ID check…" — the caller ends it on every path that opens nothing
 *    ({@link endKycCheckHold}, in a `finally`);
 *  - the hidden prewarm of the vendor's page (KycCheckHost's header).
 */
export function primeKycLaunch(now: number = Date.now()): Promise<boolean> {
  launchStartedAt = now;
  const host = sheetHost();
  try {
    host?.prewarmKycCheck(now);
    host?.holdKycCheck();
  } catch {
    // The sheet is an upgrade, never a wall.
  }
  return cameraPermissionForSheet();
}

/** Drop the "Opening your ID check…" stand-in: nothing will open (an error, manual review, a toast to show). */
export function endKycCheckHold(): void {
  try {
    sheetHost()?.endKycCheckHold();
  } catch {
    // Nothing to drop.
  }
}

export interface KycLaunchOptions {
  /** The camera permission already being settled (`primeKycLaunch`), so the sheet doesn't ask again. */
  camera?: Promise<boolean>;
}

/** Funnel analytics + a Sentry breadcrumb for one launch. No credentials, no URLs, no PII. */
function noteLaunch(lane: "sheet" | "browser" | "none", outcome: KycSdkResult, extra?: Record<string, string | number>): void {
  track(EVENTS.kycLaunch, { lane, outcome: outcome ?? null, ...extra });
  addBreadcrumb("kyc.launch", { lane, outcome, ...extra });
}

/**
 * The launch timings, ms from the tap (`primeKycLaunch`): `session_ms` until the session was in hand (the
 * become / retry call), `total_ms` until the check ended. Empty without a recent tap to measure from.
 */
function launchTimings(sessionAt: number): Record<string, number> {
  const start = launchStartedAt;
  const now = Date.now();
  if (start === null || sessionAt - start > LAUNCH_TIMING_WINDOW_MS || sessionAt < start) return {};
  return { session_ms: sessionAt - start, total_ms: now - start };
}

/**
 * Attempt to open a verification check. See the module header for the lane order; the outcome
 * mapping is identical from either lane so the walls read the same however the check was shown.
 */
export async function runKycVerification(creds: KycLaunchCredentials, opts: KycLaunchOptions = {}): Promise<KycLaunchOutcome> {
  const url = creds.verificationUrl;
  // The session is in hand now: the timings measure from the tap to here, and to the end of the check.
  const sessionAt = Date.now();
  const timings = (): Record<string, number> => {
    const t = launchTimings(sessionAt);
    launchStartedAt = null;
    return t;
  };
  // https only — the URL crosses a trust boundary (server → an embedded/OS browser surface), and
  // anything else (http, a scheme-less string, an intent: URL) is not a vendor verification page we
  // should open.
  if (!url || !url.startsWith("https://")) {
    endKycCheckHold();
    noteLaunch("none", "failed", { reason: url ? "bad_url" : "no_url", ...timings() });
    return { outcome: "failed", sessionUnusable: false };
  }
  addBreadcrumb("kyc.launch.start");

  // Lane 1 — the in-app sheet.
  try {
    const host = sheetHost();
    if (host?.canPresentKycCheck()) {
      const cameraOk = await (opts.camera ?? cameraPermissionForSheet());
      if (!cameraOk) {
        track(EVENTS.kycCameraDenied);
        addBreadcrumb("kyc.camera_denied");
      } else {
        const pending = host.presentKycCheck({ url });
        if (pending) {
          const outcome = await pending;
          noteLaunch("sheet", outcome, timings());
          return { outcome, sessionUnusable: false };
        }
      }
    }
  } catch {
    // The sheet is an upgrade, never a wall: any failure here falls through to the browser lane.
    addBreadcrumb("kyc.sheet_unavailable");
  }

  // Lane 2 — the in-app browser tab. A rider who already closed the stand-in left: nothing opens over them.
  let left = false;
  try {
    left = sheetHost()?.takeKycCheckHoldCancelled() === true;
  } catch {
    // No host module: nothing was held.
  }
  if (left) {
    noteLaunch("none", "cancelled", timings());
    return { outcome: "cancelled", sessionUnusable: false };
  }
  // The sheet's stand-in (if one is up) gives way to the tab first.
  endKycCheckHold();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WebBrowser = require("expo-web-browser") as typeof import("expo-web-browser");
    // R-10: the return URL is what makes `success` reachable at all. The API's /kyc/return landing (the
    // DIDIT_CALLBACK_URL target) bounces the tab to `lynia://`; without a redirect URL to watch for,
    // the auth session can't recognise that hop and Android reported every finished check `cancel`.
    const browser = await WebBrowser.openAuthSessionAsync(url, KYC_RETURN_REDIRECT);
    // `success` is the redirect back; `cancel` / `dismiss` / anything else is the rider closing the
    // tab, which is "unfinished", not "failed" — they chose to leave, nothing broke.
    const outcome = browser.type === "success" ? "completed" : "cancelled";
    noteLaunch("browser", outcome, timings());
    return { outcome, sessionUnusable: false };
  } catch {
    // The browser module is missing or the tab could not open. Same rider-visible truth as before
    // this lane existed: the check never started, and `cant_start` says so.
    noteLaunch("browser", "failed", { reason: "browser_unavailable", ...timings() });
    return { outcome: "failed", sessionUnusable: false };
  }
}
