import { describe, expect, it } from "vitest";
import { computeFunnel, fmtDate, fmtUntil, harareDayStart } from "./admin.shared";

describe("computeFunnel (pilot metrics §8)", () => {
  it("computes the offer-loop funnel", () => {
    const f = computeFunnel({ totalBroadcasts: 10, totalOffers: 25, ordersWithOffer: 8, expired: 2 });
    expect(f.offersPerBroadcast).toBe(2.5);
    expect(f.pctBroadcastsWithOffer).toBe(80);
    expect(f.expiryRatePct).toBe(20);
  });

  it("is zero-safe with no broadcasts", () => {
    const f = computeFunnel({ totalBroadcasts: 0, totalOffers: 0, ordersWithOffer: 0, expired: 0 });
    expect(f).toEqual({ totalBroadcasts: 0, offersPerBroadcast: 0, pctBroadcastsWithOffer: 0, expiryRatePct: 0 });
  });
});

describe("fmtUntil", () => {
  it("formats hours+minutes and minutes-only, flooring elapsed to 0m", () => {
    const now = Date.parse("2026-07-04T00:00:00Z");
    expect(fmtUntil(new Date(now + 135 * 60000), now)).toBe("2h 15m");
    expect(fmtUntil(new Date(now + 40 * 60000), now)).toBe("40m");
    expect(fmtUntil(new Date(now - 5 * 60000), now)).toBe("0m");
  });
});

describe("Harare dates", () => {
  it("fmtDate prints the Harare calendar date (22:30 UTC is already tomorrow in Harare)", () => {
    expect(fmtDate(new Date("2026-10-12T21:59:00Z"))).toBe("2026-10-12");
    expect(fmtDate(new Date("2026-10-12T22:30:00Z"))).toBe("2026-10-13");
  });

  it("harareDayStart is 00:00 Harare = 22:00 UTC the day before", () => {
    expect(harareDayStart(new Date("2026-10-13T08:00:00Z")).toISOString()).toBe("2026-10-12T22:00:00.000Z");
    expect(harareDayStart(new Date("2026-10-12T23:30:00Z")).toISOString()).toBe("2026-10-12T22:00:00.000Z");
    expect(harareDayStart(new Date("2026-10-12T21:30:00Z")).toISOString()).toBe("2026-10-11T22:00:00.000Z");
  });
});
