import { __resetReachability } from "../../net/reachability";
import type { Session } from "../../auth/session";
import { STANDARD_TIMEOUT_MS } from "../../net/network-policy";
import { __resetTokenClock, apiFetch, clearConditionalCache, configureApi } from "../client";

/**
 * P09 — refresh an expiring access token BEFORE sending, so a cold start doesn't spend a 401 round
 * trip per boot request. Auth is sensitive: these pin that the proactive path is single-flight, never
 * signs anyone out on its own, falls back to the reactive path on any doubt, and can't turn a skewed
 * device clock into a refresh storm.
 *
 * P35 — the request deadline covers the body read, not just the headers (a browser's fetch resolves at
 * the headers).
 */

const SERVER_NOW_S = 1_800_000_000;

function jwt(claims: { exp: number; iat?: number }): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: "p1", role: "customer", ...claims })}.sig`;
}

function makeResponse(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text } as unknown as Response;
}

const AUTH_GUARD_401 = makeResponse(401, { message: "Invalid or expired token" });
const isRefresh = (url: string) => url.endsWith("/auth/refresh");

let session: Session | null;
let onSignOut: jest.Mock;
let onTokens: jest.Mock;
let fetchMock: jest.Mock;
let rotations = 0;

/** A refresh endpoint that rotates to a fresh 15-minute token issued at server time. */
function refreshOk(serverNowS = SERVER_NOW_S): Response {
  rotations += 1;
  return makeResponse(200, {
    accessToken: jwt({ iat: serverNowS, exp: serverNowS + 900 }),
    refreshToken: `refresh-${rotations}`,
    expiresIn: 900,
  });
}

/** Requests that reached the API (not the refresh endpoint), with the bearer they carried. */
const apiCalls = () =>
  fetchMock.mock.calls
    .filter(([url]) => !isRefresh(url as string))
    .map(([, init]) => ((init as RequestInit).headers as Record<string, string>).Authorization);
const refreshCalls = () => fetchMock.mock.calls.filter(([url]) => isRefresh(url as string)).length;

beforeEach(() => {
  rotations = 0;
  __resetTokenClock();
  jest.spyOn(Date, "now").mockReturnValue(SERVER_NOW_S * 1000);
  session = {
    accessToken: jwt({ iat: SERVER_NOW_S - 3600, exp: SERVER_NOW_S - 2700 }), // expired 45 min ago
    refreshToken: "refresh-0",
    expiresIn: 900,
    profileId: "p1",
    role: "customer",
  };
  onSignOut = jest.fn(() => {
    session = null;
  });
  onTokens = jest.fn(async (s: Session) => {
    session = s;
  });
  configureApi({ getSession: () => session, onTokens, onSignOut });
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  clearConditionalCache();
});

afterEach(() => {
  jest.restoreAllMocks();
  __resetReachability();
});

describe("P09 — proactive access-token refresh", () => {
  it("refreshes an expired token BEFORE the first send — no 401 round trip", async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (isRefresh(url)) return refreshOk();
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === `Bearer ${session?.accessToken}` ? makeResponse(200, { ok: true }) : AUTH_GUARD_401;
    });

    await expect(apiFetch("/app/bootstrap")).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.map(([url]) => (isRefresh(url as string) ? "refresh" : "api"))).toEqual(["refresh", "api"]);
    expect(apiCalls()).toEqual([`Bearer ${session?.accessToken}`]);
    expect(onTokens).toHaveBeenCalledTimes(1);
    expect(onSignOut).not.toHaveBeenCalled();
  });

  it("the whole boot burst shares ONE refresh (single-flight with the reactive path)", async () => {
    fetchMock.mockImplementation(async (url: string) => (isRefresh(url) ? refreshOk() : makeResponse(200, {})));

    await Promise.all(["/app/bootstrap", "/restaurants", "/shops", "/pharmacy"].map((p) => apiFetch(p)));
    expect(refreshCalls()).toBe(1);
    expect(new Set(apiCalls())).toEqual(new Set([`Bearer ${session?.accessToken}`]));
  });

  it("refreshes a token that expires within the 30 s leeway", async () => {
    session = { ...session!, accessToken: jwt({ iat: SERVER_NOW_S - 880, exp: SERVER_NOW_S + 20 }) };
    fetchMock.mockImplementation(async (url: string) => (isRefresh(url) ? refreshOk() : makeResponse(200, {})));
    await apiFetch("/me");
    expect(refreshCalls()).toBe(1);
  });

  it("leaves a token with time to spare alone", async () => {
    const live = jwt({ iat: SERVER_NOW_S - 60, exp: SERVER_NOW_S + 840 });
    session = { ...session!, accessToken: live };
    fetchMock.mockResolvedValue(makeResponse(200, {}));
    await apiFetch("/me");
    expect(refreshCalls()).toBe(0);
    expect(apiCalls()).toEqual([`Bearer ${live}`]);
  });

  it("does nothing for a non-JWT token, an unauthenticated call, or no refresh token", async () => {
    fetchMock.mockResolvedValue(makeResponse(200, {}));
    session = { ...session!, accessToken: "opaque-token" };
    await apiFetch("/me");
    await apiFetch("/auth/otp", { method: "POST", body: {}, auth: false });
    session = { ...session!, accessToken: jwt({ exp: SERVER_NOW_S - 10 }), refreshToken: "" };
    await apiFetch("/me");
    expect(refreshCalls()).toBe(0);
  });

  it("a proactive refresh that hits a flaky link falls through: request still sent, nobody signed out", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (isRefresh(url)) throw new TypeError("Network request failed");
      return makeResponse(200, { ok: true }); // the server still accepted the token (clock skew)
    });
    await expect(apiFetch("/me")).resolves.toEqual({ ok: true });
    expect(onSignOut).not.toHaveBeenCalled();
    expect(session).not.toBeNull();
  });

  it("a proactive refresh never signs out by itself — only the reactive path's definitive rejection does", async () => {
    let refreshes = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (isRefresh(url)) {
        refreshes += 1;
        return makeResponse(401, { statusCode: 401, message: "Invalid or expired refresh token" });
      }
      return AUTH_GUARD_401;
    });
    await expect(apiFetch("/me")).rejects.toMatchObject({ status: 401 });
    // The request still went out with the old token and got the guard's 401 before the sign-out.
    expect(apiCalls()).toHaveLength(1);
    expect(refreshes).toBe(2);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("a device clock running an hour fast costs one refresh, not one per request", async () => {
    const deviceAheadMs = 3600_000;
    jest.spyOn(Date, "now").mockReturnValue(SERVER_NOW_S * 1000 + deviceAheadMs);
    fetchMock.mockImplementation(async (url: string) => (isRefresh(url) ? refreshOk(SERVER_NOW_S) : makeResponse(200, {})));

    await apiFetch("/a");
    await apiFetch("/b");
    await apiFetch("/c");
    expect(refreshCalls()).toBe(1);
  });

  it("a refreshed token without iat that still looks expired switches the proactive path off", async () => {
    jest.spyOn(Date, "now").mockReturnValue(SERVER_NOW_S * 1000 + 3600_000);
    fetchMock.mockImplementation(async (url: string) =>
      isRefresh(url)
        ? makeResponse(200, { accessToken: jwt({ exp: SERVER_NOW_S + 900 }), refreshToken: `r-${++rotations}`, expiresIn: 900 })
        : makeResponse(200, {}),
    );
    await apiFetch("/a");
    await apiFetch("/b");
    expect(refreshCalls()).toBe(1);
  });
});

describe("P35 — the request deadline covers the body read", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("a body that stalls after the headers fails at STANDARD_TIMEOUT_MS instead of hanging", async () => {
    session = null;
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      // A browser fetch resolved at the headers; the body never arrives until the abort fires.
      text: () =>
        new Promise<string>((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () => {
            const e = new Error("Aborted");
            e.name = "AbortError";
            reject(e);
          });
        }),
    }));

    const p = apiFetch("/restaurants");
    const settled = expect(p).rejects.toMatchObject({ status: 0 });
    await jest.advanceTimersByTimeAsync(STANDARD_TIMEOUT_MS + 1);
    await settled;
  });
});
