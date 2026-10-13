import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logMerchantCall, moveMerchantApplication, recordMerchantLicence, resolveHandshake, transferMerchantOwner, verifyMerchantLicence, writeOffDebt } from "./actions";

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

describe("writeOffDebt (D3, 2026-10-07: the only write-off of a food debt)", () => {
  it("posts the reason/note to write-off-debt and revalidates the order and the disputes queue", async () => {
    await writeOffDebt("order-1", "Biker unreachable after follow-up", "called twice");
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/orders/order-1/write-off-debt");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({ reason: "Biker unreachable after follow-up", note: "called twice" });
    expect(revalidateMock).toHaveBeenCalledWith("/orders/order-1");
    expect(revalidateMock).toHaveBeenCalledWith("/merchants/disputes");
  });

  it("FAILS CLOSED: a rejected write-off throws and does NOT revalidate", async () => {
    fetchMock.mockResolvedValue(res(409));
    await expect(writeOffDebt("order-1", "x", "")).rejects.toThrow(/Failed to write off/i);
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("merchant application actions (admin console v2 §5)", () => {
  it("moves an application with {reason, note}, then revalidates the profile and the list", async () => {
    const out = await moveMerchantApplication("m-1", "reject", "outside_area", " Chitungwiza ");
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/merchants/m-1/application/reject");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({ reason: "outside_area", note: "Chitungwiza" });
    expect(c.headers["X-Operator"]).toBe("alice@corp.com");
    expect(out).toEqual({ ok: true });
    expect(revalidateMock).toHaveBeenCalledWith("/merchants/m-1");
    expect(revalidateMock).toHaveBeenCalledWith("/merchants");
  });

  it("FAILS CLOSED with the API's own words: a refusal is returned (not thrown, which production would redact) and nothing revalidates", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ reason: "checklist_incomplete", message: "Not every check passes yet: Ops call." }),
    });
    const out = await moveMerchantApplication("m-1", "approve", "Every check passed", "");
    expect(out).toEqual({ ok: false, message: "Not every check passes yet: Ops call." });
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("logs a call with its outcome and a null blank note", async () => {
    await logMerchantCall("m-1", "reached", "  ");
    expect(lastCall().url).toBe("https://api.test/admin/merchants/m-1/application/call");
    expect(lastCall().body).toEqual({ outcome: "reached", note: null });
  });

  it("records and verifies a pharmacy licence", async () => {
    await recordMerchantLicence("m-1", { licenceNumber: " PCZ-1 ", pharmacistName: "R. Dube", reference: "" }, "");
    expect(lastCall().url).toBe("https://api.test/admin/merchants/m-1/application/licence");
    expect(lastCall().body).toEqual({ licenceNumber: "PCZ-1", pharmacistName: "R. Dube", reference: null, note: null });
    await verifyMerchantLicence("m-1", "Licence seen — number and pharmacist match", "");
    expect(lastCall().url).toBe("https://api.test/admin/merchants/m-1/application/licence/verify");
    expect(lastCall().body).toEqual({ reason: "Licence seen — number and pharmacist match", note: null });
  });
});

describe("transferMerchantOwner (merchant web upgrade L4: support hands a business over)", () => {
  it("posts the new owner's phone and the required note, the reason leading it, then revalidates the profile", async () => {
    const out = await transferMerchantOwner("m-1", " 0773 000 003 ", "Sold or handed over — both people confirmed", " saw Chipo's ID at the shop ");

    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/merchants/m-1/owner");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({ phone: "0773 000 003", note: "Sold or handed over — both people confirmed — saw Chipo's ID at the shop" });
    expect(c.headers["X-Operator"]).toBe("alice@corp.com");
    expect(out).toEqual({ ok: true });
    expect(revalidateMock).toHaveBeenCalledWith("/merchants/m-1");
  });

  it("returns the API's refusal in its own words and revalidates nothing", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ reason: "member_elsewhere", message: "That number works at another business. They must leave it first." }),
    });
    const out = await transferMerchantOwner("m-1", "0773000003", null, "checked ID");
    expect(out).toEqual({ ok: false, message: "That number works at another business. They must leave it first." });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
