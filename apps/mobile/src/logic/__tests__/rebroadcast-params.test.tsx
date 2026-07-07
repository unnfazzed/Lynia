import { buildRebroadcastParams, draftFromParams } from "../order-draft";

const PICKUP = { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate, CBD" };
const DROPOFF = { point: { lat: -17.79, lng: 31.08 }, landmark: "14 Glenara Ave" };

describe("buildRebroadcastParams", () => {
  it("serialises the route + landmarks + fare as string params", () => {
    const p = buildRebroadcastParams({ pickup: PICKUP, dropoff: DROPOFF, proposedFare: 3.5, items: [{ description: "Documents", quantity: 2 }] });
    expect(p.rbPickupLat).toBe(String(PICKUP.point.lat));
    expect(p.rbDropLandmark).toBe("14 Glenara Ave");
    expect(p.rbFare).toBe("3.5");
  });

  it("carries structured line-items through as JSON", () => {
    const p = buildRebroadcastParams({ pickup: PICKUP, dropoff: DROPOFF, items: [{ description: "Keys", quantity: 1 }] });
    expect(JSON.parse(p.rbItems as string)).toEqual([{ description: "Keys", quantity: 1 }]);
  });

  it("wraps a history itemDesc summary into a single item when there are no structured items", () => {
    const p = buildRebroadcastParams({ pickup: PICKUP, dropoff: DROPOFF, itemDesc: "Documents ×2" });
    expect(JSON.parse(p.rbItems as string)).toEqual([{ description: "Documents ×2", quantity: 1 }]);
  });

  it("round-trips back into a valid compose draft (reorder actually prefills the form)", () => {
    const p = buildRebroadcastParams({ pickup: PICKUP, dropoff: DROPOFF, itemDesc: "Documents", proposedFare: "2.50" });
    const draft = draftFromParams(p);
    expect(draft).not.toBeNull();
    expect(draft?.pickupPoint).toEqual(PICKUP.point);
    expect(draft?.dropLandmark).toBe(DROPOFF.landmark);
    expect(draft?.items[0]?.description).toBe("Documents");
    expect(draft?.proposedFare).toBe("2.50");
  });

  it("tolerates missing landmark / fare (empty strings, still a valid draft)", () => {
    const p = buildRebroadcastParams({ pickup: { point: PICKUP.point }, dropoff: { point: DROPOFF.point } });
    expect(p.rbPickupLandmark).toBe("");
    expect(p.rbFare).toBe("");
    expect(draftFromParams(p)).not.toBeNull();
  });
});
