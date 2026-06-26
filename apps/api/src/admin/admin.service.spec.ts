import { describe, expect, it } from "vitest";
import { computeFunnel } from "./admin.service";

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
