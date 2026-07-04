import { collectedItemCount, isPendingCounter } from "../journey";

describe("isPendingCounter (F-07 counter-offer)", () => {
  it("treats a counter above the ask as pending", () => {
    expect(isPendingCounter("counter", 3.5, 3.0, false)).toBe(true);
  });

  it("is not pending once the customer has declined (client-side dismissal only)", () => {
    // Decline never removes the bid server-side; it just drops the Accept/Decline treatment.
    expect(isPendingCounter("counter", 3.5, 3.0, true)).toBe(false);
  });

  it("is not pending for an accept-type bid", () => {
    expect(isPendingCounter("accept", 3.0, 3.0, false)).toBe(false);
  });

  it("is not pending for a counter at or below the ask (never surface an auto-charge above ask)", () => {
    expect(isPendingCounter("counter", 3.0, 3.0, false)).toBe(false);
    expect(isPendingCounter("counter", 2.5, 3.0, false)).toBe(false);
  });
});

describe("collectedItemCount (pickup verification)", () => {
  const items = [{ quantity: 1 }, { quantity: 2 }, { quantity: 5 }];

  it("counts pieces across ticked rows, not rows", () => {
    expect(collectedItemCount(items, new Set([0, 1]))).toBe(3);
  });

  it("is zero with nothing ticked (blocks the collect CTA)", () => {
    expect(collectedItemCount(items, new Set())).toBe(0);
  });

  it("sums every ticked row's quantity", () => {
    expect(collectedItemCount(items, new Set([0, 1, 2]))).toBe(8);
  });
});
