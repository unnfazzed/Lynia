import { Platform } from "react-native";
import { jwtTimes } from "../auth/jwt-exp";
import { getDeviceId, loadSession, type Session } from "../auth/session";
import { API_CONFIG_ERROR, API_URL } from "../config";
import { STANDARD_TIMEOUT_MS } from "../net/network-policy";
import { reportReachable, reportUnreachable } from "../net/reachability";
import { CLIENT_METRICS_PATH, enqueueApiFetch } from "../telemetry/rum";
import { fetchSignal } from "../net/fetch-signal";

/** Hooks the AuthProvider registers so the client can read/rotate tokens without a circular import. */
interface ApiHooks {
  getSession: () => Session | null;
  onTokens: (s: Session) => Promise<void>;
  onSignOut: () => void;
}
let hooks: ApiHooks | null = null;
export function configureApi(h: ApiHooks): void {
  hooks = h;
}

/**
 * LC-C14: the access token the session holds RIGHT NOW (rotated in place by the refresh path below),
 * or null with no session / before the AuthProvider registered. For callers that must not replay a
 * token they captured earlier — the realtime socket's `auth` callback reads this on every reconnect.
 */
export function currentAccessToken(): string | null {
  return hooks?.getSession()?.accessToken ?? null;
}

/** The account the session holds RIGHT NOW, or null when signed out (or before the AuthProvider registered).
 *  Per-account device drafts (Send a parcel's, U17) key on it and write nothing without it. */
