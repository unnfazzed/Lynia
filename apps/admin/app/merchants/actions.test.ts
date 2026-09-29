import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveHandshake, setMerchantPilot } from "./actions";

/**
 * X1/R-05: the admin action that releases a frozen doorstep handshake — a rider's job lock and a
 * customer's masked delivery code both hinge on this POST landing. Mirrors riders/actions.test.ts's
 * pattern: exercise the REAL admin API client, mocking only the transport + Next request hooks.
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

describe("resolveHandshake (R-05 admin dispute resolution)", () => {
  it("posts the reason/note and revalidates both the order detail and the disputes queue", async () => {
    await resolveHandshake("order-1", "Called both parties — amounts matched", "spoke to both at 14:02");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/orders/order-1/resolve-handshake");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({ reason: "Called both parties — amounts matched", note: "spoke to both at 14:02" });
    expect(c.headers.Authorization).toBe("Bearer test-admin-token");
    expect(c.headers["X-Operator"]).toBe("alice@corp.com");
    expect(revalidateMock).toHaveBeenCalledWith("/orders/order-1");
    expect(revalidateMock).toHaveBeenCalledWith("/merchants/disputes");
  });

  it("sends an empty-string reason as \"\" (never null) and a blank note as null", async () => {
    await resolveHandshake("order-1", null, "");
    expect(lastCall().body).toEqual({ reason: "", note: null });
  });

  it("FAILS CLOSED: a rejected write throws and does NOT revalidate — a rider/customer must not see a phantom release", async () => {
    fetchMock.mockResolvedValue(res(409));
    await expect(resolveHandshake("order-1", "x", "")).rejects.toThrow(/Failed to resolve handshake/i);
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("setMerchantPilot (merchant web upgrade L1: the go-live switch)", () => {
  it("posts {enabled, note} with the picked reason leading the audit note, then revalidates the profile and the list", async () => {
    const out = await setMerchantPilot("m-1", true, "Ops call done — every go-live check passed", " spoke to Tendai ");

    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/merchants/m-1/pilot");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({ enabled: true, note: "Ops call done — every go-live check passed — spoke to Tendai" });
    expect(c.headers["X-Operator"]).toBe("alice@corp.com");
    expect(out).toEqual({ ok: true });
    expect(revalidateMock).toHaveBeenCalledWith("/merchants/m-1");
    expect(revalidateMock).toHaveBeenCalledWith("/merchants");
  });

  it("sends a null note when there is neither a reason nor a note", async () => {
    await setMerchantPilot("m-1", false, null, "  ");
    expect(lastCall().body).toEqual({ enabled: false, note: null });
  });

  it("FAILS CLOSED with the API's own words: a refusal is returned (not thrown, which production would redact) and nothing revalidates", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ reason: "no_live_dishes", message: "This restaurant has no dish with a photo yet — its menu would be empty." }),
    });
    const out = await setMerchantPilot("m-1", true, null, "");
    expect(out).toEqual({ ok: false, message: "This restaurant has no dish with a photo yet — its menu would be empty." });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
