import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creditRiderWallet, decideKyc, setKyc } from "./actions";

/**
 * Money + compliance server actions on the rider rail (item 1.6). These are the daily human-in-the-loop
 * MONEY controls: `creditRiderWallet` posts a real prepaid credit, and `decideKyc`/`setKyc` gate who can
 * earn. We exercise each action through the REAL admin API client (`adminPost` → `authHeaders` → fetch),
 * mocking only the transport (`fetch`) and Next request hooks — so the tests pin both the exact request
 * body (crucially, idempotency-key forwarding) AND the auth guards (bearer token + operator attribution),
 * with no network and no double-crediting of real balance.
 */

const { headersMock, revalidateMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  revalidateMock: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

const fetchMock = vi.fn();

/** A minimal fetch Response the admin client cares about (it reads only `.ok` / `.status` on a POST). */
const res = (status: number) => ({ ok: status >= 200 && status < 300, status });

/** The last fetch call decoded into url + method + parsed JSON body + header map. */
function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return {
    url,
    method: init.method,
    body: JSON.parse(init.body as string),
    headers: init.headers as Record<string, string>,
  };
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

describe("creditRiderWallet (manual prepaid credit — the launch top-up rail)", () => {
  it("posts a rail=manual credit with the coerced amount and forwards the audit auth headers", async () => {
    await creditRiderWallet("rider-1", "25", "launch grace", "key-abc");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/riders/rider-1/wallet-credit");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({
      amount: 25, // coerced from the string input
      rail: "manual",
      idempotencyKey: "key-abc",
      note: "launch grace",
    });
    // The auth guard the audit trail depends on: shared admin bearer + the human operator attribution.
    expect(c.headers.Authorization).toBe("Bearer test-admin-token");
    expect(c.headers["X-Operator"]).toBe("alice@corp.com");
    expect(revalidateMock).toHaveBeenCalledWith("/riders/rider-1");
  });

  it("IDEMPOTENCY/REPLAY (WD-003): a same-key resubmit re-sends the SAME key and surfaces the credit, not a double-credit or an error", async () => {
    // Simulate the backend's exactly-once behavior: TopUp.providerRef @unique collapses a replay of the
    // same idempotency key to the one already-recorded credit and returns success both times.
    fetchMock.mockResolvedValue(res(200));

    await expect(creditRiderWallet("rider-1", "40", "support fix", "dup-key")).resolves.toBeUndefined();
    // A lost-response retry inside the same dialog re-invokes the action with the SAME form-open key.
    await expect(creditRiderWallet("rider-1", "40", "support fix", "dup-key")).resolves.toBeUndefined();

    const first = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    const second = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
    // The action must FORWARD the key (not mint a fresh UUID each call) — that is what lets the backend
    // dedup the two requests into a single credit instead of doubling real balance.
    expect(first.idempotencyKey).toBe("dup-key");
    expect(second.idempotencyKey).toBe("dup-key");
    expect(second).toEqual(first);
    // Neither call threw: the replay surfaced the already-credited result rather than erroring.
  });

  it("mints a fallback idempotency key only when the client sent none (never a blank key)", async () => {
    await creditRiderWallet("rider-1", "10", "grace", "");
    const key = lastCall().body.idempotencyKey as string;
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
    expect(key).toMatch(/^[0-9a-f-]{36}$/i); // crypto.randomUUID() fallback
  });

  it("rejects a non-positive / non-numeric amount BEFORE any credit is posted", async () => {
    for (const bad of ["0", "-5", "abc", "", " "]) {
      await expect(creditRiderWallet("rider-1", bad, "n", "k")).rejects.toThrow(/positive amount/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("FAILS CLOSED: an API auth rejection (401/403) throws instead of reporting a phantom credit", async () => {
    for (const status of [401, 403]) {
      fetchMock.mockResolvedValueOnce(res(status));
      await expect(creditRiderWallet("rider-1", "25", "n", "k")).rejects.toThrow(/Failed to credit/i);
    }
    // A failed credit must NOT revalidate as though it succeeded.
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("no-ops on a missing rider id without hitting the API", async () => {
    await expect(creditRiderWallet("", "25", "n", "k")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still sends the credit without an Authorization header when the shared token is unset (API then rejects)", async () => {
    delete process.env.ADMIN_API_TOKEN;
    await creditRiderWallet("rider-1", "5", "n", "k");
    expect(lastCall().headers.Authorization).toBeUndefined();
  });
});

describe("decideKyc (A-02 KYC decision — gates who can earn)", () => {
  it("approve → verified carries no reason code", async () => {
    await decideKyc("p1", "verified", null, "looks good");
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/riders/p1/kyc");
    expect(c.body).toEqual({ status: "verified", note: "looks good" });
    expect(revalidateMock).toHaveBeenCalledWith("/riders/p1/kyc");
    expect(revalidateMock).toHaveBeenCalledWith("/riders/p1");
    expect(revalidateMock).toHaveBeenCalledWith("/riders");
  });

  it("decline → failed carries the reason code (recorded on rider + audit) and null note when blank", async () => {
    await decideKyc("p1", "failed", "blurry_document");
    expect(lastCall().body).toEqual({ status: "failed", reasonCode: "blurry_document", note: null });
  });

  it("FAILS CLOSED: a compliance-write rejection throws (never silently fails open on a KYC decision)", async () => {
    fetchMock.mockResolvedValue(res(403));
    await expect(decideKyc("p1", "verified", null)).rejects.toThrow(/Failed to record KYC/i);
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("setKyc (queue-backstop KYC write, FormData)", () => {
  const fd = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };

  it("posts a valid decision and revalidates the queue", async () => {
    await setKyc(fd({ profileId: "p9", status: "verified" }));
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/riders/p9/kyc");
    expect(c.body).toEqual({ status: "verified" });
    expect(revalidateMock).toHaveBeenCalledWith("/riders");
  });

  it("ignores an out-of-set status or a missing profile id (no write, no throw)", async () => {
    await expect(setKyc(fd({ profileId: "p9", status: "approved" }))).resolves.toBeUndefined();
    await expect(setKyc(fd({ profileId: "", status: "verified" }))).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("FAILS CLOSED on a rejected write", async () => {
    fetchMock.mockResolvedValue(res(500));
    await expect(setKyc(fd({ profileId: "p9", status: "failed" }))).rejects.toThrow(/Failed to set KYC/i);
  });
});
