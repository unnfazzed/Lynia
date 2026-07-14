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

  it("routes SOS to the counterparty by global role when no per-order `to` is stamped", () => {
    expect(pushDestination({ orderId: "o1", kind: "sos" }, false)).toBe("/order/o1");
    expect(pushDestination({ orderId: "o1", kind: "sos" }, true)).toBe("/rider/job");
  });

  // A rider-role user is routinely the CUSTOMER on an order they sent themselves. When the backend
  // stamps the recipient's actual per-order relationship in `data.to`, it must win over the global
  // account role for the two dual-audience pushes — otherwise a rider-role customer whose assigned
  // rider hits SOS (or whose order is cancelled) is misrouted to /rider/job at a safety-critical tap.
  it("prefers `data.to` over the global role for SOS", () => {
    // rider-role user (isRider=true) who is the CUSTOMER on this order → tracker, not /rider/job.
    expect(pushDestination({ orderId: "o1", kind: "sos", to: "customer" }, true)).toBe("/order/o1");
    // customer-role global flag but this recipient IS the rider on the order → their job screen.
    expect(pushDestination({ orderId: "o1", kind: "sos", to: "rider" }, false)).toBe("/rider/job");
  });

  it("prefers `data.to` over the global role for cancelled", () => {
    expect(pushDestination({ orderId: "o1", status: "cancelled", to: "customer" }, true)).toBe("/order/o1");
    expect(pushDestination({ orderId: "o1", status: "cancelled", to: "rider" }, false)).toBe("/rider/job");
  });

  it("falls back to the global role when `data.to` is absent or unrecognised", () => {
    // Absent → today's behaviour, unchanged.
    expect(pushDestination({ orderId: "o1", kind: "sos" }, true)).toBe("/rider/job");
    expect(pushDestination({ orderId: "o1", status: "cancelled" }, false)).toBe("/order/o1");
    // A malformed/unexpected `to` value is ignored, not treated as customer.
    expect(pushDestination({ orderId: "o1", kind: "sos", to: "nonsense" }, true)).toBe("/rider/job");
    expect(pushDestination({ orderId: "o1", status: "cancelled", to: 7 }, true)).toBe("/rider/job");
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
