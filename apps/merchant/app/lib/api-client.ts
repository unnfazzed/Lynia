import { API_BASE_URL } from "./config";
import { getReachabilityStore } from "./reachability";
import {
  clearMerchantSession,
  loadMerchantSession,
  saveMerchantSession,
  type MerchantSession,
} from "./session";

/** Ceiling on every outbound call. Without it a stalled 2G request never resolves — the kitchen board
 *  latches on "loading" forever with the header still showing "Connected" (LC-C02/LC-C04). Matches
 *  apps/admin's ADMIN_FETCH_TIMEOUT_MS; comfortably above the 2-5s degraded-link window the lane audits
 *  under, so a slow-but-alive request still completes. */
const MERCHANT_FETCH_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Any 401 from an authenticated call — a definitively-dead session or a domain-level rejection —
 *  should send the merchant back to /login, mirroring the pattern every page's initial-load effect
 *  already applies (LC-D##: mutation catches on Hours/Shop/Menu were missing this, unlike their own
 *  initial loads and the queue screen's dedicated listener, stranding the merchant on a screen with
 *  no way back to /login). Shared here so a mutation-catch call site can't independently forget it. */
export function isSessionExpiredError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/** Signs out and reports `true` on a session-expiry error, so a catch block can early-return with
 *  `if (redirectIfSessionExpired(err, signOut)) return;` instead of repeating the check + call. */
export function redirectIfSessionExpired(err: unknown, signOut: () => void): boolean {
  if (!isSessionExpiredError(err)) return false;
  signOut();
  return true;
}

interface OtpRequestResult {
  sent: true;
  channel: string;
  devCode?: string;
}

interface VerifyResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  profileId: string;
  role: string;
  needsProfile: boolean;
}

export function requestOtp(phone: string): Promise<OtpRequestResult> {
  return rawFetch<OtpRequestResult>("/auth/otp/request", { method: "POST", body: { phone } });
}

export async function verifyOtp(phone: string, code: string): Promise<VerifyResult> {
  const result = await rawFetch<VerifyResult>("/auth/otp/verify", { method: "POST", body: { phone, code } });
  saveMerchantSession({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
    issuedAt: Date.now(),
    profileId: result.profileId,
    role: result.role,
  });
  return result;
}

export interface MerchantProfile {
  id: string;
  name: string;
}

/** Resolves the caller's own merchant row (MerchantGuard-protected) — confirms the signed-in profile
 *  actually holds `role: "merchant"` server-side, not just what an earlier (possibly stale) token
 *  claims. Throws ApiError(403) if the account isn't a merchant. */
export function getMyMerchant(): Promise<MerchantProfile> {
  return authedFetch<MerchantProfile>("/merchant/me");
}

/** The exact two messages JwtAuthGuard throws on a missing/invalid bearer (jwt-auth.guard.ts) — only
 *  these are worth a refresh-and-retry; any other 401 is a domain rejection that must surface as-is. */
const AUTH_GUARD_401_MESSAGES = ["Missing bearer token", "Invalid or expired token"];

function isAuthGuard401(body: unknown): boolean {
  const message = (body as { message?: unknown } | null)?.message;
  return typeof message === "string" && AUTH_GUARD_401_MESSAGES.includes(message);
}

