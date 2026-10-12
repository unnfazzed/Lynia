import { describe, expect, it } from "vitest";
import { cancelledByOf, cancelReasonParty, customerOrderOutcome } from "./order-outcome";

// U33 (C8): one reading of who ended an order, for the Orders tab, the feed, the push and the order screen.
describe("order outcome — the one shared classifier (U33)", () => {
  const base = { status: "cancelled", customerId: "c1", riderId: "r1", cancelledBy: null as string | null };

  it("a venue's 'Something else' (`other`) is the venue's, everywhere", () => {
    expect(cancelReasonParty("other")).toBe("merchant");
    expect(customerOrderOutcome({ ...base, rejectionReason: "other" })).toBe("venue_declined");
    expect(cancelledByOf({ ...base, rejectionReason: "other" })).toBe("merchant");
  });

  it("LyniaGo's own reasons (N-18's no answer, an ops cancel) are LyniaGo's", () => {
    for (const r of ["item_approval_expired", "lynia_cancelled"]) {
      expect(cancelReasonParty(r)).toBe("lynia");
      expect(customerOrderOutcome({ ...base, rejectionReason: r })).toBe("cancelled_by_lynia");
      expect(cancelledByOf({ ...base, rejectionReason: r })).toBe("lynia");
    }
    expect(customerOrderOutcome({ ...base, rejectionReason: "kitchen_unconfirmed" })).toBe("kitchen_timeout");
    expect(customerOrderOutcome({ ...base, rejectionReason: "no_rider" })).toBe("no_rider");
    expect(cancelReasonParty(null)).toBeNull();
  });

  it("a customer or biker cancel names them; no reason at all is LyniaGo's", () => {
    expect(customerOrderOutcome({ ...base, cancelledBy: "c1" })).toBe("cancelled_by_you");
    expect(cancelledByOf({ ...base, cancelledBy: "r1" })).toBe("rider");
    expect(customerOrderOutcome({ ...base })).toBe("cancelled_by_lynia");
    expect(customerOrderOutcome({ ...base, status: "completed" })).toBe("delivered");
  });
});
