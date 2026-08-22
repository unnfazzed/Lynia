/**
 * Navigation policy for the in-app ID-check sheet (KycCheckHost) — the one decision the WebView keeps
 * asking while the rider is inside Didit's hosted flow: "is this navigation still the check, or is it
 * the flow telling us it's over?"
 *
 * Didit's hosted session ends by redirecting the browser to the session's `callback` URL
 * (DIDIT_CALLBACK_URL server-side — a success page or an app deep link, explicitly NOT the webhook).
 * Inside a WebView that redirect is the completion signal, and it can arrive in two shapes:
 *
 *   - a custom scheme (`lynia://…`, or Android's `intent://…` wrapper) — an app deep link;
 *   - an https URL on some non-Didit host (e.g. the API's branded /kyc/return page).
 *
 * Everything on the vendor's own hosts stays inside the sheet. The policy is deliberately a
 * completion-biased heuristic for off-vendor https hosts: a false "completed" costs one optimistic
 * "Finishing verification…" frame that the server's authoritative `kycPendingState` corrects on the
 * board's next 5-second poll (resolveKycGate lets the server outrank the client hint), while a missed
 * completion would strand a rider who finished the check inside a page we never meant to show.
 *
 * Pure and RN-free so it is unit-testable. No `new URL(...)`: React Native's URL polyfill throws
 * "not implemented" from accessors (same constraint src/config.ts documents), so hosts are read with
 * the same defensive regexes.
 */

export type KycWebNavigation = "allow" | "completed";

/** The vendor's registrable domain — every didit.me subdomain is "still the check". */
const VENDOR_APEX = "didit.me";

/** Page-internal pseudo-schemes a webview navigates to that are never a completion redirect. */
const INTERNAL_SCHEMES = new Set(["about", "data", "blob", "javascript"]);

/** The scheme of a URL-ish string, lowercased, or null for a relative/fragment navigation. */
function urlScheme(url: string): string | null {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim());
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * Lowercased host of an http(s) URL (userinfo/port stripped), or null when it doesn't parse as one.
 * Backslash terminates the authority (WHATWG parsing — browsers treat `\` like `/`), so it is
 * excluded from the userinfo and host classes: otherwise `https://evil.example\@verify.didit.me/`
 * would read `verify.didit.me` as the host here while the WebView actually navigates to
 * `evil.example`, letting a non-vendor page pass as "still the check".
 */
function httpUrlHost(url: string): string | null {
  const ipv6 = /^https?:\/\/(?:[^/\\@?#[\]]*@)?\[([^\]]+)\]/i.exec(url);
  if (ipv6) return ipv6[1]?.toLowerCase() ?? null;
  const host = /^https?:\/\/(?:[^/\\@?#]*@)?([^/\\:?#@]+)/i.exec(url);
  return host?.[1]?.toLowerCase() ?? null;
}

/** Whether `host` is the vendor apex or any subdomain of it. */
function isVendorHost(host: string): boolean {
  return host === VENDOR_APEX || host.endsWith(`.${VENDOR_APEX}`);
}

/**
 * Decide one navigation. `initialUrl` is the verification URL the sheet opened with; `navUrl` is
 * where the page wants to go next. "completed" means: stop loading, close the sheet, report the
 * check finished.
 */
export function resolveKycWebNavigation(initialUrl: string, navUrl: string): KycWebNavigation {
  const scheme = urlScheme(navUrl);
  // Relative path / fragment — in-page navigation, never a redirect out.
  if (!scheme) return "allow";
  if (scheme !== "http" && scheme !== "https") {
    // about:blank, data:, blob: and javascript: are how web pages talk to themselves; any OTHER
    // non-http scheme reaching the top frame (lynia://, intent://) is a deep-link callback — the
    // flow is over. The WebView could not load it anyway, so "allow" is never right for these.
    return INTERNAL_SCHEMES.has(scheme) ? "allow" : "completed";
  }
  const host = httpUrlHost(navUrl);
  // Unparseable http(s) — let the WebView try; failing to load is handled by the sheet's error state.
  if (!host) return "allow";
  const initialHost = httpUrlHost(initialUrl);
  if (initialHost && host === initialHost) return "allow";
  if (isVendorHost(host)) return "allow";
  // Off the vendor entirely: the callback redirect (see the header for why this bias is safe).
  return "completed";
}
