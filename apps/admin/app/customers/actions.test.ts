import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liftCashBan, mutateCustomer } from "./actions";

/**
 * X1/R-08: `liftCashBan` is the only path back to cash-eligibility for a customer R-08 banned — a
 * silent failure here would leave a cleared customer stuck WALLET-only with no visible reason. Mirrors
 * riders/actions.test.ts's pattern: exercise the REAL admin API client, mocking only the transport +
 * Next request hooks.
 */

const { headersMock, revalidateMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  revalidateMock: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

const fetchMock = vi.fn();
const res = (status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => ({}) });

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

describe("liftCashBan (R-08 — the only lift path for a food cash-ban)", () => {
  it("posts to the cash-ban-lift endpoint and revalidates the profile + directory", async () => {
    await liftCashBan("cust-1", "Customer contacted and cleared", "spoke on the phone");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/customers/cust-1/cash-ban-lift");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({ reason: "Customer contacted and cleared", note: "spoke on the phone" });
    expect(c.headers.Authorization).toBe("Bearer test-admin-token");
    expect(c.headers["X-Operator"]).toBe("alice@corp.com");
    expect(revalidateMock).toHaveBeenCalledWith("/customers/cust-1");
    expect(revalidateMock).toHaveBeenCalledWith("/customers");
  });

  it("FAILS CLOSED: a rejected write throws and does not revalidate", async () => {
    fetchMock.mockResolvedValue(res(409));
    await expect(liftCashBan("cust-1", "x", "")).rejects.toThrow(/Failed to lift cash-ban/i);
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("mutateCustomer (S·2 hold/lift — regression net for the X1 addition alongside it)", () => {
  it("still rejects an unknown action even with liftCashBan now defined as a sibling export", async () => {
    // @ts-expect-error intentionally passing an invalid action to prove the allowlist still holds
    await expect(mutateCustomer("cust-1", "cash-ban-lift", null, "")).rejects.toThrow(/Unknown customer action/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
