import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveIssue } from "./actions";

/**
 * Dispute resolution (item 1.6). A `refund` resolution (A-06) hands cash to the customer, netted off the
 * rider's settlement — so this is a money-moving control. Tests run the action through the real admin
 * client with a mocked transport, pinning the resolve body shape and the fail-closed guard that a second
 * resolve of an already-resolved issue cannot silently double-refund.
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

describe("resolveIssue (A-05/A-06 dispute resolution)", () => {
  it("refund: posts { resolution, note, refundAmount } with the amount coerced to a number", async () => {
    await resolveIssue("i1", "refund", "goods damaged", "7.50");
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/issues/i1/resolve");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({ resolution: "refund", note: "goods damaged", refundAmount: 7.5 });
    expect(c.headers.Authorization).toBe("Bearer test-admin-token");
    expect(c.headers["X-Operator"]).toBe("alice@corp.com");
    expect(revalidateMock).toHaveBeenCalledWith("/issues/i1");
    expect(revalidateMock).toHaveBeenCalledWith("/issues");
  });

  it("omits refundAmount when none was entered, and omits note when blank (note is optional, not nullable)", async () => {
    await resolveIssue("i1", "refund", "");
    expect(lastCall().body).toEqual({ resolution: "refund" });
  });

  it("does NOT attach a refundAmount to a non-refund resolution even if one is passed", async () => {
    await resolveIssue("i1", "rider_strike", "third strike", "9");
    expect(lastCall().body).toEqual({ resolution: "rider_strike", note: "third strike" });
  });

  it("CANNOT REFUND TWICE: a second resolve of an already-resolved issue (API 409) throws rather than double-refunding", async () => {
    fetchMock.mockResolvedValueOnce(res(200)); // first refund lands
    fetchMock.mockResolvedValueOnce(res(409)); // issue already resolved → backend rejects the replay

    await expect(resolveIssue("i1", "refund", "goods damaged", "7.50")).resolves.toBeUndefined();
    await expect(resolveIssue("i1", "refund", "goods damaged", "7.50")).rejects.toThrow(/Failed to resolve issue/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("FAILS CLOSED / AUTHZ: an auth rejection (401) throws and does not revalidate", async () => {
    fetchMock.mockResolvedValue(res(401));
    await expect(resolveIssue("i1", "refund", "n", "5")).rejects.toThrow(/Failed to resolve issue/i);
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