async function rawFetch<T>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(MERCHANT_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(0, "Couldn't reach the server — check the connection and try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      (typeof body?.message === "string" && body.message) ||
      (Array.isArray(body?.message) && body.message.join("; ")) ||
      (res.status === 503 ? "Restaurants isn't live on this account yet." : `Request failed (HTTP ${res.status}).`);
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/** LC-C03: `doRefresh` distinguishes a DEAD refresh token (401/403 — sign out, correctly) from a
 *  TRANSIENT failure (network error, timeout, 5xx — a blip on a 2G link, not a revoked token). Before
 *  this type existed both collapsed to the same `null`, and the caller cleared the session on either —
 *  a stalled/slow `/auth/refresh` request signed the merchant out mid-shift over nothing worse than a
 *  dead zone. Only `dead` may clear the session. */
type RefreshOutcome =
  | { kind: "refreshed"; session: MerchantSession }
  | { kind: "dead" }
  // LC-D##: `networkError` distinguishes a genuine network-level throw (the server was NOT reached)
  // from a live 5xx/non-ok response (the server WAS reached, just erroring) — both used to collapse
  // into one "transient" value with no way for the caller to tell them apart, so authedFetch never
  // reported the network-throw case into ReachabilityStore (the comment at its call site claimed
  // "this function's own request attempts... distinguish a genuine network-level failure," which is
  // false for a throw inside doRefresh's own fetch — nothing else observes it).
  | { kind: "transient"; networkError: boolean };

// Single-flight refresh: several near-simultaneous authed calls hitting a just-expired token must
// share one /auth/refresh round trip, not each mint their own (mirrors apps/mobile/src/api/client.ts).
let inflightRefresh: Promise<RefreshOutcome> | null = null;

async function refreshSession(refreshToken: string): Promise<RefreshOutcome> {
  if (!inflightRefresh) {
    inflightRefresh = doRefresh(refreshToken).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function doRefresh(refreshToken: string): Promise<RefreshOutcome> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(MERCHANT_FETCH_TIMEOUT_MS),
    });
  } catch {
    // Transient (network error, or the timeout above firing) — leave the session intact, the
    // caller's own request just fails this once; a later call gets another chance rather than being
    // signed out over a blip. Genuinely network-level: the server was not reached.
    return { kind: "transient", networkError: true };
  }
  if (res.status === 401 || res.status === 403) return { kind: "dead" }; // definitive: the refresh token is dead
  if (!res.ok) return { kind: "transient", networkError: false }; // transient server error — a real response is proof of life
  const data = (await res.json()) as { accessToken: string; refreshToken: string; expiresIn: number };
  const prior = loadMerchantSession();
  const next: MerchantSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    issuedAt: Date.now(),
    profileId: prior?.profileId ?? "",
    role: prior?.role ?? "merchant",
  };
  saveMerchantSession(next);
  return { kind: "refreshed", session: next };
}

/** Authenticated fetch with refresh-on-401 (single-flight) and sign-out on a definitively dead
 *  session. Callers should treat a thrown ApiError(401, "Your session expired...") as "send the
 *  merchant back to /login" — the alarm/queue shell does this at its top level.
 *
 *  LC-D04: every call reports into the shared `ReachabilityStore` (a network-level throw is
 *  `reportUnreachable()`, any completed response is `reportReachable()` — an HTTP error status is
 *  still proof the server was reached). Before this, only `use-queue-poll.ts` fed the store
 *  directly, so the CONNECTION LOST bar was structurally blind to a drop that happened while the
 *  merchant was on Menu/Shop/Hours/Statement (every one of which calls through here) — it would
 *  only surface once the next queue poll or 20s active probe (LC-C04) happened to catch it. Since
 *  every authenticated mutation routes through this one function, wiring it here closes the gap
 *  for the whole surface instead of at each call site. */
export async function authedFetch<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const session = loadMerchantSession();
  if (!session) throw new ApiError(401, "Not signed in.");
  const reachability = getReachabilityStore(API_BASE_URL);

  const attempt = async (token: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(MERCHANT_FETCH_TIMEOUT_MS),
    });

  let res: Response;
  try {
    res = await attempt(session.accessToken);
  } catch {
    reachability.reportUnreachable();
    throw new ApiError(0, "Couldn't reach the server — check the connection and try again.");
  }
  reachability.reportReachable();

  if (res.status === 401) {
    const body = await res.json().catch(() => null);
    if (!isAuthGuard401(body)) {
      throw new ApiError(401, (body as { message?: string } | null)?.message ?? "Rejected (401).");
    }
    const outcome = await refreshSession(session.refreshToken);
    if (outcome.kind === "dead") {
      clearMerchantSession();
      throw new ApiError(401, "Your session expired — sign in again.");
    }
    if (outcome.kind === "transient") {
      // Keep the session — a blip on /auth/refresh is not a revoked token (LC-C03). This one
      // request fails; the merchant stays signed in for the next poll/action to try again.
      // LC-D##: report into reachability using doRefresh's own network-vs-response distinction —
      // a network-level throw inside doRefresh's fetch is nothing else's to catch, so without this
      // the header could keep showing "Connected" for up to the 20s active-probe interval on a page
      // with no poller (Hours/Shop/Menu/Statement) while the link was actually down.
      if (outcome.networkError) reachability.reportUnreachable();
      else reachability.reportReachable();
      throw new ApiError(0, "Couldn't reach the server — check the connection and try again.");
    }
    try {
      res = await attempt(outcome.session.accessToken);
      reachability.reportReachable();
    } catch {
      reachability.reportUnreachable();
      throw new ApiError(0, "Couldn't reach the server — check the connection and try again.");
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      (typeof (body as { message?: unknown } | null)?.message === "string" && (body as { message: string }).message) ||
      (res.status === 503 ? "Restaurants isn't live on this account yet." : `Request failed (HTTP ${res.status}).`);
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}
