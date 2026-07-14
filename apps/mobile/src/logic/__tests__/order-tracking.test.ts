/**
 * The order screen's re-render split (PERF, deferred 2026-07-09) rests on two selector properties:
 *   1. `selectOrderShell` must map any two GPS ticks of the same order to DEEP-EQUAL shells — that is
 *      the precondition React Query's structural sharing needs to hand the screen's observer back the
 *      previous reference (no re-render). If a telemetry field ever leaks through the shell, the whole
 *      ~900-line screen silently goes back to re-rendering every ~10s for entire deliveries.
 *   2. `selectRiderTelemetry` must carry exactly what a "position" push rewrites (plus rider
 *      presence), so the LiveTrackingCard keeps repainting per tick and the staleness escalation
 *      (isRiderTrackingStale) keeps seeing fresh `updatedAt`s.
 * The end-to-end render behaviour is covered in src/ui/order/__tests__/live-tracking-isolation.test.tsx.
 */
import type { OrderSnapshot } from "../../api/orders";
import { expiredTerminalKind, orderLoadErrorKind, reconcileDeliveryCode, selectOrderShell, selectRiderTelemetry } from "../order-tracking";

const base: OrderSnapshot = {
  id: "order-1",
  status: "en_route_dropoff",
  agreedFare: "5.00",
  proposedFare: "4.50",
  pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" },
  dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" },
  rider: { profileId: "r1", currentLat: -17.825, currentLng: 31.055, updatedAt: "2026-07-12T12:00:00.000Z" },
  events: [{ status: "assigned", lat: null, lng: null, createdAt: "2026-07-12T11:50:00.000Z" }],
  counterpartyPhone: "+263771234567",
  expiresAt: null,
};

/** A WS "position" push as use-order-socket applies it: only the rider telemetry fields move. */
function gpsTick(o: OrderSnapshot, lat: number, lng: number, at: string): OrderSnapshot {
  return { ...o, rider: { ...o.rider!, currentLat: lat, currentLng: lng, updatedAt: at } };
}

describe("selectOrderShell", () => {
  it("strips the per-tick telemetry but keeps rider presence and everything else", () => {
    const shell = selectOrderShell(base);
    expect(shell.rider).toEqual({ profileId: "r1", currentLat: null, currentLng: null, updatedAt: null });
    // Everything the screen renders from must survive untouched.
    expect(shell.status).toBe("en_route_dropoff");
    expect(shell.pickup).toBe(base.pickup);
    expect(shell.dropoff).toBe(base.dropoff);
    expect(shell.events).toBe(base.events);
    expect(shell.counterpartyPhone).toBe("+263771234567");
  });

  it("maps two GPS ticks of the same order to DEEP-EQUAL shells (the structural-sharing precondition)", () => {
    const tick1 = gpsTick(base, -17.824, 31.056, "2026-07-12T12:00:10.000Z");
    const tick2 = gpsTick(tick1, -17.823, 31.057, "2026-07-12T12:00:20.000Z");
    expect(selectOrderShell(tick1)).toEqual(selectOrderShell(tick2));
  });

  it("still differs across a REAL change (status transition), so the screen does re-render for those", () => {
    const delivered = { ...gpsTick(base, -17.82, 31.06, "2026-07-12T12:05:00.000Z"), status: "delivered" as const };
    expect(selectOrderShell(base)).not.toEqual(selectOrderShell(delivered));
    expect(selectOrderShell(delivered).status).toBe("delivered");
  });

  it("passes a rider-less snapshot through by reference (nothing to strip)", () => {
    const noRider = { ...base, rider: null };
    expect(selectOrderShell(noRider)).toBe(noRider);
  });
});

describe("selectRiderTelemetry", () => {
  it("carries exactly the per-tick slice: position, updatedAt, and rider presence", () => {
    expect(selectRiderTelemetry(base)).toEqual({
      hasRider: true,
      lat: -17.825,
      lng: 31.055,
      updatedAt: "2026-07-12T12:00:00.000Z",
    });
  });

  it("changes between ticks (the card MUST re-render per position push)", () => {
    const tick = gpsTick(base, -17.824, 31.056, "2026-07-12T12:00:10.000Z");
    expect(selectRiderTelemetry(tick)).not.toEqual(selectRiderTelemetry(base));
    expect(selectRiderTelemetry(tick).updatedAt).toBe("2026-07-12T12:00:10.000Z");
  });

  it("reports no rider / no fix honestly (drives 'Waiting for the rider's GPS…')", () => {
    expect(selectRiderTelemetry({ ...base, rider: null })).toEqual({ hasRider: false, lat: null, lng: null, updatedAt: null });
    expect(selectRiderTelemetry({ ...base, rider: { profileId: "r1", currentLat: null, currentLng: null, updatedAt: null } })).toEqual({
      hasRider: true,
      lat: null,
      lng: null,
      updatedAt: null,
    });
  });
});

// Regression guard: before this, a 403 (party-only IDOR gate) was bucketed with a plain transient
// fetch error and given a "Retry" button that can never succeed for a permanently-forbidden order.
describe("orderLoadErrorKind", () => {
  it("treats 404 as not_found", () => {
    expect(orderLoadErrorKind(404)).toBe("not_found");
  });

  it("treats 403 as forbidden, distinct from not_found and transient", () => {
    expect(orderLoadErrorKind(403)).toBe("forbidden");
  });

  it("treats any other status, or no status at all, as transient (retryable)", () => {
    expect(orderLoadErrorKind(500)).toBe("transient");
    expect(orderLoadErrorKind(0)).toBe("transient");
    expect(orderLoadErrorKind(undefined)).toBe("transient");
  });
});

