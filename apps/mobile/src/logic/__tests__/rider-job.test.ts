import { DELIVERY_OTP_MAX_ATTEMPTS as SHARED_DELIVERY_OTP_MAX_ATTEMPTS } from "@lynia/shared";
import { DELIVERY_OTP_MAX_ATTEMPTS, reconcileConfirmItemsPending, reconcileOtpAttempts } from "../rider-job";

describe("DELIVERY_OTP_MAX_ATTEMPTS", () => {
  it("is re-exported from @lynia/shared, not a locally-duplicated copy", () => {
    // Regression guard: this used to be a hand-copied `= 5` that could silently drift from the
    // server's own cap (apps/api/src/orders/order-lifecycle.service.ts).
    expect(DELIVERY_OTP_MAX_ATTEMPTS).toBe(SHARED_DELIVERY_OTP_MAX_ATTEMPTS);
  });
});

// Regression guard (KB-OTP-COUNT-SYNC): the local OTP attempt count must converge to the server's committed
// count in BOTH directions on a fresh snapshot — the old effect only pulled it DOWN, so a lost confirmDelivery
// response (server counted the attempt, client never saw the 401) left the rider shown too many tries. Flash
// safety is the caller's job (it runs this only on a fetched server-value change), so the helper itself is a
// plain converge.
describe("reconcileOtpAttempts", () => {
  it("pulls the count UP when the server is ahead (a lost confirmDelivery response) — the fix", () => {
    expect(reconcileOtpAttempts({ local: 1, serverAttempts: 3 })).toBe(3);
  });

  it("still pulls the count DOWN when the server reset it (customer re-issued the code)", () => {
    expect(reconcileOtpAttempts({ local: 5, serverAttempts: 0 })).toBe(0);
  });

  it("does nothing when already in sync or the server hasn't reported a count", () => {
    expect(reconcileOtpAttempts({ local: 3, serverAttempts: 3 })).toBeNull();
    expect(reconcileOtpAttempts({ local: 3, serverAttempts: null })).toBeNull();
    expect(reconcileOtpAttempts({ local: 3, serverAttempts: undefined })).toBeNull();
  });
});

// Regression guard (KB-CONFIRMITEMS-RETRY): a durable pending pickup-item confirmation must be re-sent while
// the order is still at en_route_pickup with no record, and retired once recorded or the order is gone — the
// server only accepts confirmItems at en_route_pickup, so a retry past that window would 409 forever.
describe("reconcileConfirmItemsPending", () => {
  const at = (status: string, itemsCollected: number[] | null = null): { id: string; status: string; itemsCollected: number[] | null } => ({
    id: "o1",
    status,
    itemsCollected,
  });

  it("retries while the marked order is still at en_route_pickup with no server record", () => {
    expect(reconcileConfirmItemsPending({ pendingOrderId: "o1", order: at("en_route_pickup", null) })).toBe("retry");
  });

  it("clears once the server has the record", () => {
    expect(reconcileConfirmItemsPending({ pendingOrderId: "o1", order: at("en_route_pickup", [0, 1]) })).toBe("clear");
  });

  it("clears when a DIFFERENT order is now the active job (the pending one is gone)", () => {
    expect(reconcileConfirmItemsPending({ pendingOrderId: "o1", order: { id: "o2", status: "en_route_pickup", itemsCollected: null } })).toBe("clear");
  });

  it("waits (keeps the marker, no retry) when the same order has moved past the pickup window", () => {
    // A retry at picked_up would 409 forever; don't hammer it, but don't discard the marker on optimistic state.
    expect(reconcileConfirmItemsPending({ pendingOrderId: "o1", order: at("picked_up", null) })).toBe("wait");
    expect(reconcileConfirmItemsPending({ pendingOrderId: "o1", order: at("en_route_dropoff", null) })).toBe("wait");
  });

  it("waits when there is no marker or no snapshot yet", () => {
    expect(reconcileConfirmItemsPending({ pendingOrderId: null, order: at("en_route_pickup") })).toBe("wait");
    expect(reconcileConfirmItemsPending({ pendingOrderId: undefined, order: at("en_route_pickup") })).toBe("wait");
    expect(reconcileConfirmItemsPending({ pendingOrderId: "o1", order: null })).toBe("wait");
  });
});
