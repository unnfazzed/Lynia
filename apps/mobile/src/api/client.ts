import type { Session } from "../auth/session";
import { API_URL } from "../config";
import { CLIENT_METRICS_PATH, enqueueApiFetch } from "../telemetry/rum";

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

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Machine-readable reason lifted off the error body (e.g. an online-gate `on_hold`, a corridor
     *  `out_of_area`), when the API tags one — null otherwise. Domain screens branch on this over the
     *  human `message`, which is copy and can change. */
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
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

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Attach the bearer token (default true). */
  auth?: boolean;
}

// On a constrained mobile link (the target market) a request to the remote API can hang for the
// OS default (tens of seconds) with only an in-button spinner showing. Bound every request so a
// slow/stalled network fails into the friendly-error path within a few seconds instead of hanging.
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(0, "The network is slow — check your connection and try again.");
    }
    throw new ApiError(0, "Can't reach Lynia — check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
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
  const { method = "GET", body, auth = true } = opts;
  const session = hooks?.getSession() ?? null;

  const send = (accessToken?: string): Promise<Response> =>
    fetchWithTimeout(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send(session?.accessToken);

  if (res.status === 401 && auth && session?.refreshToken) {
    // Not every 401 is an expired session: domain code answers 401 too (a wrong delivery code from
    // the order-lifecycle service). Refresh-and-retry on those would RE-SUBMIT the business action
    // — a wrong OTP would burn a second attempt toward the lockout — so only the auth guard's own
    // 401s take the refresh path; everything else surfaces as the domain error it is.
    const text = await res.text().catch(() => "");
    if (!isAuthGuard401(text)) {
      throw new ApiError(401, friendlyMessage(401, text));
    }
    const refreshed = await refreshSession(session.refreshToken);
    if (refreshed) {
      res = await send(refreshed.accessToken);
    } else {
      hooks?.onSignOut();
      throw new ApiError(401, "Your session expired — sign in again.");
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, friendlyMessage(res.status, text), errorCode(text));
  }
  // Parse via text so an empty body (e.g. /orders/mine/active with no job) doesn't throw — it
  // yields undefined, and a literal "null" parses to null, both of which callers treat as "none".
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Refresh the session, coalescing concurrent callers and tolerating rotation: if another request
 * already rotated the token under us, return the current session instead of refreshing again.
 */
async function refreshSession(staleToken: string): Promise<Session | null> {
  const current = hooks?.getSession();
  if (current && current.refreshToken !== staleToken) return current; // someone else already rotated
  if (!inflightRefresh) {
    inflightRefresh = doRefresh(staleToken).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function doRefresh(refreshToken: string): Promise<Session | null> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string; refreshToken: string; expiresIn: number };
    const current = hooks?.getSession();
    if (!current) return null;
    const next: Session = {
      ...current,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
    };
    // Persist BEFORE returning so a crash can't lose the rotated (single-use) refresh token.
    await hooks?.onTokens(next);
    return next;
  } catch {
    return null;
  }
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

function friendlyMessage(status: number, text: string): string {
  // The API throws Nest exceptions whose body is { message } (string or array).
  try {
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(", ");
    if (parsed.message) return parsed.message;
  } catch {
    /* not JSON */
  }
  return `Request failed (${status}).`;
}
