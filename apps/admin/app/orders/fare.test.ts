import { describe, expect, it } from "vitest";
import { orderFare } from "./fare";

/** Admin console v2 §6: the Orders list's Fare column shows the biker's fare. */
describe("orderFare", () => {
  it("a food order shows its delivery fee, not the food total", () => {
    expect(orderFare({ orderType: "merchant", agreedFare: "25.00", proposedFare: "25.00", deliveryFee: "2.50" })).toBe("$2.50");
  });
  it("a food order from an older API without the fee shows a dash, never the food total", () => {
    expect(orderFare({ orderType: "merchant", agreedFare: "25.00", proposedFare: "25.00" })).toBe("—");
  });
  it("a parcel shows its agreed fare, else the proposed one", () => {
    expect(orderFare({ orderType: "parcel", agreedFare: "4.50", proposedFare: "4.00", deliveryFee: null })).toBe("$4.50");
    expect(orderFare({ orderType: "parcel", agreedFare: null, proposedFare: "4.00" })).toBe("$4.00");
  });
});
