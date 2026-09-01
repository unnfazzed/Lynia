/**
 * Merchant session persistence. Stored in a plain (non-httpOnly) cookie rather than an httpOnly
 * server-side one: this app is a client-driven dashboard (the alarm loop, wake lock, reconnect
 * banner, and the future kitchen-queue socket all run in the tab and need the bearer token
 * themselves), so there is no way to keep the token off the client without also breaking those.
 * `middleware.ts` reads only the cookie's PRESENCE to gate page loads (fail-closed UX) — the real
 * authorization boundary is server-side (`MerchantGuard` on every `apps/api` merchant route).
 *
 * Survives a tablet reboot (RESTAURANTS-DECISIONS.md §3): the cookie outlives a browser/OS restart
 * as long as its max-age hasn't elapsed, so a reload after a reboot finds the session already there.
 */
export interface MerchantSession {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds, as returned by the API at sign-in/refresh. */
  expiresIn: number;
  /** Epoch ms the session was (re)issued — used only for a soft client-side "probably expired" hint. */
  issuedAt: number;
  profileId: string;
  role: string;
}

export const SESSION_COOKIE = "lynia_merchant_session";

/**
 * Refresh tokens are valid 365 days server-side by default (auth.service.ts REFRESH_TTL_SECONDS — the
 * "stay signed in" product decision 2026-07-25: opening the app/dashboard once a year never re-prompts
 * for a code) and ROTATE on every use, re-stamping that window each time (see doRefresh in
 * api-client.ts, which calls saveMerchantSession — and so re-sets this cookie with a fresh max-age — on
 * every successful refresh). Keep this constant in sync with apps/api/src/config/env.ts's
 * REFRESH_TTL_SECONDS default: this was previously 30 days, which meant a merchant who left the
 * dashboard closed for over a month (but under a year) found the COOKIE gone — forcing a re-login —
 * even though the underlying refresh token was still valid server-side, contradicting the
 * "never re-prompted unless you sign out" model everywhere else in the product.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Parse a session cookie value. Never throws — a corrupt/foreign cookie value reads as "no session"
 *  (the recoverable path: re-authenticate) rather than crashing the app. */
export function parseMerchantSession(raw: string | undefined | null): MerchantSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MerchantSession>;
    if (
      typeof parsed.accessToken === "string" &&
      typeof parsed.refreshToken === "string" &&
      typeof parsed.expiresIn === "number" &&
      typeof parsed.issuedAt === "number" &&
      typeof parsed.profileId === "string" &&
      typeof parsed.role === "string"
    ) {
      return parsed as MerchantSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeMerchantSession(session: MerchantSession): string {
  return JSON.stringify(session);
}

function isBrowser(): boolean {
  return typeof document !== "undefined";
}

/** Read the session cookie in the browser. Returns null server-side (SSR) or with no cookie set. */
export function loadMerchantSession(): MerchantSession | null {
  if (!isBrowser()) return null;
  const match = document.cookie.match(/(?:^|; )lynia_merchant_session=([^;]*)/);
  const raw = match?.[1];
  if (raw === undefined) return null;
  try {
    return parseMerchantSession(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export function saveMerchantSession(session: MerchantSession): void {
  if (!isBrowser()) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${SESSION_COOKIE}=${encodeURIComponent(serializeMerchantSession(session))}` +
    `; path=/; max-age=${SESSION_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function clearMerchantSession(): void {
  if (!isBrowser()) return;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
