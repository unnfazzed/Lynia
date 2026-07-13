import { pushDestination, pushOnce } from "../push";

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

  it("routes a new-broadcast alert to the rider board, not the order (a rider who hasn't bid 403s on /order/:id)", () => {
    // notifyNewBroadcast sends { orderId, kind: "broadcast" } to nearby riders who haven't bid yet.
    expect(pushDestination({ orderId: "o1", kind: "broadcast" }, true)).toBe("/rider");
    expect(pushDestination({ kind: "broadcast" }, true)).toBe("/rider");
  });

  it("routes the 'a rider's online near you' push home so the customer can re-broadcast", () => {
    // notifyRidersAvailable carries no orderId — before this it dead-ended to null.
    expect(pushDestination({ kind: "riders_available" }, false)).toBe("/home");
  });

  it("routes a new-offer push (carries orderId, no status) to that order for the customer", () => {
    expect(pushDestination({ orderId: "o1", kind: "offer" }, false)).toBe("/order/o1");
  });

  it("returns null for a payload with no orderId and no routable kind", () => {
    expect(pushDestination({ kind: "offer" }, false)).toBeNull();
  });

  it("is defensive against a malformed/missing payload", () => {
    expect(pushDestination(null, false)).toBeNull();
    expect(pushDestination(undefined, false)).toBeNull();
    expect(pushDestination("not an object", false)).toBeNull();
    expect(pushDestination({ orderId: "" }, false)).toBeNull();
    expect(pushDestination({ orderId: 42 }, false)).toBeNull();
  });
});

// Regression guard: before this, a double-tap on "Open job", a duplicate/replayed push notification,
// and the cold-start deep link could each independently `router.push("/rider/job")` while already on
// that screen, stacking redundant entries onto the back stack.
describe("pushOnce", () => {
  it("navigates when the target isn't the active route", () => {
    const push = jest.fn();
    pushOnce({ push }, "/rider", "/rider/job");
    expect(push).toHaveBeenCalledWith("/rider/job");
  });

  it("is a no-op when the target is already the active route", () => {
    const push = jest.fn();
    pushOnce({ push }, "/rider/job", "/rider/job");
    expect(push).not.toHaveBeenCalled();
  });
});
