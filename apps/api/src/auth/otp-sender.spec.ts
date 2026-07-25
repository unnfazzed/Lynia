import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import {
  BirdOtpSender,
  buildBirdSmsRequest,
  buildLocalSmsRequest,
  buildOtpSmsText,
  buildWhatsAppOtpRequest,
  ConsoleOtpSender,
  LocalSmsOtpSender,
  selectOtpSender,
  SmsOtpSender,
  WhatsAppOtpSender,
} from "./otp-sender";

const env = (channel: Env["OTP_CHANNEL"]) => ({ OTP_CHANNEL: channel }) as Env;

describe("selectOtpSender", () => {
  it("selects the channel from config", () => {
    expect(selectOtpSender(env("console")).channel()).toBe("console");
    expect(selectOtpSender(env("sms")).channel()).toBe("sms");
    expect(selectOtpSender(env("bird")).channel()).toBe("bird");
    expect(selectOtpSender(env("local-sms")).channel()).toBe("local-sms");
    expect(selectOtpSender(env("whatsapp")).channel()).toBe("whatsapp");
  });
});

describe("buildWhatsAppOtpRequest", () => {
  it("normalizes the phone to digits and puts the code in the body + copy-code button", () => {
    const body = buildWhatsAppOtpRequest("+263 77 123 4567", "123456", {
      template: "otp",
      lang: "en",
      copyCodeButton: true,
    }) as Record<string, unknown>;
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("263771234567"); // digits only, no '+'/spaces
    const template = body.template as Record<string, unknown>;
    expect(template.name).toBe("otp");
    expect(template.language).toEqual({ code: "en" });
    expect(template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "123456" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
    ]);
  });

  it("omits the button for a body-only template", () => {
    const body = buildWhatsAppOtpRequest("263770000001", "999000", {
      template: "otp",
      lang: "pt_BR",
      copyCodeButton: false,
    }) as Record<string, unknown>;
    const template = body.template as Record<string, unknown>;
    expect(template.components).toEqual([{ type: "body", parameters: [{ type: "text", text: "999000" }] }]);
    expect(template.language).toEqual({ code: "pt_BR" });
  });
});

const cfg = (over: Partial<Env> = {}): Env =>
  ({
    OTP_CHANNEL: "whatsapp",
    WHATSAPP_PHONE_NUMBER_ID: "PNID",
    WHATSAPP_ACCESS_TOKEN: "TOKEN",
    WHATSAPP_TEMPLATE_NAME: "otp",
    WHATSAPP_TEMPLATE_LANG: "en",
    WHATSAPP_GRAPH_VERSION: "v21.0",
    WHATSAPP_GRAPH_BASE_URL: "https://graph.example",
    WHATSAPP_OTP_COPY_CODE_BUTTON: "true",
    ...over,
  }) as Env;

