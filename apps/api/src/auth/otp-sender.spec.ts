import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { buildWhatsAppOtpRequest, selectOtpSender, WhatsAppOtpSender } from "./otp-sender";

const env = (channel: Env["OTP_CHANNEL"]) => ({ OTP_CHANNEL: channel }) as Env;

describe("selectOtpSender", () => {
  it("selects the channel from config", () => {
    expect(selectOtpSender(env("console")).channel()).toBe("console");
    expect(selectOtpSender(env("sms")).channel()).toBe("sms");
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
    await expect(sender.send("+263770000001", "111222")).rejects.toThrow(/not configured/i);
  });

  it("POSTs the template message to the Graph API and resolves on 200", async () => {
    let called: { url: string; init: RequestInit } | undefined;
    const fetchMock = (async (url: string, init: RequestInit) => {
      called = { url, init };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await withFetch(fetchMock, () => new WhatsAppOtpSender(cfg()).send("+263770000001", "123456"));
    expect(called?.url).toBe("https://graph.example/v21.0/PNID/messages");
    expect((called?.init.headers as Record<string, string>).authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(called?.init.body as string).to).toBe("263770000001");
  });

  it("throws when Meta rejects the send (so requestOtp errors, not a silent non-delivery)", async () => {
    const fetchMock = (async () =>
      new Response('{"error":{"message":"bad template"}}', { status: 400 })) as unknown as typeof fetch;
    await expect(
      withFetch(fetchMock, () => new WhatsAppOtpSender(cfg()).send("+263770000001", "123456")),
    ).rejects.toThrow(/couldn't send/i);
  });
});
