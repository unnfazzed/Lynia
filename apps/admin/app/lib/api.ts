/**
 * Server-side admin API client. Reads API_BASE_URL + ADMIN_API_TOKEN (an admin JWT) from the
 * environment. Returns null/false when unconfigured or unreachable so pages degrade gracefully.
 */
const base = (): string | undefined => process.env.API_BASE_URL;
const authHeaders = (): Record<string, string> => {
  const token = process.env.ADMIN_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function adminFetch<T>(path: string): Promise<T | null> {
  const b = base();
  if (!b) return null;
  try {
    const res = await fetch(`${b}${path}`, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
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
