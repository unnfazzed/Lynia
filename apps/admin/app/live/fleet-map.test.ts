import { describe, expect, it } from "vitest";
import { layoutFleet, MAP_H, MAP_W } from "./fleet-map";
import type { Fleet } from "../lib/adminTypes";

const fleet = (over: Partial<Fleet> = {}): Fleet => ({ generatedAt: "2026-10-13T08:30:00Z", riders: [], orders: [], ...over });
const pos = (lat: number, lng: number, fresh = true) => ({ lat, lng, at: "2026-10-13T08:29:00Z", fresh });

describe("layoutFleet", () => {
  it("projects every point inside the box, north up and east right", () => {
    const out = layoutFleet(
      fleet({
        riders: [
          { riderId: "north", name: "N", position: pos(-17.7, 31.0), orderId: null },
          { riderId: "east", name: "E", position: pos(-17.9, 31.2), orderId: "o1" },
        ],
      }),
    );
    for (const b of out.bikers) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(MAP_W);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(MAP_H);
    }
    const [n, e] = out.bikers;
    expect(n!.y).toBeLessThan(e!.y);
    expect(e!.x).toBeGreaterThan(n!.x);
    expect(e!.onJob).toBe(true);
  });

  it("centres a lone biker instead of dividing by zero", () => {
    const out = layoutFleet(fleet({ riders: [{ riderId: "r", name: "R", position: pos(-17.8, 31.05), orderId: null }] }));
    expect(out.bikers[0]).toMatchObject({ x: MAP_W / 2, y: MAP_H / 2 });
  });

  it("skips missing and 0,0 fixes and counts the bikers it couldn't place", () => {
    const out = layoutFleet(
      fleet({
        riders: [
          { riderId: "a", name: "A", position: null, orderId: null },
          { riderId: "b", name: "B", position: pos(0, 0), orderId: null },
          { riderId: "c", name: "C", position: pos(-17.8, 31.05), orderId: null },
        ],
        orders: [{ orderId: "o", orderType: "parcel", status: "assigned", breach: null, riderId: null, pickup: null, dropoff: null }],
      }),
    );
    expect(out.bikers.map((b) => b.riderId)).toEqual(["c"]);
    expect(out.unplaced).toBe(2);
    expect(out.orders).toEqual([]);
  });

  it("nothing to place is an empty layout", () => {
    expect(layoutFleet(fleet())).toEqual({ bikers: [], orders: [], unplaced: 0 });
  });
});
