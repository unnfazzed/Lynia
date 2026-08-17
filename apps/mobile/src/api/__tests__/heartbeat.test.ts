import { __resetReachability } from "../../net/reachability";
import { ApiError } from "../client";
import { sendHeartbeat } from "../riders";

/**
 * The 20s liveness beat rides the dedicated lightweight endpoint (wave-2 W3) but must survive a
 * mixed-version rollout: an older API without POST /riders/heartbeat answers 404, and the beat then
 * falls back to the legacy full setOnline — liveness never lapses mid-deploy. Every OTHER failure
 * must propagate untouched, because the rider screen's beat handler branches on it (403 ⇒ the server
 * took us offline for a reason; anything else ⇒ transient, count toward the reconnecting chip).
 */

function makeResponse(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as Response;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  __resetReachability(); // clears the offline-recovery probe a network-failure test may have armed
});

describe("sendHeartbeat — lightweight beat with legacy fallback", () => {
  it("beats via POST /riders/heartbeat, carrying the position", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200, { online: true }));

    await expect(sendHeartbeat({ lat: -17.83, lng: 31.05 })).resolves.toEqual({ online: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/riders\/heartbeat$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ lat: -17.83, lng: 31.05 });
  });

  it("falls back to the legacy setOnline beat when the endpoint doesn't exist yet (404 during rollout)", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(404, { message: "Cannot POST /riders/heartbeat" }))
      .mockResolvedValueOnce(makeResponse(200, { online: true }));

    await expect(sendHeartbeat({ lat: -17.83, lng: 31.05 })).resolves.toEqual({ online: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/riders\/online$/);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ online: true, lat: -17.83, lng: 31.05 });
  });

  it("does NOT fall back on a 403 online-gate refusal — the rider screen must see the real reason", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(403, { reason: "on_hold", message: "Your account is on hold — contact support to get back on the road" }),
    );

    await expect(sendHeartbeat()).rejects.toMatchObject({ status: 403, code: "on_hold" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no second (setOnline) request
  });

  it("does NOT fall back on a network failure — a dead link is transient, not a missing endpoint", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));

    await expect(sendHeartbeat()).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propagates an ApiError instance (the beat handler branches on instanceof)", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(500, { message: "upstream" }));
    await expect(sendHeartbeat()).rejects.toBeInstanceOf(ApiError);
  });
});
