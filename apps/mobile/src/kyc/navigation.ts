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
 * Everything on the vendor's own hosts stays inside the sheet. Completion is recognised by its SHAPE —
 * the app's own scheme, the API's `/kyc/return` landing, or any page on the API's host — and nothing
 * else. Any other off-vendor navigation (a privacy-policy or terms link, a `mailto:`, a support chat) is
 * `external`: it opens outside the app and the check stays open.
 *
 * This used to be completion-biased (any off-vendor https host closed the sheet as "completed"). That
 * told a rider who tapped a policy link on Didit's first screen "We're checking your ID" for a check
 * they never did. A missed completion is the cheaper error now: the rider closes the sheet, and the
 * server's authoritative `kycPendingState` (Didit's own "In Review") still puts them on the right wall.
 *
 * Pure and RN-free so it is unit-testable. No `new URL(...)`: React Native's URL polyfill throws
 * "not implemented" from accessors (same constraint src/config.ts documents), so hosts are read with
 * the same defensive regexes.
 */

export type KycWebNavigation = "allow" | "completed" | "external";

/** The app's own deep-link scheme (app.config.ts `scheme`) — the only custom scheme that means "done". */
const APP_SCHEME = "lynia";

/** The API's post-verification landing (`apps/api/src/kyc/kyc.controller.ts` `GET kyc/return`). */
const RETURN_PATH = /^\/kyc\/return(?:[/?#]|$)/i;

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

/** The path of an http(s) URL (query and fragment dropped), or "" when it has none. */
function httpUrlPath(url: string): string {
  return /^https?:\/\/[^/\\?#]*([^?#]*)/i.exec(url)?.[1] ?? "";
}

/** Whether `host` is the vendor apex or any subdomain of it. */
function isVendorHost(host: string): boolean {
  return host === VENDOR_APEX || host.endsWith(`.${VENDOR_APEX}`);
}

/**
 * Decide one navigation. `initialUrl` is the verification URL the sheet opened with; `navUrl` is
 * where the page wants to go next; `apiUrl` is the app's API base (its host is a callback host).
 * "completed" means: stop loading, close the sheet, report the check finished. "external" means: don't
 * load it here and don't treat it as the end — hand it to the OS and keep the check open.
 */
export function resolveKycWebNavigation(initialUrl: string, navUrl: string, apiUrl?: string | null): KycWebNavigation {
  const scheme = urlScheme(navUrl);
  // Relative path / fragment — in-page navigation, never a redirect out.
  if (!scheme) return "allow";
  if (scheme !== "http" && scheme !== "https") {
    // about:blank, data:, blob: and javascript: are how web pages talk to themselves.
    if (INTERNAL_SCHEMES.has(scheme)) return "allow";
    // The app's own deep link — directly, or in Android's intent:// wrapper — is the callback.
    if (scheme === APP_SCHEME) return "completed";
    if (scheme === "intent" && /;scheme=lynia;/i.test(navUrl)) return "completed";
    // mailto:, tel:, whatsapp:, someone else's intent:// — a link the rider tapped, not the end.
    return "external";
  }
  const host = httpUrlHost(navUrl);
  // Unparseable http(s) — let the WebView try; failing to load is handled by the sheet's error state.
  if (!host) return "allow";
  const initialHost = httpUrlHost(initialUrl);
  if (initialHost && host === initialHost) return "allow";
  if (isVendorHost(host)) return "allow";
  // Off the vendor: only the callback's shape is completion — the API's /kyc/return landing (on whatever
  // host DIDIT_CALLBACK_URL names) or any page on the API's own host.
  const apiHost = apiUrl ? httpUrlHost(apiUrl) : null;
  if (RETURN_PATH.test(httpUrlPath(navUrl)) || (apiHost && host === apiHost)) return "completed";
  return "external";
}
