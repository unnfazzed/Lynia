import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adjustFleet, markFleetBillPaid, setFleetFee, switchFleet } from "./actions";

/**
 * Own bikers' console writes (OB-A2/A3): each goes through the real admin client to its endpoint with the operator
 * forwarded (the endpoint writes the audit row), and a refusal comes back in the API's own words.
 */
const { headersMock, revalidateMock } = vi.hoisted(() => ({ headersMock: vi.fn(), revalidateMock: vi.fn() }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

const fetchMock = vi.fn();
const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, method: init.method, body: JSON.parse(init.body as string), headers: init.headers as Record<string, string> };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(res(200));
  vi.stubGlobal("fetch", fetchMock);
  headersMock.mockResolvedValue(new Headers({ "x-lynia-operator": "tsitsi@lyniago.com" }));
  revalidateMock.mockReset();
  process.env.API_BASE_URL = "https://api.test";
  process.env.ADMIN_API_TOKEN = "test-admin-token";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_BASE_URL;
  delete process.env.ADMIN_API_TOKEN;
});

describe("Own bikers console writes", () => {
  it("fee: the new fee and a note saying what changed", async () => {
    expect(await setFleetFee("own-1", 1.75, "1.50")).toEqual({ ok: true });
    expect(lastCall()).toMatchObject({
      url: "https://api.test/admin/fleets/own-1/fee",
      method: "POST",
      body: { rideFee: 1.75, note: "Fee per ride 1.50 → 1.75" },
    });
    expect(lastCall().headers["X-Operator"]).toBe("tsitsi@lyniago.com");
    expect(revalidateMock).toHaveBeenCalledWith("/own-bikers");
  });

  it("pause / unpause / disable: the reason code, and the note only when there is one", async () => {
    await switchFleet("own-1", "pause", "NON_PAYMENT", "  bill overdue ");
    expect(lastCall()).toMatchObject({ url: "https://api.test/admin/fleets/own-1/pause", body: { reasonCode: "NON_PAYMENT", note: "bill overdue" } });
    await switchFleet("own-1", "disable", "MERCHANT_REQUEST", "");
    expect(lastCall()).toMatchObject({ url: "https://api.test/admin/fleets/own-1/disable", body: { reasonCode: "MERCHANT_REQUEST" } });
    expect(lastCall().body).not.toHaveProperty("note");
    await switchFleet("own-1", "unpause", "OTHER", "paid in cash");
    expect(lastCall().url).toBe("https://api.test/admin/fleets/own-1/unpause");
  });

  it("mark paid and adjust", async () => {
    await markFleetBillPaid("bill-1");
    expect(lastCall()).toMatchObject({ url: "https://api.test/admin/fleets/bills/bill-1/paid", body: {} });
    await adjustFleet("own-1", { merchantId: "m-1", orderId: "o-1", amount: -1.5, reason: "wrong fee" });
    expect(lastCall()).toMatchObject({
      url: "https://api.test/admin/fleets/own-1/adjust",
      body: { merchantId: "m-1", orderId: "o-1", amount: -1.5, reason: "wrong fee" },
    });
  });

  it("a refusal comes back in the API's words and refreshes nothing", async () => {
    fetchMock.mockResolvedValue(res(409, { statusCode: 409, message: "This bill is already marked paid." }));
    expect(await markFleetBillPaid("bill-1")).toEqual({ ok: false, message: "This bill is already marked paid." });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
