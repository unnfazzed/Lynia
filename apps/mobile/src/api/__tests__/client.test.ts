import { __resetReachability } from "../../net/reachability";
import type { Session } from "../../auth/session";
import { ApiError, apiFetch, clearConditionalCache, configureApi } from "../client";

/**
 * These cover the refresh-and-retry path in apiFetch, whose one job here is to tell apart a genuinely
 * revoked refresh token (sign the user out) from a transient link failure (fail the request, keep the
 * session). The distinction matters acutely on the target market's flaky links: a false sign-out wipes
 * device state (order draft, delivery codes, KYC) and forces a full WhatsApp-OTP re-auth mid-delivery.
 */

const OLD_ACCESS = "old-access";
const NEW_ACCESS = "new-access";

function baseSession(): Session {
  return {
    accessToken: OLD_ACCESS,
    refreshToken: "old-refresh",
    expiresIn: 3600,
    profileId: "p1",
    role: "customer",
  };
}

/** A minimal Response stub — only the fields apiFetchInner/doRefresh touch. Pass `headers` to
 *  exercise the conditional-GET path (lookup is case-insensitive, like real Headers). */
function makeResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const lower = Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
    ...(headers ? { headers: { get: (name: string) => lower[name.toLowerCase()] ?? null } } : {}),
  } as unknown as Response;
}

/** The exact body the JwtAuthGuard returns for a stale access token — the only 401 apiFetch refreshes on. */
const AUTH_GUARD_401 = makeResponse(401, { message: "Invalid or expired token" });

