import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { birdVerifyBaseUrl, birdVerifyChannels, birdVerifyCheck, birdVerifyStart } from "./bird-verify";

describe("birdVerifyBaseUrl", () => {
  it("derives the region-scoped host from the key prefix", () => {
    expect(birdVerifyBaseUrl("bk_eu1_abc123")).toBe("https://eu1.platform.bird.com");
    expect(birdVerifyBaseUrl("bk_us1_abc123")).toBe("https://us1.platform.bird.com");
  });

  it("throws on a key that doesn't look like a Bird workspace key", () => {
    expect(() => birdVerifyBaseUrl("not-a-bird-key")).toThrow(/doesn't look like a Bird workspace key/i);
    expect(() => birdVerifyBaseUrl("")).toThrow();
  });
});

const cfg = (over: Partial<Env> = {}): Env =>
  ({
    OTP_CHANNEL: "bird-verify",
    BIRD_VERIFY_API_KEY: "bk_eu1_testkey",
    ...over,
  }) as Env;

/** Swap global fetch for the duration of fn, then restore (even on throw) — mirrors otp-sender.spec.ts. */
async function withFetch<T>(f: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = f;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

describe("birdVerifyStart", () => {
  it("throws when not configured (loud fail — never a false 'sent')", async () => {
    await expect(birdVerifyStart({ OTP_CHANNEL: "bird-verify" } as Env, "+263770000001")).rejects.toThrow(
      /couldn't send the verification code/i,
    );
  });

  it("POSTs to the region-scoped create endpoint with a Bearer key, code_length 6, and WhatsApp only (no SMS fallback)", async () => {
    let called: { url: string; init: RequestInit } | undefined;
    const fetchMock = (async (url: string, init: RequestInit) => {
      called = { url, init };
      return new Response(JSON.stringify({ id: "vrf_1", last_channel: "whatsapp" }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await withFetch(fetchMock, () => birdVerifyStart(cfg(), "+263771234567"));
    expect(called?.url).toBe("https://eu1.platform.bird.com/v1/verify/verifications");
    const headers = called!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer bk_eu1_testkey");
    const body = JSON.parse(called!.init.body as string);
    expect(body.to).toEqual({ phone_number: "+263771234567" });
    expect(body.options).toEqual({ code_length: 6, channels: ["whatsapp"] });
    expect(res).toEqual({ channel: "whatsapp" });
  });

  it("falls back to 'sms' for an unrecognized last_channel — defensive display mapping only; Bird was never asked to send SMS", async () => {
    const fetchMock = (async () =>
      new Response(JSON.stringify({ id: "vrf_3", last_channel: "telegram" }), { status: 200 })) as unknown as typeof fetch;
    const res = await withFetch(fetchMock, () => birdVerifyStart(cfg(), "+263771234567"));
    expect(res).toEqual({ channel: "sms" });
  });

  it("E2E 2026-10-05 P-8: a reply without last_channel reports the requested channel (WhatsApp), never 'sms'", async () => {
    for (const reply of [{ id: "vrf_4" }, {}]) {
      const fetchMock = (async () => new Response(JSON.stringify(reply), { status: 200 })) as unknown as typeof fetch;
      const res = await withFetch(fetchMock, () => birdVerifyStart(cfg(), "+263771234567"));
      expect(res).toEqual({ channel: "whatsapp" });
    }
  });

  it("throws when Bird rejects the create call (so requestOtp errors, not a silent non-delivery)", async () => {
    const fetchMock = (async () =>
      new Response('{"error":"no eligible channel"}', { status: 422 })) as unknown as typeof fetch;
    await expect(withFetch(fetchMock, () => birdVerifyStart(cfg(), "+263770000001"))).rejects.toThrow(/couldn't send/i);
  });

  it("throws on a network error", async () => {
    const fetchMock = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(withFetch(fetchMock, () => birdVerifyStart(cfg(), "+263770000001"))).rejects.toThrow(/couldn't send/i);
  });

  it("asks for WhatsApp then SMS where Bird's shared WhatsApp sender won't carry a code, and reports the SMS it fell back to", async () => {
    let body: { options?: unknown } = {};
    const fetchMock = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ id: "vrf_5", last_channel: "sms" }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await withFetch(fetchMock, () => birdVerifyStart(cfg(), "+27821234567"));
    expect(body.options).toEqual({ code_length: 6, channels: ["whatsapp", "sms"] });
    expect(res).toEqual({ channel: "sms" });
  });
});

describe("birdVerifyChannels", () => {
  it("keeps WhatsApp only for Zimbabwe and the other countries the shared sender serves", () => {
    for (const phone of ["+263771234567", "+447911123456", "+12025550123", "+26771234567", "+61412345678", "+79161234567"]) {
      expect(birdVerifyChannels(phone)).toEqual(["whatsapp"]);
    }
  });

  it("adds SMS after WhatsApp for every country on Bird's no-WhatsApp-passcode list", () => {
    const phones = [
      "+8801712345678", // Bangladesh
      "+201001234567", // Egypt
      "+919812345678", // India
      "+6281234567890", // Indonesia
      "+9647701234567", // Iraq
      "+77011234567", // Kazakhstan
      "+76001234567", // Kazakhstan
      "+96550012345", // Kuwait
      "+60123456789", // Malaysia
      "+212612345678", // Morocco
      "+9779812345678", // Nepal
      "+2348012345678", // Nigeria
      "+96891234567", // Oman
      "+923001234567", // Pakistan
      "+966501234567", // Saudi Arabia
      "+27821234567", // South Africa
      "+94771234567", // Sri Lanka
      "+380501234567", // Ukraine
      "+971501234567", // United Arab Emirates
    ];
    for (const phone of phones) expect(birdVerifyChannels(phone)).toEqual(["whatsapp", "sms"]);
  });
});

describe("birdVerifyCheck", () => {
  it("throws when not configured", async () => {
    await expect(
      birdVerifyCheck({ OTP_CHANNEL: "bird-verify" } as Env, "+263770000001", "123456"),
    ).rejects.toThrow(/couldn't verify the code/i);
  });

  it("POSTs {to, code} to the check endpoint and reports success", async () => {
    let called: { url: string; init: RequestInit } | undefined;
    const fetchMock = (async (url: string, init: RequestInit) => {
      called = { url, init };
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await withFetch(fetchMock, () => birdVerifyCheck(cfg(), "+263771234567", "123456"));
    expect(called?.url).toBe("https://eu1.platform.bird.com/v1/verify/verifications/check");
    const body = JSON.parse(called!.init.body as string);
    expect(body).toEqual({ to: { phone_number: "+263771234567" }, code: "123456" });
    expect(res).toEqual({ success: true });
  });

  it("maps a wrong code (200, success:false, incorrect_code) to reason 'invalid' — a normal answer, not a throw", async () => {
    const fetchMock = (async () =>
      new Response(JSON.stringify({ success: false, reason: "incorrect_code" }), { status: 200 })) as unknown as typeof fetch;
    const res = await withFetch(fetchMock, () => birdVerifyCheck(cfg(), "+263771234567", "000000"));
    expect(res).toEqual({ success: false, reason: "invalid" });
  });

  it("maps attempts_exhausted to 'locked'", async () => {
    const fetchMock = (async () =>
      new Response(JSON.stringify({ success: false, reason: "attempts_exhausted" }), { status: 200 })) as unknown as typeof fetch;
    const res = await withFetch(fetchMock, () => birdVerifyCheck(cfg(), "+263771234567", "000000"));
    expect(res).toEqual({ success: false, reason: "locked" });
  });

  it("maps expired to 'expired'", async () => {
    const fetchMock = (async () =>
      new Response(JSON.stringify({ success: false, reason: "expired" }), { status: 200 })) as unknown as typeof fetch;
    const res = await withFetch(fetchMock, () => birdVerifyCheck(cfg(), "+263771234567", "000000"));
    expect(res).toEqual({ success: false, reason: "expired" });
  });

  // "A final verification cannot be checked again... further checks return 404" (docs.bird.com). This
  // is exactly the shape of a client that timed out on a successful check and retried (§6) — mapping it
  // to "expired" (not a throw) routes it into AuthService's existing post-verify retry grace.
  it("maps a 404 (already-final verification) to reason 'expired', not a throw", async () => {
    const fetchMock = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    const res = await withFetch(fetchMock, () => birdVerifyCheck(cfg(), "+263771234567", "123456"));
    expect(res).toEqual({ success: false, reason: "expired" });
  });

  it("throws (does not silently count as invalid) when Bird itself errors", async () => {
    const fetchMock = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    await expect(withFetch(fetchMock, () => birdVerifyCheck(cfg(), "+263771234567", "123456"))).rejects.toThrow(
      /couldn't verify/i,
    );
  });

  it("throws on a network error", async () => {
    const fetchMock = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(withFetch(fetchMock, () => birdVerifyCheck(cfg(), "+263771234567", "123456"))).rejects.toThrow(
      /couldn't verify/i,
    );
  });

  it("never sends the code in a header or query string — only in the JSON body", async () => {
    let called: { url: string; init: RequestInit } | undefined;
    const fetchMock = (async (url: string, init: RequestInit) => {
      called = { url, init };
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;
    await withFetch(fetchMock, () => birdVerifyCheck(cfg(), "+263771234567", "999888"));
    expect(called!.url).not.toContain("999888");
    expect(JSON.stringify(called!.init.headers)).not.toContain("999888");
  });
});
