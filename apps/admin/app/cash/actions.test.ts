import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runIntegrityCheck, topupAction } from "./actions";
import { reverseRiderWallet } from "../riders/actions";

/**
 * Admin console v2 §6: the money server actions, through the real admin API client with only `fetch` and the
 * Next request hooks mocked — so the exact path, body (reason, idempotency key) and refusal handling are pinned.
 */
const { headersMock, revalidateMock } = vi.hoisted(() => ({ headersMock: vi.fn(), revalidateMock: vi.fn() }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

const fetchMock = vi.fn();
const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(res(200));
  vi.stubGlobal("fetch", fetchMock);
  headersMock.mockResolvedValue(new Headers({ "x-lynia-operator": "ops@corp.com" }));
  revalidateMock.mockReset();
  process.env.API_BASE_URL = "https://api.test";
  process.env.ADMIN_API_TOKEN = "t";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_BASE_URL;
  delete process.env.ADMIN_API_TOKEN;
});

describe("topupAction", () => {
  it.each(["repoll", "credit-paid", "resolve"] as const)("%s posts the reason to its endpoint and refreshes the pages", async (action) => {
    await topupAction("t1", action, "The biker says they paid", "called them");
    expect(lastCall()).toEqual({ url: `https://api.test/admin/topups/t1/${action}`, body: { reason: "The biker says they paid", note: "called them" } });
    expect(revalidateMock).toHaveBeenCalledWith("/cash/topups");
  });

  it("refuses an unknown action without calling the API", async () => {
    await expect(topupAction("t1", "delete" as never, "r", "")).rejects.toThrow(/Unknown/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws the API's words so the dialog stays open", async () => {
    fetchMock.mockResolvedValue(res(409, { message: "Paynow hasn't reported a payment on this top-up, so there is nothing to credit." }));
    await expect(topupAction("t1", "credit-paid", "r", "")).rejects.toThrow(/nothing to credit/);
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("runIntegrityCheck", () => {
  it("posts to the integrity endpoint and refreshes /cash", async () => {
    await runIntegrityCheck();
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.test/admin/wallet/integrity-check");
    expect(revalidateMock).toHaveBeenCalledWith("/cash");
  });
});

describe("reverseRiderWallet", () => {
  it("posts amount, reason, note, the entry and the form-open key", async () => {
    await reverseRiderWallet("r-1", "2.5", "Credited twice", " Paid twice by mistake ", "key-1", "l9");
    expect(lastCall()).toEqual({
      url: "https://api.test/admin/riders/r-1/wallet-reversal",
      body: { amount: 2.5, reason: "Credited twice", note: "Paid twice by mistake", entryId: "l9", idempotencyKey: "key-1" },
    });
    expect(revalidateMock).toHaveBeenCalledWith("/riders/r-1");
  });

  it("refuses a bad amount, an amount over the cap, or no note — before calling the API", async () => {
    await expect(reverseRiderWallet("r-1", "0", "r", "n", "k")).rejects.toThrow(/amount/);
    await expect(reverseRiderWallet("r-1", "50.01", "r", "n", "k")).rejects.toThrow(/at most \$50\.00/);
    await expect(reverseRiderWallet("r-1", "1", "r", "  ", "k")).rejects.toThrow(/note/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
