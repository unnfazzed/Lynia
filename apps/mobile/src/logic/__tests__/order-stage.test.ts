import { GPS_PAUSED_MS, phoneMasked, resolveStage, type StageInput, stageMapShare, stagePeekFloor, stageTitleKey, stepIndex, suggestedRetryPrice } from "../order-stage";

const NOW = Date.parse("2026-10-01T09:30:00Z");
const DROP = { lat: -17.8105, lng: 31.0705 };
const base: StageInput = {
  status: "open_for_offers",
  offerCount: 0,
  ridersNearby: 3,
  cancelledBy: null,
  events: [],
  rider: null,
  dropoff: DROP,
  online: true,
  nowMs: NOW,
};
const at = (msAgo: number): string => new Date(NOW - msAgo).toISOString();
const stage = (over: Partial<StageInput>) => resolveStage({ ...base, ...over });

describe("resolveStage", () => {
  it("open_for_offers: finding, no riders, or offers", () => {
    expect(stage({}).stage).toBe("finding");
    expect(stage({ ridersNearby: 0 }).stage).toBe("noRiders");
    // Unknown supply is never "nobody online".
    expect(stage({ ridersNearby: null }).stage).toBe("finding");
    expect(stage({ ridersNearby: undefined }).stage).toBe("finding");
    // Any offer wins over the supply count.
    expect(stage({ offerCount: 2, ridersNearby: 0 }).stage).toBe("offers");
  });

  it.each(["assigned", "confirmed", "en_route_pickup"])("%s → rider on the way to pickup", (status) => {
    expect(stage({ status, rider: { lat: -17.83, lng: 31.05, at: at(5_000) } }).stage).toBe("toPickup");
  });

  it("picked_up → parcel on the way, even at the drop-off", () => {
    expect(stage({ status: "picked_up", rider: { ...DROP, at: at(1_000) } }).stage).toBe("toDropoff");
  });

  it("en_route_dropoff → arriving now within ~150 m of the drop-off", () => {
    expect(stage({ status: "en_route_dropoff", rider: { lat: -17.83, lng: 31.05, at: at(1_000) } }).stage).toBe("toDropoff");
    expect(stage({ status: "en_route_dropoff", rider: { lat: DROP.lat + 0.0009, lng: DROP.lng, at: at(1_000) } }).stage).toBe("handoff");
    expect(stage({ status: "en_route_dropoff", rider: null }).stage).toBe("toDropoff");
  });

  it("terminal statuses", () => {
    expect(stage({ status: "delivered" }).stage).toBe("delivered");
    expect(stage({ status: "completed" }).stage).toBe("completed");
    expect(stage({ status: "undelivered" }).stage).toBe("undelivered");
    expect(stage({ status: "expired" }).stage).toBe("retryNoMatch");
  });

  it("cancelled: a rider bail before pickup is the retry; anything else the cancelled terminal", () => {
    expect(stage({ status: "cancelled", cancelledBy: "rider" }).stage).toBe("retryRiderCancelled");
    expect(stage({ status: "cancelled", cancelledBy: "rider", events: [{ status: "picked_up", createdAt: at(60_000) }] }).stage).toBe("cancelled");
    expect(stage({ status: "cancelled", cancelledBy: "customer" }).stage).toBe("cancelled");
    expect(stage({ status: "cancelled", cancelledBy: null }).stage).toBe("cancelled");
  });

  it("an unknown status falls back to the quiet cancelled screen", () => {
    expect(stage({ status: "something_new" }).stage).toBe("cancelled");
  });

  it("GPS paused after 60 s without a fix, live stages only", () => {
    const fresh = { lat: -17.83, lng: 31.05, at: at(GPS_PAUSED_MS - 1_000) };
    const stale = { lat: -17.83, lng: 31.05, at: at(GPS_PAUSED_MS + 1_000) };
    expect(stage({ status: "en_route_pickup", rider: fresh }).gpsPaused).toBe(false);
    expect(stage({ status: "en_route_pickup", rider: stale }).gpsPaused).toBe(true);
    expect(stage({ status: "picked_up", rider: stale }).gpsPaused).toBe(true);
    // No fix yet: measured from the assignment.
    expect(stage({ status: "assigned", events: [{ status: "assigned", createdAt: at(90_000) }] }).gpsPaused).toBe(true);
    expect(stage({ status: "assigned", events: [{ status: "assigned", createdAt: at(10_000) }] }).gpsPaused).toBe(false);
    // Never on a terminal or the auction.
    expect(stage({ status: "delivered", rider: stale }).gpsPaused).toBe(false);
    expect(stage({ status: "open_for_offers", rider: stale }).gpsPaused).toBe(false);
  });

  it("v2 state 13: the re-broadcast after a rider cancel is a finding state until an offer lands", () => {
    expect(stage({ reopened: true }).stage).toBe("reopened");
    expect(stage({ reopened: true, ridersNearby: 0 }).stage).toBe("reopened");
    expect(stage({ reopened: true, offerCount: 1 }).stage).toBe("offers");
    // Its window closing is the ordinary no-match retry.
    expect(stage({ reopened: true, status: "expired" }).stage).toBe("retryNoMatch");
  });

  it("v2 2.12: matched with no GPS fix yet, until the 60 s paused rule takes over", () => {
    const assigned = [{ status: "assigned", createdAt: at(10_000) }];
    expect(stage({ status: "en_route_pickup", events: assigned }).noFix).toBe(true);
    expect(stage({ status: "en_route_pickup", events: assigned, rider: { lat: -17.83, lng: 31.05, at: at(1_000) } }).noFix).toBe(false);
    const old = [{ status: "assigned", createdAt: at(GPS_PAUSED_MS + 5_000) }];
    const r = stage({ status: "en_route_pickup", events: old });
    expect(r.gpsPaused).toBe(true);
    expect(r.noFix).toBe(false);
    expect(stage({ status: "delivered" }).noFix).toBe(false);
  });

  it("offline follows reachability on every stage", () => {
    expect(stage({ online: false }).offline).toBe(true);
    expect(stage({ status: "picked_up", online: false }).offline).toBe(true);
    expect(stage({ online: true }).offline).toBe(false);
  });
});

