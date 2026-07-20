import { QueryClient } from "@tanstack/react-query";
import type { Me } from "../../api/auth";
import { fetchBootstrap } from "../../api/bootstrap";
import { __resetReachability } from "../../net/reachability";
import { seedQueryCacheFromBootstrap } from "../use-bootstrap";

/**
 * Wave-2 W1 client half: the boot aggregate must seed EXACTLY the role-appropriate keys (a stale
 * cross-role paint would mislead a dual-role user), and the fetch must be inert against an older
 * API (404 → null → nothing seeded, screens self-serve as before).
 */

const customerMe = { profileId: "p1", role: "customer", firstName: "A", lastName: "B" } as unknown as Me;
const riderMe = { profileId: "p2", role: "rider" } as unknown as Me;

function makeResponse(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as Response;
}

afterEach(() => {
  __resetReachability();
});

describe("seedQueryCacheFromBootstrap", () => {
  it("seeds ['me'] + ['activeCustomerOrder'] for a customer and leaves the rider key untouched", () => {
    const qc = new QueryClient();
    seedQueryCacheFromBootstrap(qc, {
      minSupportedVersion: "0.0.0",
      me: customerMe,
      activeOrder: { id: "ord-1" } as never,
    });
    expect(qc.getQueryData(["me"])).toEqual(customerMe);
    expect(qc.getQueryData(["activeCustomerOrder"])).toEqual({ id: "ord-1" });
    expect(qc.getQueryData(["activeJob"])).toBeUndefined();
  });

  it("seeds ['activeJob'] for a rider and leaves the customer key untouched", () => {
    const qc = new QueryClient();
    seedQueryCacheFromBootstrap(qc, { minSupportedVersion: "0.0.0", me: riderMe, activeOrder: null });
    expect(qc.getQueryData(["me"])).toEqual(riderMe);
    expect(qc.getQueryData(["activeJob"])).toBeNull();
    expect(qc.getQueryData(["activeCustomerOrder"])).toBeUndefined();
  });
});

describe("fetchBootstrap — inert against an older API", () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("returns the aggregate on 200", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(200, { minSupportedVersion: "0.0.0", me: customerMe, activeOrder: null }),
    );
    await expect(fetchBootstrap()).resolves.toMatchObject({ me: { profileId: "p1" } });
  });

  it("returns null (seed nothing) when the endpoint doesn't exist yet (404 mid-rollout)", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(404, { message: "Cannot GET /app/bootstrap" }));
    await expect(fetchBootstrap()).resolves.toBeNull();
  });

  it("propagates real failures (network) so the caller's catch resets the once-guard", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(fetchBootstrap()).rejects.toMatchObject({ status: 0 });
  });
});
