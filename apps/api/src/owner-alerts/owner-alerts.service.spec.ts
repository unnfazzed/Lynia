import { afterEach, describe, expect, it, vi } from "vitest";
import { businessBookingAccountPhone } from "@lynia/shared";
import type { Env } from "../config/env";
import { OwnerAlertsService, ownerAlertText } from "./owner-alerts.service";

const ARMED = { TELEGRAM_BOT_TOKEN: "123:secret-token", TELEGRAM_CHAT_ID: "4242" } as Env;

/** Lets the fire-and-forget send (and its .catch) run to completion. */
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OwnerAlertsService", () => {
  it("is inert without both Telegram settings: no network at all", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const env of [{}, { TELEGRAM_BOT_TOKEN: "t" }, { TELEGRAM_CHAT_ID: "1" }] as Env[]) {
      const svc = new OwnerAlertsService(env);
      expect(svc.enabled).toBe(false);
      svc.notify("hi");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the text to the configured chat as plain text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    new OwnerAlertsService(ARMED).notify("📦 New parcel order");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot123:secret-token/sendMessage");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ chat_id: "4242", text: "📦 New parcel order", disable_web_page_preview: true });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("never throws or rejects into the caller, and never logs the token", async () => {
    const warn = vi.spyOn((await import("@nestjs/common")).Logger.prototype, "warn").mockImplementation(() => undefined);
    for (const outcome of [() => Promise.reject(new TypeError("fetch failed")), () => Promise.resolve({ ok: false, status: 429 })]) {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(outcome));
      expect(() => new OwnerAlertsService(ARMED).notify("x")).not.toThrow();
    }
    await settle();
    expect(warn).toHaveBeenCalledTimes(2);
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("fetch failed");
    expect(logged).toContain("429");
    expect(logged).not.toContain("secret-token");
  });

  it("returns before the network answers (the caller's request is never held)", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => undefined)));
    expect(new OwnerAlertsService(ARMED).notify("x")).toBeUndefined();
  });
});

describe("ownerAlertText", () => {
  const SENDER = { firstName: "Rudo", lastName: "Moyo", phone: "+263719876543" as string | null };

  it("masks the new customer's phone", () => {
    expect(ownerAlertText.signUp("+263771234567")).toBe("👤 New sign-up\n+263•••••4567");
  });

  it("names the biker applicant and the ID check state", () => {
    expect(ownerAlertText.bikerApplication({ firstName: "Tendai", kycStatus: "pending" })).toBe("🛵 New biker application\nTendai · ID check pending");
    expect(ownerAlertText.bikerApplication({ firstName: "Tendai", kycStatus: "verified" })).toBe("🛵 New biker application\nTendai · ID check passed");
  });

  it("tells the owner whether a parcel request has bikers online to take it", () => {
    const base = {
      orderId: "o-1",
      proposedFare: "3.5",
      distanceKm: 4.24,
      pickup: "Avondale shops",
      dropoff: "First St, CBD",
      items: "2× Documents",
      sender: SENDER,
    };
    expect(ownerAlertText.parcelOrder({ ...base, bikersNearby: 0 })).toBe(
      [
        "📦 New parcel request · $3.50",
        "Avondale shops → First St, CBD · 4.2 km",
        "2× Documents",
        "🙋 Rudo Moyo · +263719876543 · https://wa.me/263719876543",
        "⚠️ No bikers online nearby. Get bikers online",
        "https://admin.lyniago.com/orders/o-1",
      ].join("\n"),
    );
    const line = (n: number | null) => ownerAlertText.parcelOrder({ ...base, bikersNearby: n }).split("\n")[4];
    expect(line(1)).toBe("⚠️ Only 1 biker online nearby. Get more online");
    expect(line(9)).toBe("⚠️ Only 9 bikers online nearby. Get more online");
    expect(line(10)).toBe("10 bikers online nearby");
    expect(line(null)).toBe("Bikers online nearby: unknown");
  });

  it("gives the owner the venue's number so they can get the order taken", () => {
    const base = {
      orderId: "o-2",
      merchantName: "Gava’s Kitchen",
      merchantPhone: "+263771234567" as string | null,
      businessType: "restaurant",
      shopKind: null as string | null,
      total: 12.5,
      items: "2× Sadza & beef",
      paymentMethod: "cash",
      merchantPhase: "awaiting_accept",
      scheduled: false,
      sender: SENDER,
    };
    expect(ownerAlertText.merchantOrder(base)).toBe(
      [
        "🍔 New restaurant order · $12.50 · Cash",
        "Gava’s Kitchen",
        "2× Sadza & beef",
        "⏱ Venue must accept within 3 min",
        "📞 +263771234567 · https://wa.me/263771234567",
        "🙋 Rudo Moyo · +263719876543 · https://wa.me/263719876543",
        "https://admin.lyniago.com/orders/o-2",
      ].join("\n"),
    );
    const lines = (o: Partial<typeof base>) => ownerAlertText.merchantOrder({ ...base, ...o }).split("\n");
    expect(lines({ merchantPhase: "preparing" })[3]).toBe("Auto-accepted. Venue to confirm and start");
    expect(lines({ scheduled: true })[3]).toBe("Scheduled. Rings the venue at its time");
    expect(lines({ merchantPhone: null })[4]).toBe("📞 No venue number on file");
    expect(lines({ businessType: "shop", shopKind: "grocery" })[0]).toBe("🛒 New shop order · $12.50 · Cash");
    expect(lines({ businessType: "shop", shopKind: "pharmacy" })[0]).toBe("💊 New pharmacy order · $12.50 · Cash");
  });

  it("names the sender, falls back when they have no name yet, and tells a shop booking apart", () => {
    const sender = (o: Partial<typeof SENDER>) =>
      ownerAlertText.parcelOrder({ orderId: "o", proposedFare: 2, distanceKm: 1, pickup: "a", dropoff: "b", items: "c", bikersNearby: 12, sender: { ...SENDER, ...o } }).split("\n")[3];
    expect(sender({ firstName: "", lastName: "" })).toBe("🙋 No name yet · +263719876543 · https://wa.me/263719876543");
    expect(sender({ phone: null })).toBe("🙋 Rudo Moyo");
    expect(sender({ phone: businessBookingAccountPhone("7f3c2a10-0000-4000-8000-000000000000") })).toBe("🙋 Shop booking (sent by a venue)");
  });

  it("clips long free text so an alert stays a glanceable notification", () => {
    const text = ownerAlertText.parcelOrder({ orderId: "o", proposedFare: 2, distanceKm: 1, pickup: "a".repeat(200), dropoff: "b", items: "c", bikersNearby: 12, sender: SENDER });
    expect(text.split("\n")[1]!.startsWith(`${"a".repeat(79)}… → b`)).toBe(true);
  });
});
