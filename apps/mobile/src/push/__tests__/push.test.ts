import { pushDestination } from "../push";

// Regression guard: before this, tapping any push except the rider's "You got the job" (assigned)
// was a no-op — despite copy like "tap to rate your rider" / "tap for details" on the
// customer-facing statuses (notifications.service.ts STATUS_NOTICES).
describe("pushDestination", () => {
  it("routes rider-only statuses to the job screen regardless of the tapping profile's role", () => {
    expect(pushDestination({ orderId: "o1", status: "assigned" }, false)).toBe("/rider/job");
    expect(pushDestination({ orderId: "o1", status: "completed" }, false)).toBe("/rider/job");
    expect(pushDestination({ orderId: "o1", status: "assigned" }, true)).toBe("/rider/job");
  });

  it("routes customer-facing statuses to that order, for a customer tap", () => {
    for (const status of ["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered", "expired", "undelivered"]) {
      expect(pushDestination({ orderId: "o1", status }, false)).toBe("/order/o1");
    }
  });

  it("routes the dual-audience cancelled status by the tapping profile's current role", () => {
    expect(pushDestination({ orderId: "o1", status: "cancelled" }, false)).toBe("/order/o1");
    expect(pushDestination({ orderId: "o1", status: "cancelled" }, true)).toBe("/rider/job");
  });

  it("returns null for a payload with no orderId (e.g. new-offer/new-broadcast pushes)", () => {
    expect(pushDestination({ kind: "offer" }, false)).toBeNull();
    expect(pushDestination({ kind: "broadcast" }, true)).toBeNull();
  });

  it("is defensive against a malformed/missing payload", () => {
    expect(pushDestination(null, false)).toBeNull();
    expect(pushDestination(undefined, false)).toBeNull();
    expect(pushDestination("not an object", false)).toBeNull();
    expect(pushDestination({ orderId: "" }, false)).toBeNull();
    expect(pushDestination({ orderId: 42 }, false)).toBeNull();
  });
});
