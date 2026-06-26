import type { Session } from "../auth/session";
import { API_URL } from "../config";

/** Hooks the AuthProvider registers so the client can read/rotate tokens without a circular import. */
interface ApiHooks {
  getSession: () => Session | null;
  onTokens: (s: Session) => void;
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

  // One transparent refresh on 401, then retry; on failure, sign out.
  if (res.status === 401 && auth && session?.refreshToken) {
    const refreshed = await tryRefresh(session.refreshToken);
    if (refreshed) {
      hooks?.onTokens(refreshed);
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
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function tryRefresh(refreshToken: string): Promise<Session | null> {
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
    return { ...current, accessToken: data.accessToken, refreshToken: data.refreshToken, expiresIn: data.expiresIn };
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