// Regression guard (07-14): the expired-auction terminal must not tell a customer "no riders took this
// price" when riders DID bid. On a cold start into an already-expired order the client's live `bidCount`
// is 0 (the offers query only holds `pending` offers, gone post-expiry), so the server's durable
// `hadOffers` is what keeps the copy honest. Either signal ⇒ "had-offers".
describe("expiredTerminalKind", () => {
  it("says had-offers when the LIVE bidCount shows riders bid (the warm, non-killed case)", () => {
    expect(expiredTerminalKind({ bidCount: 3, hadOffers: null, expiryNoSupply: null })).toBe("had-offers");
  });

  it("says had-offers on a COLD start (bidCount 0) when the server's hadOffers is true — the fix", () => {
    // The exact repro: riders bid, customer didn't pick, window expired, app force-killed, cold reopen.
    // The cache only ever held pending offers so bidCount is 0, but hadOffers recovers the truth.
    expect(expiredTerminalKind({ bidCount: 0, hadOffers: true, expiryNoSupply: null })).toBe("had-offers");
    // hadOffers wins even if a no-supply flag somehow also came back (riders bidding ⇒ there was supply).
    expect(expiredTerminalKind({ bidCount: 0, hadOffers: true, expiryNoSupply: true })).toBe("had-offers");
  });

  it("says no-supply only when nobody bid AND nobody was online near the pickup", () => {
    expect(expiredTerminalKind({ bidCount: 0, hadOffers: false, expiryNoSupply: true })).toBe("no-supply");
  });

  it("falls back to no-offers when nobody bid but supply existed", () => {
    expect(expiredTerminalKind({ bidCount: 0, hadOffers: false, expiryNoSupply: false })).toBe("no-offers");
    // Older API / missing fields must not crash or over-claim — default to no-offers, today's behaviour.
    expect(expiredTerminalKind({ bidCount: 0, hadOffers: null, expiryNoSupply: null })).toBe("no-offers");
    expect(expiredTerminalKind({ bidCount: 0, hadOffers: undefined, expiryNoSupply: undefined })).toBe("no-offers");
  });
});

// Regression guard (07-14): a delivery code rotated while the app was killed mid re-issue must be detected
// so the customer stops relaying a dead code. deliveryOtpAttempts is the only rotation signal (no timestamp
// in the snapshot); it's monotonic while a code is current and resets to 0 on rotation, so a drop below the
// high-water mark is the tell.
describe("reconcileDeliveryCode", () => {
  it("does nothing when there is no local code to protect", () => {
    expect(reconcileDeliveryCode({ hasLocalCode: false, storedAttemptsHighWater: 5, snapshotAttempts: 0 })).toEqual({ action: "none" });
  });

  it("does nothing when the server hasn't reported an attempt count yet (missing signal ⇒ safe)", () => {
    expect(reconcileDeliveryCode({ hasLocalCode: true, storedAttemptsHighWater: 3, snapshotAttempts: null })).toEqual({ action: "none" });
    expect(reconcileDeliveryCode({ hasLocalCode: true, storedAttemptsHighWater: 3, snapshotAttempts: undefined })).toEqual({ action: "none" });
  });

  it("does nothing for a code stored before this fix (no baseline high-water recorded)", () => {
    // Backward-compat: an old stored code has no companion attempts value, so we must never invalidate it.
    expect(reconcileDeliveryCode({ hasLocalCode: true, storedAttemptsHighWater: null, snapshotAttempts: 0 })).toEqual({ action: "none" });
  });

  it("advances the high-water as a rider burns attempts against the CURRENT code", () => {
    expect(reconcileDeliveryCode({ hasLocalCode: true, storedAttemptsHighWater: 0, snapshotAttempts: 1 })).toEqual({ action: "advance-highwater", attempts: 1 });
    expect(reconcileDeliveryCode({ hasLocalCode: true, storedAttemptsHighWater: 2, snapshotAttempts: 5 })).toEqual({ action: "advance-highwater", attempts: 5 });
  });

  it("does nothing when the count is unchanged (steady state)", () => {
    expect(reconcileDeliveryCode({ hasLocalCode: true, storedAttemptsHighWater: 5, snapshotAttempts: 5 })).toEqual({ action: "none" });
    expect(reconcileDeliveryCode({ hasLocalCode: true, storedAttemptsHighWater: 0, snapshotAttempts: 0 })).toEqual({ action: "none" });
  });

  it("invalidates the stale code when attempts DROP below the high-water — the rotation tell", () => {
    // Repro: rider hit the lockout (attempts climbed to 5, high-water 5), customer re-issued → server
    // reset to 0 and rotated the hash, app killed before the response landed. Cold start sees attempts 0.
    expect(reconcileDeliveryCode({ hasLocalCode: true, storedAttemptsHighWater: 5, snapshotAttempts: 0 })).toEqual({ action: "invalidate" });
    // Any drop counts, not just a full reset to 0.
    expect(reconcileDeliveryCode({ hasLocalCode: true, storedAttemptsHighWater: 3, snapshotAttempts: 1 })).toEqual({ action: "invalidate" });
  });
});
