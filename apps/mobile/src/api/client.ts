import type { Session } from "../auth/session";
import { API_URL } from "../config";

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
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  /** Attach the bearer token (default true). */
  auth?: boolean;
}

// Single-flight: concurrent 401s (the order screen runs two 4s pollers) share ONE refresh. The
// backend rotates refresh tokens — without this, the second request would refresh with a token the
// first just revoked and get a false sign-out.
let inflightRefresh: Promise<Session | null> | null = null;

export async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const session = hooks?.getSession() ?? null;

  const send = (accessToken?: string): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send(session?.accessToken);

  if (res.status === 401 && auth && session?.refreshToken) {
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
    throw new ApiError(res.status, friendlyMessage(res.status, text));
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
    const res = await fetch(`${API_URL}/auth/refresh`, {
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