/** Swap global fetch for the duration of fn, then restore (even on throw). */
async function withFetch<T>(f: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = f;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

describe("WhatsAppOtpSender.send", () => {
  it("throws when not configured (loud fail — never a false 'sent')", async () => {
    const sender = new WhatsAppOtpSender({ OTP_CHANNEL: "whatsapp" } as Env);
    // Still a loud fail (throws + logs the config detail); the user-facing message is now plain-language
    // ("verification code") instead of leaking the internal "OTP … not configured".
    await expect(sender.send("+263770000001", "111222")).rejects.toThrow(/couldn't send the verification code/i);
  });

  it("POSTs the template message to the Graph API and resolves on 200", async () => {
    let called: { url: string; init: RequestInit } | undefined;
    const fetchMock = (async (url: string, init: RequestInit) => {
      called = { url, init };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await withFetch(fetchMock, () => new WhatsAppOtpSender(cfg()).send("+263770000001", "123456"));
    expect(called?.url).toBe("https://graph.example/v21.0/PNID/messages");
    expect((called!.init.headers as Record<string, string>).authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(called!.init.body as string).to).toBe("263770000001");
  });

  it("throws when Meta rejects the send (so requestOtp errors, not a silent non-delivery)", async () => {
    const fetchMock = (async () =>
      new Response('{"error":{"message":"bad template"}}', { status: 400 })) as unknown as typeof fetch;
    await expect(
      withFetch(fetchMock, () => new WhatsAppOtpSender(cfg()).send("+263770000001", "123456")),
    ).rejects.toThrow(/couldn't send/i);
  });
});

describe("buildOtpSmsText", () => {
  it("puts the code first and names the brand (so iOS/Android autofill can find it)", () => {
    const msg = buildOtpSmsText("123456", { brand: "LyniaGo" });
    expect(msg.startsWith("123456 ")).toBe(true);
    expect(msg).toContain("LyniaGo verification code");
    expect(msg).not.toContain("\n"); // no app-hash line when the hash is unset
  });

  it("appends the Android SMS-Retriever hash on its own line, staying under 140 bytes", () => {
    const msg = buildOtpSmsText("123456", { brand: "LyniaGo", appHash: "FA+9qCX9VSu" });
    expect(msg.endsWith("\n\nFA+9qCX9VSu")).toBe(true);
    // SMS Retriever requires the whole message to be <= 140 bytes.
    expect(Buffer.byteLength(msg, "utf8")).toBeLessThanOrEqual(140);
  });
});

describe("buildBirdSmsRequest", () => {
  it("addresses the recipient as an E.164 phone number (keeps the '+') with a plain-text body", () => {
    const body = buildBirdSmsRequest("+263771234567", "hello") as Record<string, unknown>;
    expect(body.to).toBe("+263771234567");
    expect(body.text).toBe("hello");
  });

  // Free-text sends are rejected without a category, and "authentication" is what tells Bird to route
  // this as OTP traffic rather than bulk — the difference that matters on a grey-route-filtered network.
  it("always classifies the message as authentication traffic", () => {
    expect(buildBirdSmsRequest("+263771234567", "hello").category).toBe("authentication");
  });

  // Omitted, Bird picks from its shared pool; a destination with no eligible pool sender rejects the
  // send (E12003), so `from` must reach the wire verbatim when configured.
  it("omits 'from' unless a sender is configured, and passes it through when it is", () => {
    expect(buildBirdSmsRequest("+263771234567", "hello")).not.toHaveProperty("from");
    expect(buildBirdSmsRequest("+263771234567", "hello", { from: "LyniaGo" }).from).toBe("LyniaGo");
  });
});

const birdCfg = (over: Partial<Env> = {}): Env =>
  ({
    OTP_CHANNEL: "bird",
    BIRD_ACCESS_KEY: "KEY",
    BIRD_BASE_URL: "https://bird.example",
    BIRD_BRAND_NAME: "LyniaGo",
    ...over,
  }) as Env;

describe("BirdOtpSender.send", () => {
  it("throws when not configured (loud fail — never a false 'sent')", async () => {
    const sender = new BirdOtpSender({ OTP_CHANNEL: "bird" } as Env);
    await expect(sender.send("+263770000001", "111222")).rejects.toThrow(/couldn't send the verification code/i);
  });

  it("POSTs to the region-scoped SMS API with a Bearer key and resolves on 202", async () => {
    let called: { url: string; init: RequestInit } | undefined;
    const fetchMock = (async (url: string, init: RequestInit) => {
      called = { url, init };
      return new Response("{}", { status: 202 });
    }) as unknown as typeof fetch;
    await withFetch(fetchMock, () =>
      new BirdOtpSender(birdCfg({ BIRD_SMS_FROM: "LyniaGo" } as Partial<Env>)).send("+263771234567", "123456"),
    );
    // The channels route (/workspaces/{ws}/channels/{ch}/messages) answers RouteNotFound on the
    // regional hosts — this endpoint is the one that exists.
    expect(called?.url).toBe("https://bird.example/v1/sms/messages");
    const headers = called!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer KEY");
    expect(headers["idempotency-key"]).toBeTruthy();
    const sent = JSON.parse(called!.init.body as string);
    expect(sent.to).toBe("+263771234567");
    expect(sent.category).toBe("authentication");
    expect(sent.from).toBe("LyniaGo");
    expect(sent.text).toContain("123456");
    expect(sent.text).toContain("LyniaGo");
  });

  // A resend must produce a real second SMS, so the key must differ per attempt — reusing one would
  // let Bird dedupe the resend away and strand the user with no code.
  it("uses a fresh idempotency key per send so a resend is never deduped away", async () => {
    const keys: string[] = [];
    const fetchMock = (async (_url: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)["idempotency-key"]);
      return new Response("{}", { status: 202 });
    }) as unknown as typeof fetch;
    await withFetch(fetchMock, async () => {
      const sender = new BirdOtpSender(birdCfg());
      await sender.send("+263771234567", "123456");
      await sender.send("+263771234567", "123456");
    });
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("omits 'from' when no sender is configured (Bird falls back to its shared pool)", async () => {
    let body: Record<string, unknown> | undefined;
    const fetchMock = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response("{}", { status: 202 });
    }) as unknown as typeof fetch;
    await withFetch(fetchMock, () => new BirdOtpSender(birdCfg()).send("+263771234567", "123456"));
    expect(body).not.toHaveProperty("from");
  });

  it("throws when Bird rejects the send (so requestOtp errors, not a silent non-delivery)", async () => {
    // The real shape of the rejection this guards against: no sender eligible for the destination.
    const fetchMock = (async () =>
      new Response(
        '{"error":{"code":"E12003","type":"validation_error","message":"No eligible sender is available for this message."}}',
        { status: 400 },
      )) as unknown as typeof fetch;
    await expect(
      withFetch(fetchMock, () => new BirdOtpSender(birdCfg()).send("+263770000001", "123456")),
    ).rejects.toThrow(/couldn't send/i);
  });

  it("never logs the OTP code, even when Bird rejects the send", async () => {
    const errSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const fetchMock = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await withFetch(fetchMock, () =>
      new BirdOtpSender(birdCfg()).send("+263770000001", "654321").catch(() => undefined),
    );
    const logged = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).not.toContain("654321");
    vi.restoreAllMocks();
  });
});

describe("buildLocalSmsRequest", () => {
  it("builds the generic {to, from, message} body with the E.164 recipient and alphanumeric sender", () => {
    const body = buildLocalSmsRequest("+263771234567", "hello", "LyniaGo") as Record<string, unknown>;
    expect(body).toEqual({ to: "+263771234567", from: "LyniaGo", message: "hello" });
  });
});

const localCfg = (over: Partial<Env> = {}): Env =>
  ({
    OTP_CHANNEL: "local-sms",
    LOCAL_SMS_API_URL: "https://a2p.example/send",
    LOCAL_SMS_API_KEY: "KEY",
    LOCAL_SMS_SENDER_ID: "LyniaGo",
    ...over,
  }) as Env;

describe("LocalSmsOtpSender.send", () => {
  it("throws when not configured (loud fail — never a false 'sent')", async () => {
    const sender = new LocalSmsOtpSender({ OTP_CHANNEL: "local-sms" } as Env);
    await expect(sender.send("+263770000001", "111222")).rejects.toThrow(/couldn't send the verification code/i);
  });

  it("POSTs the SMS to the gateway with a Bearer key and resolves on 200", async () => {
    let called: { url: string; init: RequestInit } | undefined;
    const fetchMock = (async (url: string, init: RequestInit) => {
      called = { url, init };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await withFetch(fetchMock, () => new LocalSmsOtpSender(localCfg()).send("+263771234567", "123456"));
    expect(called?.url).toBe("https://a2p.example/send");
    expect((called!.init.headers as Record<string, string>).authorization).toBe("Bearer KEY");
    const sent = JSON.parse(called!.init.body as string);
    expect(sent.to).toBe("+263771234567");
    expect(sent.from).toBe("LyniaGo");
    expect(sent.message).toContain("123456");
    expect(sent.message).toContain("LyniaGo");
  });

  it("throws when the gateway rejects the send (so requestOtp errors, not a silent non-delivery)", async () => {
    const fetchMock = (async () =>
      new Response('{"error":"unregistered sender"}', { status: 403 })) as unknown as typeof fetch;
    await expect(
      withFetch(fetchMock, () => new LocalSmsOtpSender(localCfg()).send("+263770000001", "123456")),
    ).rejects.toThrow(/couldn't send/i);
  });

  it("never logs the OTP code, even when the gateway rejects the send", async () => {
    const errSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const fetchMock = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await withFetch(fetchMock, () =>
      new LocalSmsOtpSender(localCfg()).send("+263770000001", "654321").catch(() => undefined),
    );
    const logged = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).not.toContain("654321");
    vi.restoreAllMocks();
  });
});

describe("OTP sender log hygiene (P1-4)", () => {
  const phone = "+263771234567";
  const code = "123456";
  afterEach(() => vi.restoreAllMocks());

  it("ConsoleOtpSender masks the phone number rather than logging it in cleartext", async () => {
    const spy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    await new ConsoleOtpSender().send(phone, code);
    const line = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(line).not.toContain(phone); // the full number never appears
    expect(line).toContain("•"); // masked form
    expect(line).toContain("4567"); // last-4 retained for support correlation
  });

  it("SmsOtpSender redacts the live code and masks the phone (a real, prod-capable channel)", async () => {
    const spy = vi.spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);
    await new SmsOtpSender().send(phone, code);
    const line = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(line).not.toContain(code); // the OTP code must never hit a log on a prod channel
    expect(line).not.toContain(phone);
    expect(line).toContain("redacted");
  });
});
