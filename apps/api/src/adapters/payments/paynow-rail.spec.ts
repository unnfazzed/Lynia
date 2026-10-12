import { describe, expect, it, vi } from "vitest";
import { encodePaynowMessage, parsePaynowMessage, paynowField } from "./paynow";
import { PaynowRail } from "./paynow-rail";

const KEY = "11111111-2222-3333-4444-555555555555";
const TOPUP = "0b8f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e";
const POLL = "https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc";

/** A fake Paynow: records every request and answers with the queued bodies. */
function fakePaynow(...replies: Array<string | { status: number; body: string }>) {
  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    const next = replies.shift() ?? "";
    const r = typeof next === "string" ? { status: 200, body: next } : next;
    return new Response(r.body, { status: r.status });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

function rail(fetchImpl: typeof fetch) {
  return new PaynowRail(
    {
      PAYNOW_BASE_URL: "https://www.paynow.co.zw",
      PAYNOW_RETURN_URL: "https://lyniago.com",
      integrationId: "27383",
      integrationKey: KEY,
      authEmail: "merchant@example.com",
      resultUrl: "https://api.example.com/webhooks/paynow",
    },
    fetchImpl,
  );
}

const signed = (fields: Array<[string, string]>): string => encodePaynowMessage(fields, KEY);

describe("PaynowRail.initiate (express checkout)", () => {
  it("POSTs a signed remotetransaction for EcoCash and maps Ok → pending with Paynow's reference and poll URL", async () => {
    const { calls, fetchImpl } = fakePaynow(
      signed([["status", "Ok"], ["instructions", "Dial *151#"], ["paynowreference", "1234567"], ["pollurl", POLL]]),
    );
    const r = await rail(fetchImpl).initiate({ topUpId: TOPUP, rail: "ecocash", amount: 5, phone: "+263 77 111 1111" });
    expect(r).toMatchObject({ status: "pending", providerRef: "1234567", pollUrl: POLL, rail: "ecocash" });
    expect(calls[0]!.url).toBe("https://www.paynow.co.zw/interface/remotetransaction");
    const sent = parsePaynowMessage(calls[0]!.body);
    expect(paynowField(sent, "id")).toBe("27383");
    expect(paynowField(sent, "reference")).toBe(TOPUP);
    expect(paynowField(sent, "amount")).toBe("5.00");
    expect(paynowField(sent, "phone")).toBe("0771111111");
    expect(paynowField(sent, "method")).toBe("ecocash");
    expect(paynowField(sent, "authemail")).toBe("merchant@example.com");
    expect(paynowField(sent, "merchanttrace")).toBe(TOPUP.replace(/-/g, ""));
    expect(paynowField(sent, "status")).toBe("Message");
    expect(paynowField(sent, "hash")).toMatch(/^[0-9A-F]{128}$/);
  });

  it("maps an immediate Error (insufficient balance, test number 0774444444) to failed — nothing was charged", async () => {
    const { fetchImpl } = fakePaynow("Status=Error&Error=Insufficient+balance");
    const r = await rail(fetchImpl).initiate({ topUpId: TOPUP, rail: "ecocash", amount: 5, phone: "0774444444" });
    expect(r).toMatchObject({ status: "failed", reason: "Insufficient balance" });
  });

  it("THROWS on an Ok reply whose hash doesn't verify (money may be moving: not a decline)", async () => {
    const { fetchImpl } = fakePaynow("status=Ok&paynowreference=1&pollurl=x&hash=DEADBEEF");
    await expect(rail(fetchImpl).initiate({ topUpId: TOPUP, rail: "ecocash", amount: 5, phone: "0771111111" })).rejects.toThrow(/hash/);
  });

  it("throws on an HTTP error (transport failure, not a decline)", async () => {
    const { fetchImpl } = fakePaynow({ status: 502, body: "" });
    await expect(rail(fetchImpl).initiate({ topUpId: TOPUP, rail: "ecocash", amount: 5, phone: "0771111111" })).rejects.toThrow(/502/);
  });

  it("refuses without calling Paynow: a non-Zimbabwe-mobile number, or the manual rail", async () => {
    const { calls, fetchImpl } = fakePaynow();
    expect((await rail(fetchImpl).initiate({ topUpId: TOPUP, rail: "ecocash", amount: 5, phone: "0242123456" })).status).toBe("failed");
    expect((await rail(fetchImpl).initiate({ topUpId: TOPUP, rail: "manual", amount: 5, phone: "0771111111" })).status).toBe("failed");
    expect(calls).toHaveLength(0);
  });

  it("drops a poll URL on any host but Paynow's, so a lookup can never be pointed elsewhere", async () => {
    const { fetchImpl } = fakePaynow(signed([["status", "Ok"], ["paynowreference", "1"], ["pollurl", "https://evil.example/poll"]]));
    const r = await rail(fetchImpl).initiate({ topUpId: TOPUP, rail: "ecocash", amount: 5, phone: "0771111111" });
    expect(r.pollUrl).toBeUndefined();
  });
});

describe("PaynowRail.confirm (poll, or trace when the poll URL never arrived)", () => {
  it("polls the poll URL and maps Paid → confirmed with the amount Paynow reports", async () => {
    const { calls, fetchImpl } = fakePaynow(
      signed([["reference", TOPUP], ["amount", "5.13"], ["paynowreference", "1234567"], ["pollurl", POLL], ["status", "Paid"]]),
    );
    const r = await rail(fetchImpl).confirm("1234567", { pollUrl: POLL });
    expect(r).toMatchObject({ status: "confirmed", amount: 5.13, providerRef: "1234567" });
    expect(calls[0]!.url).toBe(POLL);
  });

  it("falls back to /interface/trace by merchanttrace when there is no poll URL", async () => {
    const { calls, fetchImpl } = fakePaynow(signed([["reference", TOPUP], ["amount", "5.00"], ["paynowreference", "9"], ["status", "Cancelled"]]));
    const r = await rail(fetchImpl).confirm(TOPUP, { topUpId: TOPUP });
    expect(r.status).toBe("failed");
    expect(calls[0]!.url).toBe("https://www.paynow.co.zw/interface/trace");
    expect(paynowField(parsePaynowMessage(calls[0]!.body), "merchanttrace")).toBe(TOPUP.replace(/-/g, ""));
  });

  it("keeps NotFound / Error lookups pending: they don't prove nothing moved", async () => {
    const { fetchImpl } = fakePaynow("status=NotFound");
    expect((await rail(fetchImpl).confirm(TOPUP, { topUpId: TOPUP })).status).toBe("pending");
  });

  it("never POSTs a poll URL off Paynow's host", async () => {
    const { calls, fetchImpl } = fakePaynow();
    const r = await rail(fetchImpl).confirm("1", { pollUrl: "https://evil.example/poll" });
    expect(r.status).toBe("pending");
    expect(calls).toHaveLength(0);
  });
});

describe("PaynowRail.readStatusUpdate (the resulturl POST)", () => {
  it("verifies and maps a signed update, with our reference", () => {
    const body = signed([["reference", TOPUP], ["amount", "5.13"], ["paynowreference", "1234567"], ["pollurl", POLL], ["status", "Paid"]]);
    expect(rail(fakePaynow().fetchImpl).readStatusUpdate(body)).toMatchObject({ status: "confirmed", reference: TOPUP, amount: 5.13 });
  });

  it("returns null for a forged update", () => {
    expect(rail(fakePaynow().fetchImpl).readStatusUpdate(`reference=${TOPUP}&amount=5.00&status=Paid&hash=ABC`)).toBeNull();
  });
});