/** Drain all queued microtasks by yielding to a macrotask — lets in-flight apiFetch calls fully settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let session: Session | null;
let onSignOut: jest.Mock;
let onTokens: jest.Mock;
let fetchMock: jest.Mock;

beforeEach(() => {
  session = baseSession();
  onSignOut = jest.fn(() => {
    session = null;
  });
  onTokens = jest.fn(async (s: Session) => {
    session = s;
  });
  configureApi({
    getSession: () => session,
    onTokens,
    onSignOut,
  });
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  clearConditionalCache(); // the ETag store is module-level — isolate it per test
});

afterEach(() => {
  __resetReachability(); // clears the offline-recovery probe timer a network-failure test schedules
});

describe("apiFetch refresh path — transient vs definitive failure", () => {
  it("does NOT sign out when the refresh request hits a network error (flaky link, not a revoked token)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) throw new TypeError("Network request failed");
      return AUTH_GUARD_401;
    });

    // The request fails as an ordinary retryable network error (status 0), NOT a sign-out.
    await expect(apiFetch("/orders/mine/active")).rejects.toMatchObject({ status: 0 });
    expect(onSignOut).not.toHaveBeenCalled();
    expect(session).not.toBeNull();
  });

  it("does NOT sign out when the refresh request times out", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) {
        const err = new Error("Aborted");
        err.name = "AbortError"; // what fetchWithTimeout's abort-on-timeout raises
        throw err;
      }
      return AUTH_GUARD_401;
    });

    await expect(apiFetch("/orders/mine/active")).rejects.toMatchObject({ status: 0 });
    expect(onSignOut).not.toHaveBeenCalled();
    expect(session).not.toBeNull();
  });

  it.each([500, 502, 504, 429])(
    "does NOT sign out on a transient %s from the refresh endpoint (proxy/LB blip, token still valid)",
    async (status) => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.endsWith("/auth/refresh")) return makeResponse(status, { message: "upstream" });
        return AUTH_GUARD_401;
      });

      await expect(apiFetch("/orders/mine/active")).rejects.toMatchObject({ status: 0 });
      expect(onSignOut).not.toHaveBeenCalled();
      expect(session).not.toBeNull();
    },
  );

  it.each([401, 403])(
    "DOES sign out on a definitive %s from the refresh endpoint (token genuinely revoked/invalid)",
    async (status) => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.endsWith("/auth/refresh")) return makeResponse(status, { message: "revoked" });
        return AUTH_GUARD_401;
      });

      await expect(apiFetch("/orders/mine/active")).rejects.toMatchObject({
        status: 401,
        message: "Your session expired — sign in again.",
      });
      expect(onSignOut).toHaveBeenCalledTimes(1);
      expect(session).toBeNull();
    },
  );

  it("coalesces concurrent 401s into a single refresh (single-flight guard) and retries both", async () => {
    let refreshCalls = 0;
    let resolveRefresh: (r: Response) => void = () => undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        return refreshResponse; // stays pending until we resolve it, so both callers park on it
      }
      const authHeader = (init?.headers as Record<string, string> | undefined)?.Authorization;
      // The retry carries the freshly-rotated access token → success; the first attempt carries the stale one.
      if (authHeader === `Bearer ${NEW_ACCESS}`) return Promise.resolve(makeResponse(200, { ok: true }));
      return Promise.resolve(AUTH_GUARD_401);
    });

    const p1 = apiFetch<{ ok: boolean }>("/orders/mine/active");
    const p2 = apiFetch<{ ok: boolean }>("/orders/mine/history");
    await flush(); // both requests 401, both reach refreshSession and park on the one in-flight refresh

    resolveRefresh(
      makeResponse(200, { accessToken: NEW_ACCESS, refreshToken: "new-refresh", expiresIn: 3600 }),
    );
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(refreshCalls).toBe(1); // NOT two — the second caller must not re-refresh with a rotated token
    expect(onTokens).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("still exposes ApiError from a transient refresh failure (network error discriminator = status 0)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) throw new TypeError("Network request failed");
      return AUTH_GUARD_401;
    });

    await expect(apiFetch("/orders/mine/active")).rejects.toBeInstanceOf(ApiError);
  });

  it("KB-IDENTITY-BINDING L1: sends a stable, v4-shaped x-device-id header on every request", async () => {
    const seen: string[] = [];
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const h = (init?.headers as Record<string, string> | undefined) ?? {};
      if (h["x-device-id"]) seen.push(h["x-device-id"]);
      return Promise.resolve(makeResponse(200, { ok: true }));
    });
    await apiFetch("/a", { auth: false });
    await apiFetch("/b", { auth: false });
    expect(seen).toHaveLength(2);
    // v4-shaped so the server's zod .uuid() would accept it, and identical across calls (per-install stable).
    expect(seen[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(seen[1]).toBe(seen[0]);
  });
});

describe("apiFetch conditional GETs — ETag revalidation on the polling loops", () => {
  /** Headers the mock fetch saw, per call, for asserting If-None-Match behavior. */
  const sentHeaders = (call: number): Record<string, string> =>
    (fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string>) ?? {};

  it("revalidates a repeated GET with If-None-Match and serves the remembered body on 304", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { fare: "2.50" }, { ETag: 'W/"abc"' }))
      .mockResolvedValueOnce(makeResponse(304, ""));

    const first = await apiFetch<{ fare: string }>("/orders/ord-1");
    expect(sentHeaders(0)["If-None-Match"]).toBeUndefined(); // nothing to validate against yet

    const second = await apiFetch<{ fare: string }>("/orders/ord-1");
    expect(sentHeaders(1)["If-None-Match"]).toBe('W/"abc"');
    // The 304's (empty) body is never parsed — the remembered 200 body is served, as a fresh object.
    expect(second).toEqual(first);
  });

  it("replaces the remembered validator+body when the resource actually changed (200 with a new ETag)", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { status: "open_for_offers" }, { ETag: 'W/"v1"' }))
      .mockResolvedValueOnce(makeResponse(200, { status: "assigned" }, { ETag: 'W/"v2"' }))
      .mockResolvedValueOnce(makeResponse(304, ""));

    await apiFetch("/orders/ord-1");
    const changed = await apiFetch<{ status: string }>("/orders/ord-1");
    expect(changed.status).toBe("assigned");

    const revalidated = await apiFetch<{ status: string }>("/orders/ord-1");
    expect(sentHeaders(2)["If-None-Match"]).toBe('W/"v2"'); // validates against the NEW version…
    expect(revalidated.status).toBe("assigned"); // …and serves the new body on 304
  });

  it("tracks validators per path — one endpoint's ETag never leaks onto another's request", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { a: 1 }, { ETag: 'W/"path-a"' }))
      .mockResolvedValueOnce(makeResponse(200, { b: 2 }, { ETag: 'W/"path-b"' }))
      .mockResolvedValueOnce(makeResponse(304, ""));

    await apiFetch("/a");
    await apiFetch("/b");
    const a = await apiFetch<{ a: number }>("/a");
    expect(sentHeaders(2)["If-None-Match"]).toBe('W/"path-a"');
    expect(a).toEqual({ a: 1 });
  });

  it("never attaches If-None-Match to a non-GET (a mutation must always execute)", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { ok: true }, { ETag: 'W/"get"' }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    await apiFetch("/orders/ord-1");
    await apiFetch("/orders/ord-1", { method: "POST", body: {} });
    expect(sentHeaders(1)["If-None-Match"]).toBeUndefined();
  });

  it("a response without an ETag is simply not revalidatable — no header on the next request", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { ok: true })) // no headers at all (older stub shape)
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    await apiFetch("/plain");
    await apiFetch("/plain");
    expect(sentHeaders(1)["If-None-Match"]).toBeUndefined();
  });

  it("clearConditionalCache() forgets everything (sign-out scrub, S1) — next GET is unconditional", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { mine: true }, { ETag: 'W/"user-a"' }))
      .mockResolvedValueOnce(makeResponse(200, { mine: false }, { ETag: 'W/"user-b"' }));

    await apiFetch("/me");
    clearConditionalCache();
    await apiFetch("/me");
    expect(sentHeaders(1)["If-None-Match"]).toBeUndefined();
  });

  it("scrubs the store on the token-expiry sign-out path (definitive refresh rejection)", async () => {
    // Seed a validator, then hit the revoked-refresh flow; afterwards a signed-in-again GET must not
    // revalidate against the previous session's entry.
    fetchMock.mockResolvedValueOnce(makeResponse(200, { mine: true }, { ETag: 'W/"user-a"' }));
    await apiFetch("/me");

    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) return makeResponse(401, { message: "revoked" });
      return AUTH_GUARD_401;
    });
    await expect(apiFetch("/me")).rejects.toMatchObject({ status: 401 });

    session = baseSession(); // "signs back in"
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(makeResponse(200, { mine: false }, { ETag: 'W/"user-b"' }));
    await apiFetch("/me");
    expect(sentHeaders(0)["If-None-Match"]).toBeUndefined();
  });
});
