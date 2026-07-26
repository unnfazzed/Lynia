/**
 * Server-side admin API client. Reads API_BASE_URL + ADMIN_API_TOKEN (an admin JWT) from the
 * environment.
 *
 * `adminFetchResult` distinguishes WHY a read produced no data so the console can render an accurate
 * operator diagnostic instead of collapsing every case into "API not connected" (QA D-3):
 *   - `unconfigured`     — API_BASE_URL is unset (the demo/offline path).
 *   - `unreachable`      — network error reaching the API.
 *   - `not-implemented`  — the ROUTE 404'd (no controller matches — API is healthy, this endpoint
 *                          just hasn't shipped).
 *   - `not-found`        — the route matched and the API deliberately 404'd because the specific
 *                          record (order/rider/customer/issue id) doesn't exist — a bad link, a
 *                          purged row, or a typo, NOT an unshipped feature.
 *   - `error`            — any other non-ok response.
 * `adminFetch` keeps the legacy `T | null` shape (data or absent) for callers that don't need the
 * reason; it is a thin wrapper over `adminFetchResult`.
 */
import { headers } from "next/headers";

const base = (): string | undefined => process.env.API_BASE_URL;

/** Ceiling on every outbound call to the API. Without it a stalled proxy/API on a weak connection
 *  blocks the whole SSR render indefinitely — the `loading.tsx` skeletons never resolve into either
 *  data or an honest error, so the founder just sees an indefinite spinner. Every other outbound call
 *  in this codebase (mobile client, Didit, WhatsApp, Places) already has a bounded timeout; this one
 *  didn't. An abort surfaces as `unreachable`, reusing the existing offline/error UI. */
const ADMIN_FETCH_TIMEOUT_MS = 10_000;

/**
 * Bearer the shared admin token, PLUS forward the real human operator the fail-closed console
 * middleware asserted (via IAP) as `x-lynia-operator`, re-emitted here as `X-Operator`. The API's
 * admin routes attribute the audit row to that operator instead of the shared token's subject — so the
 * trail says which human suspended/banned/refunded, not just "the console". Best-effort: absent on the
 * offline/demo path or outside a request scope, where the API falls back to the token subject.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const token = process.env.ADMIN_API_TOKEN;
  const h: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const operator = (await headers()).get("x-lynia-operator");
    if (operator) h["X-Operator"] = operator;
  } catch {
    /* not in a request scope (e.g. build-time) — no operator to forward */
  }
  return h;
}

export type AdminReason = "unconfigured" | "unreachable" | "not-implemented" | "not-found" | "error";
export type AdminResult<T> = { data: T } | { reason: AdminReason };

/** Nest's own unmatched-route 404 (no controller method matches this path) always has this exact
 *  message shape: `Cannot GET /admin/orders/abc`. A domain `NotFoundException("Order not found")`
 *  thrown BY a matched controller carries its own descriptive message instead — never this one. */
function isUnmatchedRoute404(body: unknown): boolean {
  const message = (body as { message?: unknown } | null)?.message;
  return typeof message === "string" && /^Cannot [A-Z]+ /.test(message);
}

export async function adminFetchResult<T>(path: string): Promise<AdminResult<T>> {
  const b = base();
  if (!b) return { reason: "unconfigured" };
  try {
    const res = await fetch(`${b}${path}`, { headers: await authHeaders(), cache: "no-store", signal: AbortSignal.timeout(ADMIN_FETCH_TIMEOUT_MS) });
    if (res.status === 404) {
      const body = await res.json().catch(() => null);
      // A body that didn't even parse as JSON isn't the API's own domain 404 — treat conservatively
      // as the route simply not existing, the prior (safe) behavior.
      return { reason: body === null || isUnmatchedRoute404(body) ? "not-implemented" : "not-found" };
    }
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

/**
 * Result of a write. Distinguishes an intentional offline no-op (`unconfigured` — API_BASE_URL unset,
 * the demo path) from a genuine failure (`unreachable` network error, or `http` non-2xx). Callers that
 * must not fail-open (audit / compliance writes) can treat a real failure as an error while leaving the
 * offline path a silent no-op. `adminPost` keeps the legacy boolean shape for callers that only need
 * ok/not-ok (and which already gate behind a live-connection check).
 */
export type AdminPostResult =
  | { ok: true }
  | { ok: false; reason: "unconfigured" }
  | { ok: false; reason: "unreachable" }
  | { ok: false; reason: "http"; status: number; message?: string };

/** Nest's standard exception body shape: `{ statusCode, message, error }`. `message` is a plain string
 *  for a single `throw new XException("...")`, or a string array for a class-validator failure. */
function extractHttpMessage(body: unknown): string | undefined {
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && message.every((m) => typeof m === "string")) return message.join("; ");
  return undefined;
}

export async function adminPostResult(path: string, body: unknown): Promise<AdminPostResult> {
  const b = base();
  if (!b) return { ok: false, reason: "unconfigured" };
  try {
    const res = await fetch(`${b}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      cache: "no-store",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ADMIN_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const message = extractHttpMessage(await res.json().catch(() => null));
      return { ok: false, reason: "http", status: res.status, message };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

export async function adminPost(path: string, body: unknown): Promise<boolean> {
  const r = await adminPostResult(path, body);
  return r.ok;
}

/**
 * UX26-02: the single funnel every admin write action's failure path should call — classifies WHY a
 * write failed instead of the one-size-fits-all "check API_BASE_URL / admin token" text that used to
 * mask an expired session, a stale-row business rejection, or a real server error alike (the class
 * UX16-04 first fixed for `acknowledgeSos`, generalized here so the sweep doesn't have to re-find each
 * sibling by hand). Prefers the API's own validation message (e.g. "Only an undelivered order can be
 * adjudicated") when the server sent one — that message is deliberately operator-actionable.
 */
export function describeAdminPostFailure(res: Exclude<AdminPostResult, { ok: true }>): string {
  if (res.reason === "unconfigured") return "The admin API isn't configured (API_BASE_URL unset).";
  if (res.reason === "unreachable") return "Couldn't reach the server — try again.";
  if (res.status === 401 || res.status === 403) return "Your session may have expired — reload the page.";
  return res.message ?? `The server rejected this (HTTP ${res.status}) — try again or check with engineering.`;
}
