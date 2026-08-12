import { notificationRowDestination, pushDestination, pushOnce } from "../push";

// Regression guard: before this, tapping any push except the rider's "You got the job" (assigned)
// was a no-op — despite copy like "tap to rate your rider" / "tap for details" on the
// customer-facing statuses (notifications.service.ts STATUS_NOTICES).
describe("pushDestination", () => {
  it("routes the rider's 'you got the job' push to the job screen regardless of the tapping profile's role", () => {
    expect(pushDestination({ orderId: "o1", status: "assigned" }, false)).toBe("/rider/job");
    expect(pushDestination({ orderId: "o1", status: "assigned" }, true)).toBe("/rider/job");
  });

  // Regression guard (UX-2026-07-15): `completed` isn't in ACTIVE_RIDE_STATUSES, so by the time this
  // push can arrive the job has already left /rider/job's active feed — routing there rendered a bare
  // "No active job" dead end for a push whose whole point ("you're free for the next job") is to send
  // the rider toward their NEXT job, i.e. the board.
  it("routes the rider's 'delivery complete' push to the board, not the (by-then-dead) job screen", () => {
    expect(pushDestination({ orderId: "o1", status: "completed" }, false)).toBe("/rider");
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

  it("routes a food-dispatch offer to the offer intake screen (D5)", () => {
    // food-dispatch.service.ts tick() sends { orderId, kind: "food_offer" } to the one candidate rider.
    expect(pushDestination({ orderId: "o1", kind: "food_offer" }, true)).toBe("/rider/food-offer");
    expect(pushDestination({ kind: "food_offer" }, true)).toBe("/rider/food-offer");
  });

  it("routes the 'a rider's online near you' push home so the customer can re-broadcast", () => {
    // notifyRidersAvailable carries no orderId — before this it dead-ended to null.
    expect(pushDestination({ kind: "riders_available" }, false)).toBe("/home");
  });

  it("KB-NOTIFY-ORDERID: routes a 'rider's online' push to the live order when it carries an orderId", () => {
    // When the customer's original auction is still open, the push carries its orderId → follow it there.
    expect(pushDestination({ kind: "riders_available", orderId: "o1" }, false)).toBe("/order/o1");
    // An empty/absent orderId keeps the prior home-route behaviour.
    expect(pushDestination({ kind: "riders_available", orderId: "" }, false)).toBe("/home");
  });

  it("routes a new-offer push (carries orderId, no status) to that order for the customer", () => {
    expect(pushDestination({ orderId: "o1", kind: "offer" }, false)).toBe("/order/o1");
  });

  // Regression guard (UX-2026-07-15): "account" covers two different senders. A rider's own KYC/
  // standing push carries no orderId — /rider is right. But notifyCustomersOfRiderStandingChange sends
  // the SAME kind to the CUSTOMER on an order whose assigned rider was just suspended/banned, and that
  // push DOES carry an orderId — before this fix it still routed to /rider unconditionally, landing a
  // (usually non-rider) customer on the "Become a rider" onboarding screen mid-delivery.
  it("routes an account-kind push with an orderId to that order (the customer standing-change case)", () => {
    expect(pushDestination({ kind: "account", orderId: "o1" }, false)).toBe("/order/o1");
  });

  it("falls back to /rider for an account-kind push with no orderId (the rider's own KYC/standing case)", () => {
    expect(pushDestination({ kind: "account" }, false)).toBe("/rider");
    expect(pushDestination({ kind: "account", orderId: "" }, true)).toBe("/rider");
  });

  // BH-18: AdminCustomersService.holdCustomer/liftCustomerHold push a THIRD kind:"account" no-orderId
  // shape — about the CUSTOMER themselves, not a rider's own standing — stamped `to:"customer"`. Without
  // honoring it, a plain customer (isRider=false, no rider profile) landed on the rider-onboarding
  // "Become a rider" screen on tap instead of home.
  it("BH-18: routes an account-kind push with no orderId to /home when to:'customer' (a customer's own hold/lift)", () => {
    expect(pushDestination({ kind: "account", to: "customer" }, false)).toBe("/home");
    // Even a dual-role account currently viewing as rider still gets the customer-hold destination —
    // `to` is per-push authoritative, mirroring the sos/cancelled `to` precedence already documented above.
    expect(pushDestination({ kind: "account", to: "customer" }, true)).toBe("/home");
  });

  // P0-2 (navigation review 2026-08-12): a food (merchant) order's customer-facing tracker is
  // /food/order/:id, not the parcel-voiced /order/:id. The server now stamps orderType:"merchant";
  // before this, every food status push opened the parcel screen — and the "Rider secured" (`assigned`)
  // push even sent the customer to /rider/job (the parcel rider's job screen), a dead end.
  it("routes a food order's customer-facing status pushes to the food tracker, whatever the status", () => {
    for (const status of ["requested", "awaiting_payment", "en_route_dropoff", "cancelled"]) {
      expect(pushDestination({ orderId: "o1", status, to: "customer", orderType: "merchant" }, false)).toBe("/food/order/o1");
    }
  });

  it("routes a food 'Rider secured' (assigned) push to the food tracker for the customer, NOT /rider/job", () => {
    // The customer-targeted food `assigned` push carries to:"customer" + orderType:"merchant".
    expect(pushDestination({ orderId: "o1", status: "assigned", to: "customer", orderType: "merchant" }, false)).toBe("/food/order/o1");
    // Even for a dual-role account currently in rider mode — `to` is per-push authoritative.
    expect(pushDestination({ orderId: "o1", status: "assigned", to: "customer", orderType: "merchant" }, true)).toBe("/food/order/o1");
  });

  it("routes a food pay-now (kind:food_pay_now) push to the food tracker", () => {
    expect(pushDestination({ orderId: "o1", status: "awaiting_payment", to: "customer", kind: "food_pay_now", orderType: "merchant" }, false)).toBe(
      "/food/order/o1",
    );
  });

  it("routes SOS on a food order to the food tracker for the customer, and to /rider/job for the rider", () => {
    expect(pushDestination({ orderId: "o1", kind: "sos", to: "customer", orderType: "merchant" }, false)).toBe("/food/order/o1");
    expect(pushDestination({ orderId: "o1", kind: "sos", to: "rider", orderType: "merchant" }, true)).toBe("/rider/job");
  });

  it("keeps the rider on /rider/job for a merchant order pushed to the rider (only the customer gets the food tracker)", () => {
    expect(pushDestination({ orderId: "o1", status: "assigned", to: "rider", orderType: "merchant" }, true)).toBe("/rider/job");
  });

  it("falls back to /order/:id for a food status push with no orderType (older in-flight push)", () => {
    // Backward-compat: before the server stamped orderType, food status pushes routed to the parcel
    // screen; that fallback is preserved for pushes already in flight at deploy time.
    expect(pushDestination({ orderId: "o1", status: "cancelled", to: "customer" }, false)).toBe("/order/o1");
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

// BH-18: the in-app Notifications screen's own destination decision, mirroring pushDestination's
// account-kind branch — extracted so the notifications/index.tsx tap handler is a thin `router.push(...)`
// call over a unit-tested pure function instead of an inline, untested ternary.
describe("notificationRowDestination", () => {
  it("routes an order-scoped row to its order", () => {
    expect(notificationRowDestination({ orderId: "o1" })).toBe("/order/o1");
    expect(notificationRowDestination({ orderId: "o1", to: "customer" })).toBe("/order/o1");
  });

  it("routes an account-status row with no orderId to /home when to:'customer' (the customer's own hold/lift)", () => {
    expect(notificationRowDestination({ orderId: null, to: "customer" })).toBe("/home");
  });

  it("falls back to /rider for every other account-status row with no orderId (KYC/standing/wallet-credit)", () => {
    expect(notificationRowDestination({ orderId: null, to: "rider" })).toBe("/rider");
    expect(notificationRowDestination({ orderId: null })).toBe("/rider");
  });

  // UX19-03: a rider's own "assigned"/"cancelled" feed row must land on the same screen the equivalent
  // push opens (pushDestination's RIDER_JOB_SCREEN_STATUSES / cancelled branches), not the dead-control
  // /order/:id detour (no pickup/confirm/bail controls for an active job; no call button for a cancelled
  // one — CancelledHandback's hand-back guidance only renders at /rider/job).
  it("routes a rider's own 'assigned' row to /rider/job, mirroring pushDestination", () => {
    expect(notificationRowDestination({ orderId: "o1", to: "rider", status: "assigned" })).toBe("/rider/job");
  });

  it("routes a rider's own 'cancelled' row to /rider/job, mirroring pushDestination", () => {
    expect(notificationRowDestination({ orderId: "o1", to: "rider", status: "cancelled" })).toBe("/rider/job");
  });

  it("does not apply the rider-job detour to the customer's own 'assigned'/'cancelled' row", () => {
    expect(notificationRowDestination({ orderId: "o1", to: "customer", status: "assigned" })).toBe("/order/o1");
    expect(notificationRowDestination({ orderId: "o1", to: "customer", status: "cancelled" })).toBe("/order/o1");
  });

  it("leaves every other rider-voiced status routed to /order/:id (only assigned/cancelled dead-end)", () => {
    expect(notificationRowDestination({ orderId: "o1", to: "rider", status: "completed" })).toBe("/order/o1");
    expect(notificationRowDestination({ orderId: "o1", to: "rider", status: "delivered" })).toBe("/order/o1");
  });
});