export function currentProfileId(): string | null {
  return hooks?.getSession()?.profileId ?? null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Machine-readable reason lifted off the error body (e.g. an online-gate `on_hold`, a corridor
     *  `out_of_area`), when the API tags one — null otherwise. Domain screens branch on this over the
     *  human `message`, which is copy and can change. */
    public readonly code: string | null = null,
    /** Seconds until a rate limit lets the caller try again (the API's `retryAfter` on a 429), when it
     *  says — null otherwise. */
    public readonly retryAfter: number | null = null,
    /** The parsed error body, for the rare screen that needs a field beyond `code` (null if not JSON). */
    public readonly body: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /**
   * The per-error half of the retry taxonomy (docs/ARCHITECTURE.md §Retry ownership). `true` only for
   * a dropped link (status 0) or a transient server 5xx — cases a retry could plausibly clear. A 4xx is
   * a deterministic answer (auth, validation, a domain conflict) that a retry would only repeat, wasting
   * the scarce bandwidth this app is built around. The retry *policy* (shouldRetry for reads; the
   * mutation default for writes) decides whether to act on this classification — it never overrides it.
   */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

/** The error body as JSON, or null. */
function errorBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Lift a machine-readable reason code off a Nest error body, if present. Checks the fields the API is
 *  likely to carry it in (`code` / `reason` / `error`); returns null when the body has none / isn't JSON. */
function errorCode(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { code?: unknown; reason?: unknown; error?: unknown };
    for (const v of [parsed.code, parsed.reason, parsed.error]) {
      if (typeof v === "string" && v.length > 0) return v;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

/** The `retryAfter` seconds a rate-limited (429) Nest error body carries, if present and sane. */
function errorRetryAfter(text: string): number | null {
  try {
    const v = (JSON.parse(text) as { retryAfter?: unknown } | null)?.retryAfter;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Attach the bearer token (default true). */
  auth?: boolean;
}

/**
 * A response whose body has ALREADY been read, inside the request deadline (P35). `headers` may be
 * absent on test stubs, hence optional.
 */
interface FetchedResponse {
  status: number;
  ok: boolean;
  headers?: { get(name: string): string | null } | null;
  /** The body as text — "" for 204/304 and for an error body that couldn't be read. */
  text: string;
}

// On a constrained mobile link (the target market) a request to the remote API can hang for the
// OS default (tens of seconds) with only an in-button spinner showing. Bound every request so a
// slow/stalled network fails into the friendly-error path within a few seconds instead of hanging.
// STANDARD_TIMEOUT_MS is the central policy (net/network-policy.ts, C-O2) — not a local constant.
//
// P35: the deadline covers the BODY too. React Native's fetch resolves only once the whole body is in
// (XHR onload), but a browser's resolves at the response HEADERS — clearing the timer there left a body
// that stalled mid-download on app.lyniago.com hanging the screen until the browser's socket timeout
// (minutes). The body is now read here, with the abort still armed. Native behaviour is unchanged.
async function fetchWithTimeout(input: string, init: RequestInit): Promise<FetchedResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STANDARD_TIMEOUT_MS);
  try {
    const res = await fetch(input, { ...init, signal: fetchSignal(controller) });
    // We got an HTTP response — even a 4xx/5xx proves the link is alive. Clears the offline state and
    // cancels the recovery probe, so a passing request is all it takes to come back online.
    reportReachable();
    let text = "";
    if (res.status !== 204 && res.status !== 304) {
      // An unreadable ERROR body degrades to "" (the status alone still answers the caller); an
      // unreadable SUCCESS body is a stalled/dropped link and fails like one, below. So does an error
      // body the DEADLINE cut off: "" would read a stalled auth-guard 401 as a domain 401 (no refresh,
      // no offline flag), so an abort is rethrown whatever the status.
      text = res.ok
        ? await res.text()
        : await res.text().catch((err: unknown) => {
            if (controller.signal.aborted) throw err;
            return "";
          });
    }
    return { status: res.status, ok: res.ok, headers: res.headers, text };
  } catch (err) {
    // No response at all (DNS / connection refused / aborted timeout): the network is down or stalled.
    // Flip the app to offline so React Query stops hammering the dead link and the banner shows, then
    // let the /health probe drive recovery. Still throws the same friendly ApiError the caller expects.
    reportUnreachable();
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(0, "The network is slow — check your connection and try again.");
    }
    throw new ApiError(0, "Can't reach LyniaGo — check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Conditional GETs — the bandwidth half of the polling loops. The API stamps an ETag on every JSON
// body and answers a matching If-None-Match with an EMPTY 304 (Express weak ETags, pinned in
// apps/api/src/main.ts). We remember the last ETag + body per GET path and revalidate instead of
// re-downloading: an unchanged 15s auction poll / 30s home poll / 5s KYC poll costs headers only
// (~0.2 KB) instead of the full JSON — the difference between "polling" and "re-downloading the
// app's state on a loop" on metered 2G/3G. Memory-only by design: it is a REVALIDATION store, not
// an offline cache (React Query owns offline warm paint), and it's cleared on sign-out so a shared
// device can't serve one user's bodies to the next (S1).
// ---------------------------------------------------------------------------
const MAX_ETAG_ENTRIES = 100;
const etagStore = new Map<string, { etag: string; body: string }>();

/** Forget every stored ETag/body. Called on BOTH sign-out paths (deliberate + token-expiry). */
export function clearConditionalCache(): void {
  etagStore.clear();
}

function rememberEtag(path: string, etag: string, body: string): void {
  if (!etagStore.has(path) && etagStore.size >= MAX_ETAG_ENTRIES) {
    // Bounded: drop the oldest-inserted entry (Map preserves insertion order). The hot pollers
    // re-insert on every 200, so they stay resident; one-off screens age out.
    const oldest = etagStore.keys().next().value;
    if (oldest !== undefined) etagStore.delete(oldest);
  }
  etagStore.delete(path); // delete-then-set so re-validated paths count as freshly inserted
  etagStore.set(path, { etag, body });
}

// Single-flight: concurrent 401s (the order screen runs two 4s pollers) share ONE refresh. The
// backend rotates refresh tokens — without this, the second request would refresh with a token the
// first just revoked and get a false sign-out.
let inflightRefresh: Promise<Session | null> | null = null;

/**
 * Every REST call routes through here, so it's the one place to time round-trips for client RUM. The
 * timing is skew-free (start + end both `Date.now()` on-device) — the primary latency signal. We time
 * whether the request succeeds or throws (a stalled network is exactly what we want to see), but we
 * EXCLUDE the `/client-metrics` POST itself so telemetry doesn't measure telemetry (no feedback loop).
 */
export async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  if (path === CLIENT_METRICS_PATH) return apiFetchInner<T>(path, opts);
  const startedAt = Date.now();
  try {
    return await apiFetchInner<T>(path, opts);
  } finally {
    // Recorded under the app's current active role (set by the realtime hooks), not a hardcoded one.
    enqueueApiFetch(Date.now() - startedAt);
  }
}

async function apiFetchInner<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  // A misconfigured release build (no real API URL) fails HERE, per request, with a message naming
  // the fix — never at module scope, where a throw predates every error boundary and kills the boot
  // (MOB-BOOT-04). Status 400: deterministic, so the retry policy won't hammer a dead constant.
  if (API_CONFIG_ERROR) throw new ApiError(400, API_CONFIG_ERROR);
  const { method = "GET", body, auth = true } = opts;
  const session = hooks?.getSession() ?? null;

  // Conditional-GET: hold the entry captured NOW (not a re-lookup at response time), so a concurrent
  // request evicting this path from the bounded store can't leave a 304 with no body to serve.
  const conditional = method === "GET" ? etagStore.get(path) : undefined;

  // KB-IDENTITY-BINDING L1: attach the stable per-install device id so the server can throttle per-device
  // signup + surface the recycle signal. getDeviceId() already falls back to a process-lifetime id on a
  // keystore failure rather than throwing (session.ts) — this catch is a last-resort backstop only; the
  // server treats a genuinely missing id as an older client and leaves the device logic inert, but new
  // accounts now hard-require it, so silently omitting the header here would re-open an onboarding dead
  // end (see session.ts's getDeviceId for the full story).
  const deviceId = await getDeviceId().catch(() => null);

  const send = (accessToken?: string): Promise<FetchedResponse> =>
    fetchWithTimeout(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(deviceId ? { "x-device-id": deviceId } : {}),
        ...(conditional ? { "If-None-Match": conditional.etag } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  // P09: the 15-minute access token has expired on almost every cold start. Refresh it BEFORE sending
  // instead of spending a 401 round trip per boot request (and queueing the refresh behind them at
  // Android's 5-per-host limit). Single-flight with the reactive path below, so the whole boot burst
  // waits on ONE refresh in JS.
  //  - A refresh that fails TRANSIENTLY (status-0 ApiError: a flaky link, a 5xx) rejects the request the
  //    same retryable way the reactive path does — sending a token we know is expired over that same
  //    link would only buy a second timeout and a second refresh. The session is left intact.
  //  - A DEFINITIVE rejection (null) does not sign out here: the request still goes out with the old
  //    token (a skewed clock may have misjudged it). If the API answers with the auth guard's 401, the
  //    reactive path below signs out without asking the refresh endpoint a second time.
  let active = session;
  let proactiveRejected = false;
  if (auth && active?.refreshToken && accessTokenNeedsRefresh(active.accessToken)) {
    const refreshed = await refreshSession(active.refreshToken);
    if (refreshed) active = refreshed;
    else proactiveRejected = true;
  }

  let res = await send(active?.accessToken);

  if (res.status === 401 && auth && active?.refreshToken) {
    // Not every 401 is an expired session: domain code answers 401 too (a wrong delivery code from
    // the order-lifecycle service). Refresh-and-retry on those would RE-SUBMIT the business action
    // — a wrong OTP would burn a second attempt toward the lockout — so only the auth guard's own
    // 401s take the refresh path; everything else surfaces as the domain error it is.
    const text = res.text;
    if (!isAuthGuard401(text)) {
      // Carry the machine-readable code (same as the generic error path below) so domain screens can
      // branch on err.code for a 401-tagged business error (e.g. a wrong delivery code).
      throw new ApiError(401, friendlyMessage(401, text), errorCode(text));
    }
    // refreshSession resolves to null ONLY on a definitive rejection (the refresh endpoint answered
    // 401/403 — the token is genuinely revoked/invalid); that's the sole case that signs the user out.
    // A transient failure (network/timeout/5xx/429) instead REJECTS with a status-0 ApiError, which
    // propagates out of here untouched — the request fails as an ordinary retryable network error and
    // the session is left intact, so a flaky link can't force a mid-delivery re-auth.
    const refreshed = proactiveRejected ? null : await refreshSession(active.refreshToken);
    if (refreshed) {
      res = await send(refreshed.accessToken);
    } else {
      // Token-expiry sign-out: scrub the conditional-GET store with the session (S1 — a shared
      // device must not revalidate the previous user's cached bodies into the next session).
      clearConditionalCache();
      hooks?.onSignOut();
      throw new ApiError(401, "Your session expired — sign in again.");
    }
  }

  // 304 Not Modified: the body we already hold is still current — serve it without downloading a
  // byte. Only reachable when WE sent the If-None-Match (guarded on `conditional`); a stray 304
  // without one falls through to the error path like any other non-2xx.
  if (res.status === 304 && conditional) {
    return JSON.parse(conditional.body) as T;
  }

  if (!res.ok) {
    const text = res.text;
    throw new ApiError(res.status, friendlyMessage(res.status, text), errorCode(text), errorRetryAfter(text), errorBody(text));
  }
  // Parse via text so an empty body (e.g. /orders/mine/active with no job) doesn't throw — it
  // yields undefined, and a literal "null" parses to null, both of which callers treat as "none".
  if (res.status === 204) return undefined as T;
  const text = res.text;
  // Remember the validator for the next poll of this path. `?.` tolerates header-less Response
  // stubs in tests; a response with no ETag simply isn't revalidatable and is served fresh next time.
  if (method === "GET" && text) {
    const etag = res.headers?.get("etag");
    if (etag) rememberEtag(path, etag, text);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---------------------------------------------------------------------------
// P09 — proactive refresh. A token is refreshed before sending when its `exp` is within
// REFRESH_LEEWAY_S of the SERVER's clock, estimated as the device clock minus the skew learned from the
// `iat` of the last token this process received. Without the skew correction a phone whose clock runs
// ahead (common: manual time, no network time) would see every fresh token as expired and refresh
// before every request; with it, at most the first request after launch pays one extra refresh.
// ---------------------------------------------------------------------------
const REFRESH_LEEWAY_S = 30;
/** Device clock minus server clock, in ms, learned from the last refresh. 0 until then. */
let clockSkewMs = 0;
/** Set when a just-refreshed token still looks expired and carries no `iat` to correct by — proactive
 *  refresh is then off for the rest of the process (the reactive path still works). */
let proactiveDisabled = false;

function accessTokenNeedsRefresh(accessToken: string | null | undefined): boolean {
  if (proactiveDisabled) return false;
  const t = jwtTimes(accessToken);
  if (!t) return false;
  return (Date.now() - clockSkewMs) / 1000 >= t.exp - REFRESH_LEEWAY_S;
}

function learnClockSkew(accessToken: string): void {
  const t = jwtTimes(accessToken);
  if (!t) return;
  if (t.iat !== null) {
    clockSkewMs = Date.now() - t.iat * 1000;
    return;
  }
  if (accessTokenNeedsRefresh(accessToken)) proactiveDisabled = true;
}

/** Test seam: forget the learned clock skew. */
export function __resetTokenClock(): void {
  clockSkewMs = 0;
  proactiveDisabled = false;
}

/**
 * Refresh the session, coalescing concurrent callers and tolerating rotation: if another request
 * already rotated the token under us, return the current session instead of refreshing again.
 */
async function refreshSession(staleToken: string): Promise<Session | null> {
  const current = hooks?.getSession();
  if (current && current.refreshToken !== staleToken) return current; // someone else already rotated
  if (!inflightRefresh) {
    inflightRefresh = refreshLatest(staleToken).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

/**
 * U15 (web): every tab of app.lyniago.com shares ONE stored session but holds its own copy in memory. A
 * tab left in the background still holds a refresh token another tab has since rotated (twice, after ~30
 * minutes of use): presenting it is a definitive 401, and the sign-out that followed deleted the shared
 * session and ran clearDeviceState over the shared storage — signing the customer out of every tab and
 * wiping the other tab's saved places, deliver-to and draft.
 *
 * So on the web the stored session is read before refreshing. When it holds a NEWER refresh token for the
 * same account, that one is adopted (handed to the AuthProvider, which persists the same value back) and,
 * if its access token has also run out, refreshed in place of the stale one. A definitive rejection is
 * checked against storage once more, for the tab that rotated in the very moment this one asked.
 * Native apps have one process, so nothing changes there.
 */
async function refreshLatest(staleToken: string): Promise<Session | null> {
  if (Platform.OS !== "web") return doRefresh(staleToken);
  let presented = staleToken;
  const adopted = await adoptStoredSession(presented);
  if (adopted) {
    if (!accessTokenNeedsRefresh(adopted.accessToken)) return adopted;
    presented = adopted.refreshToken;
  }
  const refreshed = await doRefresh(presented);
  if (refreshed) return refreshed;
  return adoptStoredSession(presented);
}

/** The stored session when it carries a newer refresh token for the account this tab holds, applied. */
async function adoptStoredSession(presented: string): Promise<Session | null> {
  const current = hooks?.getSession();
  if (!current) return null;
  const stored = await loadSession();
  if (!stored || stored.profileId !== current.profileId || !stored.refreshToken || stored.refreshToken === presented) return null;
  // Rotated in this tab meanwhile (another request of ours): already applied.
  if (hooks?.getSession()?.refreshToken === stored.refreshToken) return stored;
  await hooks?.onTokens(stored);
  return stored;
}

async function doRefresh(refreshToken: string): Promise<Session | null> {
  // Deliberately NO try/catch around the fetch: fetchWithTimeout already throws ApiError(0) on a
  // network failure / timeout, and a transient link failure must NOT masquerade as a revoked token.
  // Letting it propagate leaves the session (and the refresh token, which may still be perfectly
  // valid) intact — see the caller: only a resolved `null` signs the user out, a rejection doesn't.
  const res = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  // Definitive rejection: ONLY a 401/403 from the refresh endpoint proves the refresh token is
  // genuinely invalid or revoked. That's the one outcome that returns null → signs the user out.
  // …and only when the body IS the API's own error envelope. A 401/403 page from something in front of
  // the API — a WAF or proxy block page, a captive portal, a load balancer's empty reply — says nothing
  // about the token; signing out on it would wipe a valid session and send the user back through OTP.
  if (res.status === 401 || res.status === 403) {
    if (isApiErrorBody(res.status, res.text)) return null;
    throw new ApiError(0, "The network is unstable — check your connection and try again.");
  }
  // Any OTHER non-OK status (a proxy/LB 502/504, a 500, a 429) is transient, NOT a rejection: the
  // token is very likely still valid. Surface it as the same status-0 network error a stalled link
  // produces, so the caller fails the request retryably instead of forcibly signing the user out.
  if (!res.ok) throw new ApiError(0, "The network is unstable — check your connection and try again.");
  const data = JSON.parse(res.text) as { accessToken: string; refreshToken: string; expiresIn: number };
  const current = hooks?.getSession();
  if (!current) return null;
  learnClockSkew(data.accessToken);
  const next: Session = {
    ...current,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
  };
  // Persist BEFORE returning so a crash can't lose the rotated (single-use) refresh token.
  await hooks?.onTokens(next);
  return next;
}

// The JwtAuthGuard's only two messages (apps/api/src/auth/jwt-auth.guard.ts) — the discriminator
// between "your token is bad" (refresh and retry is safe) and a domain 401 (it isn't). An
// unparseable body counts as domain: when in doubt, DON'T re-send — a retry can double-submit.
const AUTH_GUARD_401_MESSAGES = new Set(["Missing bearer token", "Invalid or expired token"]);

function isAuthGuard401(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { message?: unknown };
    return typeof parsed.message === "string" && AUTH_GUARD_401_MESSAGES.has(parsed.message);
  } catch {
    return false;
  }
}

/** True when `text` is THIS API's error envelope for `status`: every HttpException it throws reaches the
 *  client as `{ statusCode, message, … }` (apps/api/src/common/all-exceptions.filter.ts; pinned for this
 *  route by apps/api/src/auth/refresh-contract.e2e.spec.ts). Requiring the matching `statusCode`, not just
 *  a `message`, keeps a gateway's own `{"message":"Unauthorized"}` from counting as a revocation. */
function isApiErrorBody(status: number, text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { statusCode?: unknown; message?: unknown } | null;
    return parsed?.statusCode === status && (typeof parsed.message === "string" || Array.isArray(parsed.message));
  } catch {
    return false;
  }
}

function friendlyMessage(status: number, text: string): string {
  // The API throws Nest exceptions whose body is { message } (string or array). An API from before
  // E2E 2026-10-05 FS-3 answered its 429s with a bare JSON string instead — that string IS the message,
  // and reading it as "no message" showed a rate limit as "check your connection".
  try {
    const parsed = JSON.parse(text) as { message?: string | string[] } | string | null;
    if (typeof parsed === "string") {
      if (parsed) return parsed;
    } else if (parsed) {
      if (Array.isArray(parsed.message)) return parsed.message.join(", ");
      if (parsed.message) return parsed.message;
    }
  } catch {
    /* not JSON */
  }
  return "Couldn't reach LyniaGo. Check your connection and try again.";
}
