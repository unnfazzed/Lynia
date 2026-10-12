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

describe("pollIntervalFor — P19: no poll once it has ended, a safety net while the socket is up", () => {
  it.each(["delivered", "completed", "undelivered", "cancelled", "expired"])("stops on a %s order (the rating screen no longer polls)", (status) => {
    expect(pollIntervalFor(order({ status: status as MerchantOrderResponse["status"], merchantPhase: null }), NOW)).toBe(false);
    expect(pollIntervalFor(order({ status: status as MerchantOrderResponse["status"], merchantPhase: null }), NOW, true)).toBe(false);
  });

  it("relaxes the 15 s cadence to a 60 s safety net while the order socket is connected", () => {
    const cooking = order({ merchantPhase: "preparing" });
    expect(pollIntervalFor(cooking, NOW)).toBe(15_000);
    expect(pollIntervalFor(cooking, NOW, true)).toBe(60_000);
  });

  it("keeps the deadline windows tight even with the socket up (nothing pushes a lapse)", () => {
    expect(pollIntervalFor(order({ acceptDeadlineAt: at(90_000) }), NOW, true)).toBe(4_000);
    expect(pollIntervalFor(order({ merchantPhase: "awaiting_item_approval" }), NOW, true)).toBe(4_000);
  });
});

describe("pollIntervalFor — P19 review: the door step keeps 15 s with the socket up", () => {
  it.each(["picked_up", "en_route_dropoff"])("%s: the biker's cash confirm / 'I'm here' / a freeze are seen within 15 s", (status) => {
    expect(pollIntervalFor(order({ status: status as MerchantOrderResponse["status"], merchantPhase: null }), NOW, true)).toBe(15_000);
    expect(pollIntervalFor(order({ status: status as MerchantOrderResponse["status"], merchantPhase: null }), NOW, false)).toBe(15_000);
  });
});
