import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import {
  BirdOtpSender,
  buildBirdOtpMessage,
  buildBirdSmsRequest,
  buildWhatsAppOtpRequest,
  ConsoleOtpSender,
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

describe("buildBirdOtpMessage", () => {
  it("puts the code first and names the brand (so iOS/Android autofill can find it)", () => {
    const msg = buildBirdOtpMessage("123456", { brand: "LyniaGo" });
    expect(msg.startsWith("123456 ")).toBe(true);
    expect(msg).toContain("LyniaGo verification code");
    expect(msg).not.toContain("\n"); // no app-hash line when the hash is unset
  });

  it("appends the Android SMS-Retriever hash on its own line, staying under 140 bytes", () => {
    const msg = buildBirdOtpMessage("123456", { brand: "LyniaGo", appHash: "FA+9qCX9VSu" });
    expect(msg.endsWith("\n\nFA+9qCX9VSu")).toBe(true);
    // SMS Retriever requires the whole message to be <= 140 bytes.
    expect(Buffer.byteLength(msg, "utf8")).toBeLessThanOrEqual(140);
  });
});

describe("buildBirdSmsRequest", () => {
  it("addresses the recipient as an E.164 phone number (keeps the '+') with a plain-text body", () => {
    const body = buildBirdSmsRequest("+263771234567", "hello") as Record<string, unknown>;
    expect(body.receiver).toEqual({ contacts: [{ identifierKey: "phonenumber", identifierValue: "+263771234567" }] });
    expect(body.body).toEqual({ type: "text", text: { text: "hello" } });
  });
});

const birdCfg = (over: Partial<Env> = {}): Env =>
  ({
    OTP_CHANNEL: "bird",
    BIRD_ACCESS_KEY: "KEY",
    BIRD_WORKSPACE_ID: "WS",
    BIRD_SMS_CHANNEL_ID: "CH",
    BIRD_BASE_URL: "https://bird.example",
    BIRD_BRAND_NAME: "LyniaGo",
    ...over,
  }) as Env;

describe("BirdOtpSender.send", () => {
  it("throws when not configured (loud fail — never a false 'sent')", async () => {
    const sender = new BirdOtpSender({ OTP_CHANNEL: "bird" } as Env);
    await expect(sender.send("+263770000001", "111222")).rejects.toThrow(/couldn't send the verification code/i);
  });

  it("POSTs the SMS to the Bird channel with the AccessKey header and resolves on 202", async () => {
    let called: { url: string; init: RequestInit } | undefined;
    const fetchMock = (async (url: string, init: RequestInit) => {
      called = { url, init };
      return new Response("{}", { status: 202 });
    }) as unknown as typeof fetch;
    await withFetch(fetchMock, () => new BirdOtpSender(birdCfg()).send("+263771234567", "123456"));
    expect(called?.url).toBe("https://bird.example/workspaces/WS/channels/CH/messages");
    expect((called!.init.headers as Record<string, string>).authorization).toBe("AccessKey KEY");
    const sent = JSON.parse(called!.init.body as string);
    expect(sent.receiver.contacts[0].identifierValue).toBe("+263771234567");
    expect(sent.body.text.text).toContain("123456");
    expect(sent.body.text.text).toContain("LyniaGo");
  });

  it("throws when Bird rejects the send (so requestOtp errors, not a silent non-delivery)", async () => {
    const fetchMock = (async () =>
      new Response('{"error":{"message":"bad channel"}}', { status: 400 })) as unknown as typeof fetch;
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
