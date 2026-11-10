import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import { birdHostForKey, MerchantWhatsAppService, NEW_ORDER_TEMPLATE, templateAmount } from "./merchant-whatsapp.service";

const ARMED = { WHATSAPP_ORDER_ALERTS_ENABLED: "true", BIRD_VERIFY_API_KEY: "bk_eu1_secret" } as Env;
const ORDER = "a1b2c3d4-0000-4000-8000-000000000000";

/** Lets the fire-and-forget send (and its .catch) run to completion. */
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MerchantWhatsAppService", () => {
  it("is inert unless the flag is true AND a Bird key is present", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const envs = [
      {},
      { WHATSAPP_ORDER_ALERTS_ENABLED: "false", BIRD_VERIFY_API_KEY: "bk_eu1_x" },
      { WHATSAPP_ORDER_ALERTS_ENABLED: "true" },
    ] as Env[];
    for (const env of envs) {
      const svc = new MerchantWhatsAppService(env);
      expect(svc.enabled).toBe(false);
      svc.newOrder({ phone: "+263771234567", orderId: ORDER, total: 16.5 });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips a venue with no phone on file", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    new MerchantWhatsAppService(ARMED).newOrder({ phone: null, orderId: ORDER, total: 16.5 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends Bird's managed order template to the venue, with no `from`", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    new MerchantWhatsAppService(ARMED).newOrder({ phone: "+263771234567", orderId: ORDER, total: "16.5" });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://eu1.platform.bird.com/v1/whatsapp/messages");
    expect(init.headers.authorization).toBe("Bearer bk_eu1_secret");
    expect(JSON.parse(init.body)).toEqual({
      to: "+263771234567",
      template: { slug: NEW_ORDER_TEMPLATE, language: "en", parameters: { ref: "A1B2", amount: "USD 16.50" } },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back to BIRD_ACCESS_KEY", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    new MerchantWhatsAppService({ WHATSAPP_ORDER_ALERTS_ENABLED: "true", BIRD_ACCESS_KEY: "bk_us1_k" } as Env).newOrder({
      phone: "+263771234567",
      orderId: ORDER,
      total: 3,
    });
    await settle();
    expect(fetchMock.mock.calls[0]![0]).toBe("https://us1.platform.bird.com/v1/whatsapp/messages");
  });

  it("never throws on a Bird error or a network failure", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    for (const impl of [
      () => Promise.resolve({ ok: false, status: 422, json: () => Promise.resolve({ code: "E15018" }) }),
      () => Promise.reject(new Error("socket hang up")),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(impl));
      expect(() => new MerchantWhatsAppService(ARMED).newOrder({ phone: "+263771234567", orderId: ORDER, total: 1 })).not.toThrow();
      await settle();
    }
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("helpers", () => {
  it("formats the amount like the template's sample", () => {
    expect(templateAmount(16.5)).toBe("USD 16.50");
    expect(templateAmount("7")).toBe("USD 7.00");
  });
  it("reads the region from the key", () => {
    expect(birdHostForKey("bk_eu1_abc")).toBe("https://eu1.platform.bird.com");
    expect(birdHostForKey("nope")).toBeNull();
  });
});
