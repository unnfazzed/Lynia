import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantSession } from "./session";

/**
 * MJ-P2 (2026-10-07): every Orders load asked `/merchant/me` twice (the board and the tab bar in the same
 * tick), and sign-in → landing asked `/merchant/me` and `/merchant/invites` again seconds after the sign-in
 * screen had read them.
 */

let session: MerchantSession | null;
vi.mock("./session", () => ({
  loadMerchantSession: () => session,
  saveMerchantSession: (s: MerchantSession) => {
    session = s;
  },
  clearMerchantSession: () => {
    session = null;
  },
}));
vi.mock("./reachability", () => ({ getReachabilityStore: () => ({ reportReachable: () => {}, reportUnreachable: () => {} }) }));
vi.mock("./device-id", () => ({ getDeviceId: () => "device-1" }));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const fail = (status: number, body: unknown) => ({ ok: false, status, json: async () => body }) as unknown as Response;
const ME = { id: "m1", name: "Sadza Republic", businessType: "restaurant" };

let fetchMock: ReturnType<typeof vi.fn>;
const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path)).length;

beforeEach(() => {
  vi.resetModules();
  session = { accessToken: "at", refreshToken: "rt", expiresIn: 3600, issuedAt: 0, profileId: "p1", role: "merchant" };
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/merchant/me")) return ok(ME);
    if (url.endsWith("/merchant/invites")) return ok({ invites: [] });
    return ok({});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shared reads (MJ-P2)", () => {
  it("answers the board and the tab bar asking /merchant/me in the same tick with one request", async () => {
    const { getMyMerchant } = await import("./api-client");
    const { getMerchantProfile } = await import("./menu-api");
    const { loadBusiness } = await import("./business");
    const [a, b, c] = await Promise.all([getMyMerchant(), getMerchantProfile(), loadBusiness()]);
    expect(a).toEqual(ME);
    expect(b).toEqual(ME);
    expect(c).toEqual(ME);
    expect(calls("/merchant/me")).toBe(1);
  });

  it("records the sign-in's terms acceptance once per app load, whatever reads /merchant/me", async () => {
    const { getMyMerchant } = await import("./api-client");
    await getMyMerchant();
    await getMyMerchant();
    await vi.waitFor(() => expect(calls("/merchant/terms/accept")).toBe(1));
    const post = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/merchant/terms/accept"));
    expect((post?.[1] as RequestInit | undefined)?.method).toBe("POST");
  });

  it("reuses an answer for the landing screen right after sign-in, and asks afresh after that", async () => {
    vi.useFakeTimers();
    const { getMyMerchant, SHARED_READ_FRESH_MS } = await import("./api-client");
    await getMyMerchant(); // sign-in's landingPath
    await vi.advanceTimersByTimeAsync(2_000);
    await getMyMerchant(); // the Orders board, once its page has loaded
    expect(calls("/merchant/me")).toBe(1);
    await vi.advanceTimersByTimeAsync(SHARED_READ_FRESH_MS);
    await getMyMerchant();
    expect(calls("/merchant/me")).toBe(2);
  });

  it("keeps 'not on a business' as an answer, and /merchant/invites, for Join after sign-in", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/merchant/me") ? fail(403, { reason: "not_a_member", message: "Not a member" }) : ok({ invites: [{ id: "i1" }] }),
    );
    const { getMyMerchant } = await import("./api-client");
    const { listMyInvites, noBusinessPath } = await import("./team-api");
    await expect(getMyMerchant()).rejects.toMatchObject({ status: 403, reason: "not_a_member" });
    await expect(noBusinessPath()).resolves.toBe("/join");
    // Join's own load.
    await expect(getMyMerchant()).rejects.toMatchObject({ status: 403 });
    await expect(listMyInvites()).resolves.toEqual({ invites: [{ id: "i1" }] });
    expect(calls("/merchant/me")).toBe(1);
    expect(calls("/merchant/invites")).toBe(1);
  });

  it("never keeps a failure: the next ask (Try again) goes to the server", async () => {
    fetchMock.mockImplementationOnce(async () => fail(503, { message: "Down" }));
    const { getMyMerchant } = await import("./api-client");
    await expect(getMyMerchant()).rejects.toMatchObject({ status: 503 });
    await expect(getMyMerchant()).resolves.toEqual(ME);
    expect(calls("/merchant/me")).toBe(2);
  });

  it("any write forgets it, so a screen never reads its own change back stale", async () => {
    const { authedFetch, getMyMerchant } = await import("./api-client");
    await getMyMerchant();
    await authedFetch("/merchant/open", { method: "POST", body: { open: false } });
    await getMyMerchant();
    expect(calls("/merchant/me")).toBe(2);
  });

  it("a read that started before a write isn't kept for the next screen", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)));
    const { authedFetch, getMyMerchant } = await import("./api-client");
    const before = getMyMerchant();
    await authedFetch("/merchant/open", { method: "POST", body: { open: false } });
    release(ok({ ...ME, name: "Before the write" }));
    await before;
    await expect(getMyMerchant()).resolves.toEqual(ME);
    expect(calls("/merchant/me")).toBe(2);
  });

  it("sign-out and a branch switch forget it (clearBusinessCache)", async () => {
    const { getMyMerchant } = await import("./api-client");
    const { clearBusinessCache } = await import("./business");
    await getMyMerchant();
    clearBusinessCache();
    await getMyMerchant();
    expect(calls("/merchant/me")).toBe(2);
  });
});
