/**
 * Server-side admin API client. Reads API_BASE_URL + ADMIN_API_TOKEN (an admin JWT) from the
 * environment.
 *
 * `adminFetchResult` distinguishes WHY a read produced no data so the console can render an accurate
 * operator diagnostic instead of collapsing every case into "API not connected" (QA D-3):
 *   - `unconfigured`     — API_BASE_URL is unset (the demo/offline path).
 *   - `unreachable`      — network error reaching the API.
 *   - `not-implemented`  — the endpoint 404'd (API is healthy, this feature just hasn't shipped).
 *   - `error`            — any other non-ok response.
 * `adminFetch` keeps the legacy `T | null` shape (data or absent) for callers that don't need the
 * reason; it is a thin wrapper over `adminFetchResult`.
 */
const base = (): string | undefined => process.env.API_BASE_URL;
const authHeaders = (): Record<string, string> => {
  const token = process.env.ADMIN_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export type AdminReason = "unconfigured" | "unreachable" | "not-implemented" | "error";
export type AdminResult<T> = { data: T } | { reason: AdminReason };

export async function adminFetchResult<T>(path: string): Promise<AdminResult<T>> {
  const b = base();
  if (!b) return { reason: "unconfigured" };
  try {
    const res = await fetch(`${b}${path}`, { headers: authHeaders(), cache: "no-store" });
    if (res.status === 404) return { reason: "not-implemented" };
    if (!res.ok) return { reason: "error" };
    return { data: (await res.json()) as T };
  } catch {
    return { reason: "unreachable" };
  }
}

export async function adminFetch<T>(path: string): Promise<T | null> {
  const r = await adminFetchResult<T>(path);
  return "data" in r ? r.data : null;
}

export async function adminPost(path: string, body: unknown): Promise<boolean> {
  const b = base();
  if (!b) return false;
  try {
    const res = await fetch(`${b}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
