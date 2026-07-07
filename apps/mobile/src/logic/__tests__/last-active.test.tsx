import type { OrderSnapshot } from "../../api/orders";
import { deserializeLastActive, serializeLastActive, toLastActive } from "../last-active";

const snapshot = (over: Partial<OrderSnapshot> = {}): OrderSnapshot => ({
  id: "order-1234abcd",
  status: "en_route_dropoff",
  agreedFare: "5.50",
  proposedFare: "5.00",
  pickup: { point: { lat: -17.8, lng: 31.0 }, landmark: "Avondale shops" },
  dropoff: { point: { lat: -17.9, lng: 31.1 }, landmark: "Borrowdale" },
  rider: { profileId: "r1", currentLat: -17.85, currentLng: 31.05, updatedAt: "2026-07-07T10:00:00.000Z" },
  events: [],
  counterpartyPhone: null,
  expiresAt: null,
  ...over,
});

describe("toLastActive", () => {
  it("projects the fields worth showing offline, preferring the agreed fare", () => {
    const la = toLastActive(snapshot(), "2026-07-07T10:01:00.000Z");
    expect(la).toEqual({
      id: "order-1234abcd",
      status: "en_route_dropoff",
      fare: "5.50",
      pickupLandmark: "Avondale shops",
      dropoffLandmark: "Borrowdale",
      rider: { lat: -17.85, lng: 31.05, updatedAt: "2026-07-07T10:00:00.000Z" },
      savedAt: "2026-07-07T10:01:00.000Z",
    });
  });

  it("falls back to the proposed fare before assignment", () => {
    expect(toLastActive(snapshot({ agreedFare: null }), "t").fare).toBe("5.00");
  });

  it("keeps rider null until there is a full GPS fix", () => {
    const noFix = snapshot({ rider: { profileId: "r1", currentLat: null, currentLng: null, updatedAt: null } });
    expect(toLastActive(noFix, "t").rider).toBeNull();
    expect(toLastActive(snapshot({ rider: null }), "t").rider).toBeNull();
  });

  it("clips a pathologically long landmark so the stored blob stays small", () => {
    const long = "x".repeat(500);
    expect(toLastActive(snapshot({ pickup: { point: { lat: 0, lng: 0 }, landmark: long } }), "t").pickupLandmark.length).toBe(120);
  });
});

describe("serialize / deserialize", () => {
  it("round-trips", () => {
    const la = toLastActive(snapshot(), "2026-07-07T10:01:00.000Z");
    expect(deserializeLastActive(serializeLastActive(la))).toEqual(la);
  });

  it("returns null on corrupt or wrong-shape data instead of throwing", () => {
    expect(deserializeLastActive("not json")).toBeNull();
    expect(deserializeLastActive("{}")).toBeNull();
    expect(deserializeLastActive(JSON.stringify({ id: 1, status: "x", fare: "1" }))).toBeNull();
  });

  it("drops a malformed rider but keeps the rest", () => {
    const raw = JSON.stringify({ id: "o1", status: "assigned", fare: "3.00", rider: { lat: "nope" } });
    expect(deserializeLastActive(raw)).toEqual({
      id: "o1",
      status: "assigned",
      fare: "3.00",
      pickupLandmark: "",
      dropoffLandmark: "",
      rider: null,
      savedAt: "",
    });
  });
});
