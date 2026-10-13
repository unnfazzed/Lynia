import { describe, expect, it } from "vitest";
import { orderNote } from "./note";

describe("orderNote (Orders list Note column)", () => {
  it.each([
    [{ status: "cancelled", cancelledByRole: "customer", cancelReason: "change of plans" }, "cancelled (customer): change of plans"],
    [{ status: "cancelled", cancelledByRole: "rider", cancelReason: "flat tyre" }, "cancelled (biker): flat tyre"],
    [{ status: "cancelled", cancelledByRole: "admin", cancelReason: "duplicate" }, "cancelled (admin): duplicate"],
    [{ status: "cancelled", cancelledByRole: "merchant", cancelReason: null }, "cancelled (merchant)"],
    [{ status: "cancelled", cancelledByRole: "system", cancelReason: null }, "cancelled (system)"],
    [{ status: "cancelled", cancelledByRole: null, cancelReason: "old row" }, "cancelled: old row"],
    [{ status: "cancelled", cancelledByRole: null, cancelReason: null }, "—"],
    // An expiry is stamped `system` too, but it isn't a cancellation: no note.
    [{ status: "expired", cancelledByRole: "system", cancelReason: null }, "—"],
  ] as const)("%o → %s", (o, want) => {
    expect(orderNote(o)).toBe(want);
  });
});
