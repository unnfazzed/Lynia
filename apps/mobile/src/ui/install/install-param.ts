/**
 * `?install=1` (lyniago.com/download sends iPhone visitors to app.lyniago.com/?install=1) must survive the
 * boot: `app/index.tsx` redirects to Home (or through sign-in) and the redirect drops the query string. So
 * the root layout calls `captureInstallParam()` once, as the app loads: it remembers the flag for this tab
 * in sessionStorage and strips it from the URL straight away, so a refresh or a shared link doesn't carry
 * it (handoff download-qr-install-tip-2026-10 §2, "strip install=1 … with history.replaceState").
 * Web-only; every access is guarded, so it is a no-op on the phone apps and in tests.
 */

const PENDING_KEY = "lyniago.installTip.pending";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser globals the tip reads. The app compiles without the DOM types, so they're typed here. */
export interface BrowserGlobals {
  location?: { href: string };
  history?: { state: unknown; replaceState(state: unknown, title: string, url: string): void };
  sessionStorage?: StorageLike;
  localStorage?: StorageLike;
  navigator?: { userAgent?: string; maxTouchPoints?: number; standalone?: boolean };
  matchMedia?: (query: string) => { matches: boolean };
}

export const browser = globalThis as unknown as BrowserGlobals;

export function captureInstallParam(): void {
  try {
    const loc = browser.location;
    if (!loc?.href) return;
    const url = new URL(loc.href);
    if (url.searchParams.get("install") !== "1") return;
    browser.sessionStorage?.setItem(PENDING_KEY, "1");
    url.searchParams.delete("install");
    browser.history?.replaceState(browser.history.state, "", url.pathname + url.search + url.hash);
  } catch {
    // Storage or history blocked (private mode, sandboxed frame): the tip simply doesn't show.
  }
}

/** True when this tab arrived through the download link. */
export function installParamPending(): boolean {
  try {
    return browser.sessionStorage?.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}
