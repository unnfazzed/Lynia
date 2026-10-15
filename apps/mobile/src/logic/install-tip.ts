/**
 * Which Add to Home Screen surface the customer web app shows (handoff download-qr-install-tip-2026-10 §2,
 * "When it shows"). Pure: the hook (src/ui/install/useInstallTip.ts) reads the browser and storage and
 * passes the facts in, so every row of the handoff's table is unit-tested here.
 *
 * iPhone visitors reach the web app from lyniago.com/download as `app.lyniago.com/?install=1`. The sheet
 * shows on that link only; once it is dismissed, a quiet pin row stays on Home until its own ✕ (owner,
 * 2026-10-15: the pin row is for people who came through the download link, never everyone).
 */

export type InstallTipSurface = "sheet" | "sheetSmall" | "pin" | "launched" | null;

/** localStorage keys, verbatim from the handoff. Value "1" = dismissed. */
export const INSTALL_TIP_KEYS = {
  tip: "lyniago.installTip.dismissed",
  pin: "lyniago.installPin.dismissed",
  appStore: "lyniago.appStoreTip.dismissed",
} as const;

/** Below this width the sheet uses its small-phone layout (§2.2, designed at 320×640). */
export const INSTALL_TIP_SMALL_WIDTH = 360;

export interface InstallTipFacts {
  /** The customer web build (`isCustomerWebBuild()`); the phone apps never show any of this. */
  webBuild: boolean;
  userAgent: string;
  /** `navigator.maxTouchPoints`: iPadOS Safari reports a Mac user agent, so a touch "Mac" is an iPad. */
  maxTouchPoints: number;
  /** Opened from the Home Screen (`navigator.standalone` or `(display-mode: standalone)`). */
  standalone: boolean;
  /** The URL carries `install=1`. */
  installParam: boolean;
  dismissed: { tip: boolean; pin: boolean; appStore: boolean };
  /** `EXPO_PUBLIC_APP_STORE_URL`; empty until the iPhone app is on the App Store. */
  appStoreUrl: string;
  width: number;
}

/** iPhone, iPod or iPad (including iPadOS's desktop-class Safari, which claims to be a Mac). */
export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPod|iPad/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/**
 * Safari itself, the only iOS browser the tip's steps describe. Other iOS browsers (Chrome, Firefox, Edge,
 * Opera, the Google app, DuckDuckGo) name themselves, and in-app web views (Instagram, Facebook) drop the
 * `Safari/` token.
 */
export function isIOSSafari(userAgent: string, maxTouchPoints: number): boolean {
  if (!isIOSDevice(userAgent, maxTouchPoints)) return false;
  if (!/Safari\//.test(userAgent)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|YaBrowser|FBAN|FBAV|Instagram/.test(userAgent);
}

export function installTipSurface(f: InstallTipFacts): InstallTipSurface {
  if (!f.webBuild || f.standalone) return null;
  if (!isIOSSafari(f.userAgent, f.maxTouchPoints)) return null;
  // The App Store app exists: one "Delivered" sheet, instead of the install tip, then nothing.
  if (f.appStoreUrl) return f.dismissed.appStore ? null : "launched";
  if (f.installParam && !f.dismissed.tip) return f.width < INSTALL_TIP_SMALL_WIDTH ? "sheetSmall" : "sheet";
  // Only someone who saw (and dismissed) the sheet gets the pin row; `install=1` never reopens the sheet.
  if (f.dismissed.tip && !f.dismissed.pin) return "pin";
  return null;
}
