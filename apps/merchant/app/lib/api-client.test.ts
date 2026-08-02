import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantSession } from "./session";

/**
 * LC-C02/C03/C04: before this fix, `apps/merchant/app/lib/api-client.ts` had no request timeout
 * anywhere, and `/auth/refresh` collapsed "the refresh token is dead" and "the request had a blip"
 * into the same outcome — signing the merchant out on either. These assert the fixed behavior:
 * every fetch carries a bounded AbortSignal, and only a definitive 401/403 from `/auth/refresh` may
 * clear the session — a network error or 5xx there fails just the one in-flight call and leaves the
 * merchant signed in.
 */

let session: MerchantSession | null;
const saveMerchantSession = vi.fn((s: MerchantSession) => {
  session = s;
});
const clearMerchantSession = vi.fn(() => {
  session = null;
});

vi.mock("./session", () => ({
  loadMerchantSession: () => session,
  saveMerchantSession: (s: MerchantSession) => saveMerchantSession(s),
  clearMerchantSession: () => clearMerchantSession(),
}));

const reportReachable = vi.fn();
const reportUnreachable = vi.fn();
vi.mock("./reachability", () => ({
  getReachabilityStore: () => ({ reportReachable, reportUnreachable }),
}));

function baseSession(): MerchantSession {
  return {
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresIn: 3600,
    issuedAt: 0,
    profileId: "m1",
    role: "merchant",
  };
}

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const AUTH_GUARD_401 = makeResponse(401, { message: "Invalid or expired token" });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  session = baseSession();
  saveMerchantSession.mockClear();
  clearMerchantSession.mockClear();
  reportReachable.mockClear();
  reportUnreachable.mockClear();
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authedFetch — /auth/refresh transient vs definitive failure (LC-C03)", () => {
  it("does NOT sign out when /auth/refresh hits a network error — the request fails once, session stays", async () => {
    const { authedFetch } = await import("./api-client");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) throw new TypeError("Network request failed");
      return AUTH_GUARD_401;
    });

    await expect(authedFetch("/merchant/orders")).rejects.toMatchObject({ status: 0 });
    expect(clearMerchantSession).not.toHaveBeenCalled();
    expect(session).not.toBeNull();
  });

  it.each([500, 502, 503])(
    "does NOT sign out on a transient %s from /auth/refresh",
    async (status) => {
      const { authedFetch } = await import("./api-client");
      fetchMock.mockImplementation(async (url: string) => {
        if (url.endsWith("/auth/refresh")) return makeResponse(status, { message: "upstream" });
        return AUTH_GUARD_401;
      });

      await expect(authedFetch("/merchant/orders")).rejects.toMatchObject({ status: 0 });
      expect(clearMerchantSession).not.toHaveBeenCalled();
      expect(session).not.toBeNull();
    },
  );

  it("DOES sign out when /auth/refresh definitively rejects the refresh token (401)", async () => {
    const { authedFetch } = await import("./api-client");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) return makeResponse(401, { message: "invalid refresh token" });
      return AUTH_GUARD_401;
    });

    await expect(authedFetch("/merchant/orders")).rejects.toMatchObject({
      status: 401,
      message: "Your session expired — sign in again.",
    });
    expect(clearMerchantSession).toHaveBeenCalledTimes(1);
    expect(session).toBeNull();
  });

  it("retries the original request with the refreshed token on success", async () => {
    const { authedFetch } = await import("./api-client");
    let calls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      calls++;
      if (url.endsWith("/auth/refresh")) {
        return makeResponse(200, { accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 3600 });
      }
      if (url.endsWith("/merchant/orders")) {
        // First call (old token) 401s; second call (new token) succeeds.
        return calls <= 2 ? AUTH_GUARD_401 : makeResponse(200, []);
      }
      throw new Error(`unexpected url ${url}`);
    });

    await expect(authedFetch("/merchant/orders")).resolves.toEqual([]);
    expect(session?.accessToken).toBe("new-access");
    expect(clearMerchantSession).not.toHaveBeenCalled();
  });
});

describe("every outbound request carries a bounded timeout signal (LC-C02)", () => {
  it("rawFetch (requestOtp) passes an AbortSignal", async () => {
    const { requestOtp } = await import("./api-client");
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return makeResponse(200, { sent: true, channel: "sms" });
    });
    await requestOtp("+263700000000");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("authedFetch passes an AbortSignal on the first attempt", async () => {
    const { authedFetch } = await import("./api-client");
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return makeResponse(200, []);
    });
    await authedFetch("/merchant/orders");
  });

  it("a stalled/aborted request surfaces as a retryable ApiError(0), not an unhandled hang", async () => {
    const { authedFetch } = await import("./api-client");
    fetchMock.mockImplementation(async () => {
      const err = new Error("The operation was aborted");
      err.name = "TimeoutError";
      throw err;
    });
    await expect(authedFetch("/merchant/orders")).rejects.toMatchObject({ status: 0 });
  });
});

describe("authedFetch feeds the shared ReachabilityStore (LC-D04)", () => {
  // Before this fix, only use-queue-poll.ts fed the store — a network drop hit while the merchant
  // was on Menu/Shop/Hours/Statement (every one of which calls through authedFetch, never
  // listQueue) never flipped the CONNECTION LOST bar until the next queue poll or 20s active
  // probe happened to notice. Wiring it in authedFetch itself covers the whole authenticated
  // surface by construction.
  it("reports reachable on a successful response", async () => {
    const { authedFetch } = await import("./api-client");
    fetchMock.mockResolvedValue(makeResponse(200, { ok: true }));
    await authedFetch("/merchant/dishes/d1/out-of-stock");
    expect(reportReachable).toHaveBeenCalled();
    expect(reportUnreachable).not.toHaveBeenCalled();
  });

  it("reports reachable even on a non-2xx domain rejection — a real response is proof of life", async () => {
    const { authedFetch } = await import("./api-client");
    fetchMock.mockResolvedValue(makeResponse(409, { message: "conflict" }));
    await expect(authedFetch("/merchant/dishes/d1/out-of-stock")).rejects.toMatchObject({ status: 409 });
    expect(reportReachable).toHaveBeenCalled();
    expect(reportUnreachable).not.toHaveBeenCalled();
  });

  it("reports unreachable on a network-level failure", async () => {
    const { authedFetch } = await import("./api-client");
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(authedFetch("/merchant/dishes/d1/out-of-stock")).rejects.toMatchObject({ status: 0 });
    expect(reportUnreachable).toHaveBeenCalled();
    expect(reportReachable).not.toHaveBeenCalled();
  });

  it("reports unreachable when the post-refresh retry hits a network-level failure", async () => {
    const { authedFetch } = await import("./api-client");
    let calls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      calls++;
      if (url.endsWith("/auth/refresh")) {
        return makeResponse(200, { accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 3600 });
      }
      if (calls === 1) return AUTH_GUARD_401; // first attempt: expired token
      throw new TypeError("Network request failed"); // retry with fresh token: drops mid-flight
    });
    await expect(authedFetch("/merchant/orders")).rejects.toMatchObject({ status: 0 });
    expect(reportUnreachable).toHaveBeenCalled();
  });
});
