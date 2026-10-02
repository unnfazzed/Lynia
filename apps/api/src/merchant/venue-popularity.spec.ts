import { describe, expect, it } from "vitest";
import { POPULAR_MIN_ORDERS, POPULAR_WINDOW_MS, popularSince, rankVenuesByPopularity, VENUE_POPULARITY_MAX } from "./venue-popularity";

/** Ledger D-72 — the venue ranking's server half: ordering, tie-breaks and the cold-start signal. */
describe("rankVenuesByPopularity", () => {
  const row = (merchantId: string, orders: number, score: number) => ({ merchantId, orders, score });

  it("ranks by the time-decayed score, not the raw count — last week's favourite beats last month's", () => {
    // m-old: 9 orders, all ~4 weeks old (9 × 0.5^4 ≈ 0.56). m-new: 4 orders this week (≈ 3.6).
    expect(rankVenuesByPopularity([row("m-old", 9, 0.5625), row("m-new", 4, 3.6)]).map((r) => r.id)).toEqual(["m-new", "m-old"]);
  });

  it("breaks a score tie on the order count, then the id, so two reads never swap equal venues", () => {
    const ranked = rankVenuesByPopularity([row("b", 3, 2), row("a", 3, 2), row("c", 5, 2)]);
    expect(ranked.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it(`drops a venue under ${POPULAR_MIN_ORDERS} delivered orders — one lucky order isn't popular`, () => {
    expect(rankVenuesByPopularity([row("a", 3, 2.9), row("b", 4, 3.2), row("lucky", 2, 1.99)]).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("cold start: answers nothing while fewer than two venues qualify", () => {
    expect(rankVenuesByPopularity([])).toEqual([]);
    expect(rankVenuesByPopularity([row("only", 12, 9)])).toEqual([]);
    expect(rankVenuesByPopularity([row("only", 12, 9), row("thin", 1, 1)])).toEqual([]);
  });

  it("rounds the score for a small, byte-stable body and caps the list", () => {
    expect(rankVenuesByPopularity([row("a", 3, 1.23456), row("b", 3, 1.1)])[0]).toEqual({ id: "a", orders: 3, score: 1.235 });
    const many = Array.from({ length: VENUE_POPULARITY_MAX + 5 }, (_, i) => row(`m${String(i).padStart(3, "0")}`, 3, 100 - i));
    expect(rankVenuesByPopularity(many)).toHaveLength(VENUE_POPULARITY_MAX);
  });

  it("ignores a non-finite or zero score", () => {
    expect(rankVenuesByPopularity([row("a", 3, Number.NaN), row("b", 3, 0), row("c", 3, 1)])).toEqual([]);
  });
});

describe("popularSince", () => {
  it("looks back over the 30-day window", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(now.getTime() - popularSince(now).getTime()).toBe(POPULAR_WINDOW_MS);
    expect(POPULAR_WINDOW_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
