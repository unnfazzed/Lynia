import { cancelMoot, raiseLanded } from "../order-write-reconcile";

describe("JQ-R6-01/02: reconciling a customer write whose answer was lost", () => {
  it("a cancel is moot once the order is cancelled or has ended any other way", () => {
    for (const status of ["cancelled", "delivered", "completed", "expired", "undelivered"] as const) {
      expect(cancelMoot({ status })).toBe(true);
    }
  });
  it("a cancel is still owed while the order is live, or when the re-read failed", () => {
    for (const status of ["open_for_offers", "assigned", "en_route_pickup", "picked_up"] as const) {
      expect(cancelMoot({ status })).toBe(false);
    }
    expect(cancelMoot(null)).toBe(false);
  });
  it("a raise landed when the price is at or above what was asked", () => {
    expect(raiseLanded({ status: "open_for_offers", proposedFare: "4.00" }, 4)).toBe(true);
    expect(raiseLanded({ status: "open_for_offers", proposedFare: "4.50" }, 4)).toBe(true);
    expect(raiseLanded({ status: "open_for_offers", proposedFare: "3.50" }, 4)).toBe(false);
    expect(raiseLanded(null, 4)).toBe(false);
  });
});