describe("stage helpers", () => {
  it("titles never show an order id or raw status", () => {
    expect(stageTitleKey("finding")).toBe("tFinding");
    expect(stageTitleKey("handoff")).toBe("tHandoff");
    expect(stageTitleKey("retryRiderCancelled")).toBe("tRiderCx");
  });

  it("peek shares follow the README table", () => {
    expect(stageMapShare("finding")).toBe(0.34);
    expect(stageMapShare("offers")).toBe(0.16);
    expect(stageMapShare("toPickup")).toBe(0.3);
    expect(stageMapShare("handoff")).toBe(0.17);
    expect(stageMapShare("retryNoMatch")).toBe(0.26);
    expect(stageMapShare("undelivered")).toBe(0.22);
    expect(stageMapShare("completed")).toBe(0.2);
    expect(stageMapShare("delivered")).toBe(0.14);
  });

  it("v2 peek floors per window and font scale", () => {
    expect(stagePeekFloor("finding", 720, 1)).toBe(424);
    expect(stagePeekFloor("offers", 640, 1)).toBe(473);
    expect(stagePeekFloor("offers", 640, 1.3)).toBe(495);
    expect(stagePeekFloor("handoff", 720, 1.3)).toBe(534);
    expect(stagePeekFloor("completed", 720, 1)).toBe(0);
  });

  it("step track", () => {
    expect(stepIndex("assigned")).toBe(0);
    expect(stepIndex("en_route_pickup")).toBe(0);
    expect(stepIndex("picked_up")).toBe(1);
    expect(stepIndex("en_route_dropoff")).toBe(2);
    expect(stepIndex("delivered")).toBe(3);
  });

  it("phones are masked once the trip ends, except undelivered", () => {
    expect(phoneMasked("delivered")).toBe(true);
    expect(phoneMasked("completed")).toBe(true);
    expect(phoneMasked("cancelled")).toBe(true);
    expect(phoneMasked("undelivered")).toBe(false);
    expect(phoneMasked("toDropoff")).toBe(false);
  });

  it("suggested retry price is last + $0.50", () => {
    expect(suggestedRetryPrice(3.36)).toBe(3.86);
    expect(suggestedRetryPrice(4)).toBe(4.5);
  });
});
