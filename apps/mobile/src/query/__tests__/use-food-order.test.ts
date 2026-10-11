import type { MerchantOrderResponse } from "@lynia/shared";

jest.mock("../../api/food-orders", () => ({ getFoodOrder: jest.fn() }));

import { pollIntervalFor } from "../use-food-order";

const NOW = Date.parse("2026-10-07T10:00:00Z");
const order = (over: Partial<MerchantOrderResponse>): MerchantOrderResponse =>
  ({ id: "o1", status: "requested", merchantPhase: "awaiting_accept", acceptDeadlineAt: null, substitution: null, ...over }) as MerchantOrderResponse;
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("pollIntervalFor — owner decision D1: the venue may answer for 24 h", () => {
  it("polls every 4 s while the drawn 3:00 accept window runs", () => {
    expect(pollIntervalFor(order({ acceptDeadlineAt: at(90_000) }), NOW)).toBe(4_000);
  });

  it("relaxes to 15 s once the 3:00 has lapsed (no deadline to race for up to a day)", () => {
    expect(pollIntervalFor(order({ acceptDeadlineAt: at(-1) }), NOW)).toBe(15_000);
    expect(pollIntervalFor(order({ acceptDeadlineAt: at(-6 * 60 * 60_000) }), NOW)).toBe(15_000);
  });

  it("keeps the item-approval window tight and stops on a cancelled order", () => {
    expect(pollIntervalFor(order({ merchantPhase: "awaiting_item_approval" }), NOW)).toBe(4_000);
    expect(pollIntervalFor(order({ status: "cancelled", merchantPhase: null }), NOW)).toBe(false);
  });
});
