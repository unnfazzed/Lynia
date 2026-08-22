/**
 * The ONE place the app opens a KYC verification check.
 *
 * Two lanes, tried in order:
 *
 *  1. **In-app sheet** (KycCheckHost) — Didit's hosted flow rendered inside LyniaGo, in Lynia
 *     chrome. This is the owner's instruction (2026-08-20/22: riders never do KYC on the Didit
 *     website outside the app) delivered WITHOUT the native SDK + New Architecture pair that killed
 *     cold start on every build carrying it (MOB-BOOT-04,
 *     docs/COLD-START-CRASH-RCA-2026-08-21.md). The webhook stays the verdict lane; the sheet only
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

/**
 * Attempt to open a verification check. See the module header for the lane order; the outcome
 * mapping is identical from either lane so the walls read the same however the check was shown.
 */
export async function runKycVerification(creds: KycLaunchCredentials): Promise<KycLaunchOutcome> {
  const url = creds.verificationUrl;
  // https only — the URL crosses a trust boundary (server → an embedded/OS browser surface), and
  // anything else (http, a scheme-less string, an intent: URL) is not a vendor verification page we
  // should open.
  if (!url || !url.startsWith("https://")) {
    return { outcome: "failed", sessionUnusable: false };
  }

  // Lane 1 — the in-app sheet.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const host = require("./KycCheckHost") as typeof import("./KycCheckHost");
    if (host.canPresentKycCheck() && (await cameraPermissionForSheet())) {
      const pending = host.presentKycCheck({ url });
      if (pending) {
        return { outcome: await pending, sessionUnusable: false };
      }
    }
  } catch {
    // The sheet is an upgrade, never a wall: any failure here falls through to the browser lane.
  }

  // Lane 2 — the in-app browser tab.
  try {
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
