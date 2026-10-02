import { describe, expect, it } from "vitest";
import { merchantOrder } from "../testing/fixtures";
import { changeableLines, openRound, priceDiff, proposalLines, proposalTotals, swapLine, swapsAllowed } from "./substitution";

// U1a's sample (packages/design/handoff/order-flow-v2, BRIEF "Data fixes"): Avondale Fresh, $14.60.
const BREAD = "b0000001-0000-4000-8000-000000000000";
const EGGS = "b0000002-0000-4000-8000-000000000000";
const MAZOE = "b0000003-0000-4000-8000-000000000000";
const OIL = "b0000004-0000-4000-8000-000000000000";
const shop = (over = {}) =>
  merchantOrder({
    items: [
      { itemId: BREAD, dishId: "d0000001-0000-4000-8000-000000000000", name: "Bread (Lobels 700g)", priceUsd: 1.1, quantity: 1, note: null, available: null },
      { itemId: EGGS, dishId: "d0000002-0000-4000-8000-000000000000", name: "Eggs (tray of 30)", priceUsd: 5.5, quantity: 1, note: null, available: null },
      { itemId: MAZOE, dishId: "d0000003-0000-4000-8000-000000000000", name: "Mazoe orange 2L", priceUsd: 3.2, quantity: 1, note: null, available: null },
      { itemId: OIL, dishId: "d0000004-0000-4000-8000-000000000000", name: "Cooking oil 2L", priceUsd: 4.8, quantity: 1, note: null, available: null },
    ],
    ...over,
  });

describe("the merchant proposer (U1a, D-59)", () => {
  it("adds up U1a: Mazoe removed and the oil swapped for Olivine is $14.60 → $11.60", () => {
    const changes = { [MAZOE]: { kind: "remove" as const }, [OIL]: { kind: "swap" as const, dishId: "d0000009-0000-4000-8000-000000000000", name: "Olivine cooking oil 2L", priceUsd: 5 } };
    expect(proposalTotals(shop(), changes)).toEqual({ was: 14.6, now: 11.6 });
    expect(proposalLines(shop(), changes)).toEqual([
      { action: "remove", itemId: MAZOE },
      { action: "swap", itemId: OIL, dishId: "d0000009-0000-4000-8000-000000000000" },
    ]);
  });

  it("draws the price difference: +$0.10, −$0.15, Same price", () => {
    expect(priceDiff(1.1, 1.2, "Same price")).toBe("+$0.10");
    expect(priceDiff(1.1, 0.95, "Same price")).toBe("−$0.15");
    expect(priceDiff(1.1, 1.1, "Same price")).toBe("Same price");
    expect(swapLine({ name: "Olivine cooking oil 2L", priceUsd: 5 }, 4.8, "Same price")).toBe("Olivine cooking oil 2L · $5.00 (+$0.20)");
  });

  it("offers no swaps to a customer who asked for missing items to be removed", () => {
    expect(swapsAllowed(shop())).toBe(true);
    expect(swapsAllowed(shop({ outOfStockPref: "remove" }))).toBe(false);
  });

  it("leaves out lines already off the order, and knows when a round is open", () => {
    const o = shop();
    o.items[2]!.available = false;
    expect(changeableLines(o).map((i) => i.itemId)).toEqual([BREAD, EGGS, OIL]);
    expect(openRound(o)).toBeNull();
    const round = { id: "r", kind: "mid_prep" as const, status: "open" as const, createdAt: "", deadlineAt: null, resolvedAt: null, lines: [], wasTotal: 0, keptSubtotal: 0 };
    expect(openRound(shop({ substitution: round }))).toBe(round);
    expect(openRound(shop({ substitution: { ...round, status: "timed_out" } }))).toBeNull();
  });
});
