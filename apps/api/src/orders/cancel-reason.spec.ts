import { describe, expect, it } from "vitest";
import { CUSTOMER_SAFE_CANCEL_MESSAGE, customerSafeCancelReason } from "./cancel-reason";

describe("customerSafeCancelReason (extracted, roadmap 3.4 — Fix 6)", () => {
  it("remaps trust & safety ops reasons to calm customer copy (no accusation on the terminal)", () => {
    expect(customerSafeCancelReason("Suspected fraud")).toBe(CUSTOMER_SAFE_CANCEL_MESSAGE);
    expect(customerSafeCancelReason("Safety concern")).toBe(CUSTOMER_SAFE_CANCEL_MESSAGE);
  });

  it("passes through already-safe and free-text reasons unchanged", () => {
    expect(customerSafeCancelReason("Rider unreachable")).toBe("Rider unreachable");
    expect(customerSafeCancelReason("Customer asked ops to cancel")).toBe("Customer asked ops to cancel");
    expect(customerSafeCancelReason("changed my mind")).toBe("changed my mind");
  });

  it("passes null through (no cancel reason)", () => {
    expect(customerSafeCancelReason(null)).toBeNull();
  });
});
