import { etaHeadline, ETA_SPEED_KMH, liveEta, ROAD_WINDING_FACTOR } from "../eta";

// Two points ~2 km apart along a meridian near Harare (1° lat ≈ 111 km, so ~0.018° ≈ 2 km).
const RIDER = { lat: -17.85, lng: 31.05 };
const PICKUP = { lat: -17.832, lng: 31.05 }; // ~2 km north of the rider
const DROPOFF = { lat: -17.9, lng: 31.05 }; // further south

describe("liveEta", () => {
  it("returns null when there's no rider fix yet", () => {
    expect(liveEta({ status: "en_route_pickup", rider: null, pickup: PICKUP, dropoff: DROPOFF })).toBeNull();
  });

  it("returns null for a status with no in-flight leg (open/terminal)", () => {
    for (const status of ["open_for_offers", "delivered", "completed", "cancelled"]) {
      expect(liveEta({ status, rider: RIDER, pickup: PICKUP, dropoff: DROPOFF })).toBeNull();
    }
  });

  it("targets the PICKUP before collection", () => {
    const eta = liveEta({ status: "en_route_pickup", rider: RIDER, pickup: PICKUP, dropoff: DROPOFF });
    expect(eta?.phase).toBe("to_pickup");
    expect(eta?.minutes).toBeGreaterThanOrEqual(1);
  });

  it("switches to the DROP-OFF once picked up", () => {
    const eta = liveEta({ status: "picked_up", rider: RIDER, pickup: PICKUP, dropoff: DROPOFF });
    expect(eta?.phase).toBe("to_dropoff");
  });

  it("computes minutes from distance × winding ÷ speed (ceil, floored at 1)", () => {
    // Rider sitting ON the pickup → sub-minute → floored to 1, never 0.
    const onPickup = liveEta({ status: "en_route_pickup", rider: PICKUP, pickup: PICKUP, dropoff: DROPOFF });
    expect(onPickup?.minutes).toBe(1);

    // ~2 km leg: ceil((2 * 1.3 / 22) * 60) ≈ ceil(7.09) = 8 min. Assert it's in a sane band.
    const eta = liveEta({ status: "en_route_pickup", rider: RIDER, pickup: PICKUP, dropoff: DROPOFF });
    expect(eta?.minutes).toBeGreaterThanOrEqual(6);
    expect(eta?.minutes).toBeLessThanOrEqual(10);
  });

  it("a faster speed yields a shorter or equal ETA", () => {
    const slow = liveEta({ status: "en_route_pickup", rider: RIDER, pickup: PICKUP, dropoff: DROPOFF, speedKmh: 10 });
    const fast = liveEta({ status: "en_route_pickup", rider: RIDER, pickup: PICKUP, dropoff: DROPOFF, speedKmh: 40 });
    expect((slow?.minutes ?? 0)).toBeGreaterThan(fast?.minutes ?? 0);
  });

  it("bakes in the exact road-winding factor and average speed (TP-06)", () => {
    expect(ROAD_WINDING_FACTOR).toBe(1.3);
    expect(ETA_SPEED_KMH).toBe(22);
  });
});

describe("etaHeadline", () => {
  it("names the pickup leg", () => {
    expect(etaHeadline({ phase: "to_pickup", minutes: 4 })).toBe("Arriving at pickup in ~4 min");
  });
  it("names the drop-off leg", () => {
    expect(etaHeadline({ phase: "to_dropoff", minutes: 12 })).toBe("Arriving at drop-off in ~12 min");
  });
});
