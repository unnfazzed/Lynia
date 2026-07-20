import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adjustFare, cancelOrder } from "./actions";

/**
 * Order state / fare mutations (item 1.6). `adjustFare` moves money (a corrected fare re-settles the
 * rider's prepaid commission balance in-tx); `cancelOrder` changes order state for both sides. Same test
 * seam as the rider actions: real admin client, mocked transport, so the request body and the fail-closed
 * behavior are pinned exactly.
 */

const { headersMock, revalidateMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  revalidateMock: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

const fetchMock = vi.fn();
const res = (status: number) => ({ ok: status >= 200 && status < 300, status });
function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, method: init.method, body: JSON.parse(init.body as string), headers: init.headers as Record<string, string> };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(res(200));
  vi.stubGlobal("fetch", fetchMock);
  headersMock.mockReset();
  headersMock.mockResolvedValue(new Headers({ "x-lynia-operator": "alice@corp.com" }));
  revalidateMock.mockReset();
  process.env.API_BASE_URL = "https://api.test";
  process.env.ADMIN_API_TOKEN = "test-admin-token";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_BASE_URL;
  delete process.env.ADMIN_API_TOKEN;
});

describe("adjustFare (corrects the recorded fare; re-settles commission in-tx)", () => {
  it("posts the FareAdjust shape (agreedFare/reason/note), not the audit envelope, and revalidates detail + list", async () => {
    await adjustFare("o1", "12.50", "customer_dispute", "agreed lower");
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/orders/o1/fare");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({ agreedFare: 12.5, reason: "customer_dispute", note: "agreed lower" });
    expect(c.headers.Authorization).toBe("Bearer test-admin-token");
    expect(c.headers["X-Operator"]).toBe("alice@corp.com");
    expect(revalidateMock).toHaveBeenCalledWith("/orders/o1");
    expect(revalidateMock).toHaveBeenCalledWith("/orders");
  });

  it("maps a null reason code to an empty reason and a blank note to null", async () => {
    await adjustFare("o1", "8", null, "");
    expect(lastCall().body).toEqual({ agreedFare: 8, reason: "", note: null });
  });

  // TODO(1.6): SMELL — adjustFare carries NO idempotency key (unlike creditRiderWallet). Nothing lets the
  // backend dedup a replay, so a double-confirm / lost-response retry re-posts to POST /admin/orders/:id/fare
  // and the endpoint re-writes its in-tx AuditLog row (and re-adjusts commission on a completed order) a
  // second time. This test pins the CURRENT (non-idempotent) behavior; the fix belongs in product code, not
  // here. See apps/admin/app/orders/actions.ts:37 (adjustFare) — no idempotencyKey field is ever sent.
  it("is NOT replay-safe: a same-payload resubmit posts a second identical write with no dedup key", async () => {
    await adjustFare("o1", "12.50", "customer_dispute", "agreed lower");
    await adjustFare("o1", "12.50", "customer_dispute", "agreed lower");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    const second = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
    expect(second).toEqual(first);
    // Documents the gap: no idempotency key is present for the backend to collapse the replay on.
    expect(first).not.toHaveProperty("idempotencyKey");
    expect(second).not.toHaveProperty("idempotencyKey");
  });

  it("FAILS CLOSED: a rejected fare write throws and does not revalidate", async () => {
    fetchMock.mockResolvedValue(res(400));
    await expect(adjustFare("o1", "12.50", "customer_dispute", "n")).rejects.toThrow(/Failed to adjust fare/i);
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("cancelOrder (ops-initiated cancel — order state change)", () => {
  it("posts the ReasonRequired shape and revalidates detail + list", async () => {
    await cancelOrder("o2", "duplicate", "customer asked");
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/orders/o2/cancel");
    expect(c.body).toEqual({ reason: "duplicate", note: "customer asked" });
    expect(revalidateMock).toHaveBeenCalledWith("/orders/o2");
    expect(revalidateMock).toHaveBeenCalledWith("/orders");
  });

  it("AUTHZ: an underprivileged / unauthenticated caller (API 403) is rejected — the action throws", async () => {
    fetchMock.mockResolvedValue(res(403));
    await expect(cancelOrder("o2", "duplicate", "n")).rejects.toThrow(/Failed to cancel order/i);
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
