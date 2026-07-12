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
import { selectOrderShell, selectRiderTelemetry } from "../order-tracking";

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
