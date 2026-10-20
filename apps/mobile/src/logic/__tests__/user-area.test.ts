/**
 * Where the user is (D-120, owner 2026-10-20): live in Harare and Bulawayo, so search, the geocoder retry
 * and the maps' opening view follow the user's last known point instead of always assuming Harare.
 */
import { defaultMapCenter, defaultMapRegion, noteUserPoint, resetUserArea, userPoint, userTown } from "../user-area";

const HARARE = { lat: -17.8292, lng: 31.0522 };
const BULAWAYO_SUBURB = { lat: -20.18, lng: 28.62 }; // Hillside
const MUTARE = { lat: -18.97, lng: 32.67 };
const LONDON = { lat: 51.5, lng: -0.12 };

afterEach(() => resetUserArea());

describe("user-area", () => {
  it("knows nothing until a point is noted: maps open on Harare, there is no town", () => {
    expect(userPoint()).toBeNull();
    expect(userTown()).toBeNull();
    expect(defaultMapCenter()).toEqual({ latitude: HARARE.lat, longitude: HARARE.lng });
  });

  it("a Bulawayo point opens the maps in Bulawayo and names the town", () => {
    noteUserPoint(BULAWAYO_SUBURB);
    expect(userPoint()).toEqual(BULAWAYO_SUBURB);
    expect(userTown()).toBe("Bulawayo");
    expect(defaultMapRegion(0.04)).toEqual({ latitude: BULAWAYO_SUBURB.lat, longitude: BULAWAYO_SUBURB.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 });
  });

  it("a point in Zimbabwe away from both towns is kept but names no town", () => {
    noteUserPoint(MUTARE);
    expect(userPoint()).toEqual(MUTARE);
    expect(userTown()).toBeNull();
  });

  it("ignores a point outside Zimbabwe and junk", () => {
    noteUserPoint(HARARE);
    noteUserPoint(LONDON);
    noteUserPoint({ lat: Number.NaN, lng: 31 });
    noteUserPoint(null);
    expect(userPoint()).toEqual(HARARE);
    expect(userTown()).toBe("Harare");
  });
});
