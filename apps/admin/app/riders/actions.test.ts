import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creditRiderWallet, decideKyc, setKyc, verifyPlate } from "./actions";

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

/** D-75: the API's 409 when an approval's ID-check number is already on another live account. */
const verifiedIdInUse = {
  ok: false,
  status: 409,
  json: async () => ({
    reason: "verified_id_in_use",
    message: "Can't approve: the national ID from this rider's ID check is already on another live account. Resolve that account first.",
  }),
};

describe("decideKyc (A-02 KYC decision — gates who can earn)", () => {
  it("approve → verified carries no reason code", async () => {
    await expect(decideKyc("p1", "verified", null, "looks good")).resolves.toEqual({ ok: true });
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

  it("FAILS CLOSED: a compliance-write rejection comes back as a failure (never silently fails open on a KYC decision)", async () => {
    fetchMock.mockResolvedValue(res(403));
    await expect(decideKyc("p1", "verified", null)).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/session may have expired|reach the server/i),
    });
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("D-75: a refused approval is RETURNED in the API's own words (a throw would be redacted in production)", async () => {
    fetchMock.mockResolvedValue(verifiedIdInUse);
    await expect(decideKyc("p1", "verified", null)).resolves.toEqual({
      ok: false,
      message: "Can't approve: the national ID from this rider's ID check is already on another live account. Resolve that account first.",
    });
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
    await expect(setKyc(fd({ profileId: "p9", status: "verified" }))).resolves.toEqual({ ok: true });
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/riders/p9/kyc");
    expect(c.body).toEqual({ status: "verified" });
    expect(revalidateMock).toHaveBeenCalledWith("/riders");
  });

  it("refuses an out-of-set status or a missing profile id without writing", async () => {
    await expect(setKyc(fd({ profileId: "p9", status: "approved" }))).resolves.toMatchObject({ ok: false });
    await expect(setKyc(fd({ profileId: "", status: "verified" }))).resolves.toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("FAILS CLOSED on a rejected write", async () => {
    fetchMock.mockResolvedValue(res(500));
    await expect(setKyc(fd({ profileId: "p9", status: "failed" }))).resolves.toMatchObject({ ok: false });
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("D-75: a refused quick approval is RETURNED in the API's own words", async () => {
    fetchMock.mockResolvedValue(verifiedIdInUse);
    await expect(setKyc(fd({ profileId: "p9", status: "verified" }))).resolves.toEqual({
      ok: false,
      message: expect.stringContaining("already on another live account"),
    });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});

describe("verifyPlate (First Run v2 E4, D-80 — ops confirm a rider's plate)", () => {
  it("posts the plate ops looked at, with the reason and note, and refreshes the profile + list", async () => {
    await verifyPlate("rider-1", "ABZ 4417", "Matches the bike photo", "seen on WhatsApp");
    const c = lastCall();
    expect(c.url).toBe("https://api.test/admin/riders/rider-1/plate-verify");
    expect(c.method).toBe("POST");
    expect(c.body).toEqual({ plate: "ABZ 4417", reason: "Matches the bike photo", note: "seen on WhatsApp" });
    expect(c.headers.Authorization).toBe("Bearer test-admin-token");
    expect(revalidateMock).toHaveBeenCalledWith("/riders/rider-1");
    expect(revalidateMock).toHaveBeenCalledWith("/riders");
  });

  it("a refusal (the rider changed the plate since: 409) throws so the modal stays open, and refreshes nothing", async () => {
    fetchMock.mockResolvedValueOnce(res(409));
    await expect(verifyPlate("rider-1", "ABZ 4417", null, "")).rejects.toThrow(/Couldn't confirm the plate/);
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("refuses to post without a plate", async () => {
    await expect(verifyPlate("rider-1", "", null, "")).rejects.toThrow(/no plate/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
