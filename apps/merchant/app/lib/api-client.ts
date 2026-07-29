import { API_BASE_URL } from "./config";
import {
  clearMerchantSession,
  loadMerchantSession,
  saveMerchantSession,
  type MerchantSession,
} from "./session";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
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

// Single-flight refresh: several near-simultaneous authed calls hitting a just-expired token must
// share one /auth/refresh round trip, not each mint their own (mirrors apps/mobile/src/api/client.ts).
let inflightRefresh: Promise<MerchantSession | null> | null = null;

async function refreshSession(refreshToken: string): Promise<MerchantSession | null> {
  if (!inflightRefresh) {
    inflightRefresh = doRefresh(refreshToken).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function doRefresh(refreshToken: string): Promise<MerchantSession | null> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
  } catch {
    // Transient (network) failure — leave the session intact, the caller's own request just fails
    // this once; a later call gets another chance rather than being signed out over a blip.
    return null;
  }
  if (res.status === 401 || res.status === 403) return null; // definitive: the refresh token is dead
  if (!res.ok) return null; // transient server error — keep the session, retry later
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
  return next;
}

/** Authenticated fetch with refresh-on-401 (single-flight) and sign-out on a definitively dead
 *  session. Callers should treat a thrown ApiError(401, "Your session expired...") as "send the
 *  merchant back to /login" — the alarm/queue shell does this at its top level. */
export async function authedFetch<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const session = loadMerchantSession();
  if (!session) throw new ApiError(401, "Not signed in.");

  const attempt = async (token: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });

  let res: Response;
  try {
    res = await attempt(session.accessToken);
  } catch {
    throw new ApiError(0, "Couldn't reach the server — check the connection and try again.");
  }

  if (res.status === 401) {
    const body = await res.json().catch(() => null);
    if (!isAuthGuard401(body)) {
      throw new ApiError(401, (body as { message?: string } | null)?.message ?? "Rejected (401).");
    }
    const refreshed = await refreshSession(session.refreshToken);
    if (!refreshed) {
      clearMerchantSession();
      throw new ApiError(401, "Your session expired — sign in again.");
    }
    try {
      res = await attempt(refreshed.accessToken);
    } catch {
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
