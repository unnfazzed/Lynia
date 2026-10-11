import { Platform } from "react-native";
import { __resetReachability } from "../../net/reachability";
import type { Session } from "../../auth/session";

/**
 * Reviewed list 2026-10-07 U15 (web): every tab of app.lyniago.com shares one stored session but keeps its
 * own copy in memory. A background tab presented a refresh token another tab had already rotated away; the
 * definitive 401 signed the browser out of EVERY tab. On the web the stored session is read first.
 */

const mockLoadSession = jest.fn<Promise<Session | null>, []>();
jest.mock("../../auth/session", () => ({
  ...jest.requireActual("../../auth/session"),
  loadSession: () => mockLoadSession(),
}));

// eslint-disable-next-line import/first -- after the mock above.
import { __resetTokenClock, apiFetch, clearConditionalCache, configureApi } from "../client";

const NOW_S = 1_800_000_000;
function jwt(claims: { exp: number; iat?: number }): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: "p1", role: "customer", ...claims })}.sig`;
}
function res(status: number, body: unknown): Response {
  const text = JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text } as unknown as Response;
}
const REVOKED = res(401, { statusCode: 401, message: "Invalid refresh token" });
const GUARD_401 = res(401, { message: "Invalid or expired token" });

const EXPIRED = jwt({ iat: NOW_S - 3600, exp: NOW_S - 2700 });
const FRESH = jwt({ iat: NOW_S - 60, exp: NOW_S + 840 });
const base = { expiresIn: 900, profileId: "p1", role: "customer" } as const;

let session: Session | null;
let onSignOut: jest.Mock;
let onTokens: jest.Mock;
let fetchMock: jest.Mock;
const realOS = Platform.OS;
const refreshBodies = (): string[] =>
  fetchMock.mock.calls.filter(([u]) => (u as string).endsWith("/auth/refresh")).map(([, i]) => JSON.parse((i as RequestInit).body as string).refreshToken as string);

/** The server: only `live` is a valid refresh token; it rotates to `next`. Any access token in `valid` passes. */
function server(live: string, next: string, valid: string[]): void {
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith("/auth/refresh")) {
      const { refreshToken } = JSON.parse(init.body as string) as { refreshToken: string };
      return refreshToken === live ? res(200, { accessToken: FRESH, refreshToken: next, expiresIn: 900 }) : REVOKED;
    }
    const bearer = ((init.headers as Record<string, string>).Authorization ?? "").replace("Bearer ", "");
    return valid.includes(bearer) ? res(200, { ok: true }) : GUARD_401;
  });
}

beforeEach(() => {
  __resetTokenClock();
  jest.spyOn(Date, "now").mockReturnValue(NOW_S * 1000);
  Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
  session = { ...base, accessToken: EXPIRED, refreshToken: "refresh-0" }; // this (background) tab
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
  mockLoadSession.mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, "OS", { value: realOS, configurable: true });
  __resetReachability();
});

describe("U15 — a stale tab adopts the session another tab rotated", () => {
  it("another tab already rotated (fresh access token stored): adopt it, no refresh, no sign-out", async () => {
    mockLoadSession.mockResolvedValue({ ...base, accessToken: FRESH, refreshToken: "refresh-2" });
    server("refresh-2", "refresh-3", [FRESH]);
    await expect(apiFetch("/app/bootstrap")).resolves.toEqual({ ok: true });
    expect(refreshBodies()).toEqual([]); // never presents the rotated-away refresh-0
    expect(onSignOut).not.toHaveBeenCalled();
    expect(session?.refreshToken).toBe("refresh-2");
  });

  it("stored access token expired too: refresh with the STORED refresh token, not the stale one", async () => {
    mockLoadSession.mockResolvedValue({ ...base, accessToken: EXPIRED, refreshToken: "refresh-2" });
    server("refresh-2", "refresh-3", [FRESH]);
    await expect(apiFetch("/app/bootstrap")).resolves.toEqual({ ok: true });
    expect(refreshBodies()).toEqual(["refresh-2"]);
    expect(onSignOut).not.toHaveBeenCalled();
    expect(session?.refreshToken).toBe("refresh-3");
  });

  it("the other tab rotated while this refresh was in flight: re-read after the rejection, still signed in", async () => {
    // First read: nothing newer. After this tab's refresh-0 is rejected, storage holds the other tab's rotation.
    mockLoadSession.mockResolvedValueOnce({ ...base, accessToken: EXPIRED, refreshToken: "refresh-0" }).mockResolvedValueOnce({ ...base, accessToken: FRESH, refreshToken: "refresh-1" });
    server("refresh-1", "refresh-2", [FRESH]);
    await expect(apiFetch("/app/bootstrap")).resolves.toEqual({ ok: true });
    expect(refreshBodies()).toEqual(["refresh-0"]);
    expect(onSignOut).not.toHaveBeenCalled();
    expect(session?.refreshToken).toBe("refresh-1");
  });

  it("a genuinely revoked session (storage holds nothing newer) still signs out", async () => {
    mockLoadSession.mockResolvedValue({ ...base, accessToken: EXPIRED, refreshToken: "refresh-0" });
    server("nobody", "x", [FRESH]);
    await expect(apiFetch("/app/bootstrap")).rejects.toBeTruthy();
    expect(onSignOut).toHaveBeenCalled();
  });

  it("another account's stored session is never adopted", async () => {
    mockLoadSession.mockResolvedValue({ ...base, profileId: "p2", accessToken: FRESH, refreshToken: "refresh-9" });
    server("refresh-0", "refresh-1", [FRESH]);
    await expect(apiFetch("/app/bootstrap")).resolves.toEqual({ ok: true });
    expect(refreshBodies()).toEqual(["refresh-0"]);
    expect(session?.profileId).toBe("p1");
  });

  it("native apps don't read storage before refreshing (one process, nothing to sync)", async () => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    server("refresh-0", "refresh-1", [FRESH]);
    await expect(apiFetch("/app/bootstrap")).resolves.toEqual({ ok: true });
    expect(mockLoadSession).not.toHaveBeenCalled();
    expect(refreshBodies()).toEqual(["refresh-0"]);
  });
});
