/**
 * The keyless address→coordinates path (`src/logic/geocode.ts`) — the fallback that keeps /send
 * completable when the compose map's tiles never render and no Places key is configured.
 *
 * Pure halves (`geocodeQueries`, `toResolvedPlace`) are tested directly; the `expo-location` edge is
 * driven through a mock so the permission precondition, the corridor-biased retry firing only on a
 * miss, and every failure resolving to a named reason rather than throwing are all pinned.
 */
const mockRequestPermissions = jest.fn();
const mockGeocode = jest.fn();

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
  geocodeAsync: (...args: unknown[]) => mockGeocode(...args),
}));

import { geocodeAddress, geocodeQueries, toResolvedPlace } from "../geocode";

describe("geocodeQueries (corridor biasing)", () => {
  it("tries the query verbatim first, then corridor-biased", () => {
    expect(geocodeQueries("14 Glenara Ave")).toEqual(["14 Glenara Ave", "14 Glenara Ave, Harare, Zimbabwe"]);
  });

  it("does not add the suffix when the query already places itself", () => {
    expect(geocodeQueries("Eastgate Mall, Harare")).toEqual(["Eastgate Mall, Harare"]);
    expect(geocodeQueries("Fife Ave, ZIMBABWE")).toEqual(["Fife Ave, ZIMBABWE"]);
    expect(geocodeQueries("Main St, Bulawayo")).toEqual(["Main St, Bulawayo"]);
  });

  it("collapses whitespace and trims", () => {
    expect(geocodeQueries("  14   Glenara   Ave, Harare ")).toEqual(["14 Glenara Ave, Harare"]);
  });

  it("returns nothing for a query too short to be worth a round trip", () => {
    expect(geocodeQueries("")).toEqual([]);
    expect(geocodeQueries("  ")).toEqual([]);
    expect(geocodeQueries("ab")).toEqual([]);
  });

  it("matches localities as whole words only", () => {
    // "zw" inside another word must not suppress the corridor retry.
    expect(geocodeQueries("Mzwane Road")).toHaveLength(2);
  });
});

describe("toResolvedPlace (geocoder results → the picked-point shape)", () => {
  const results = [{ latitude: -17.8292, longitude: 31.0522 }];

  it("keeps the customer's own typed text as the landmark and carries no place_id", () => {
    expect(toResolvedPlace(results, "  14 Glenara   Ave ")).toEqual({
      lat: -17.8292,
      lng: 31.0522,
      landmark: "14 Glenara Ave",
      // Empty by construction: this point is not a Google place, and send.tsx only attaches a
      // placeId to the order payload when it is truthy.
      placeId: "",
    });
  });

  it("takes the first USABLE result, skipping junk coordinates", () => {
    const mixed = [
      { latitude: Number.NaN, longitude: 31 },
      { latitude: 0, longitude: 0 },
      { latitude: 91, longitude: 31 },
      { latitude: -17.8, longitude: 31.1 },
    ];
    expect(toResolvedPlace(mixed, "somewhere")).toEqual({ lat: -17.8, lng: 31.1, landmark: "somewhere", placeId: "" });
  });

  it("is total — no results, or a query with no text left, map to null", () => {
    expect(toResolvedPlace([], "14 Glenara Ave")).toBeNull();
    expect(toResolvedPlace([{ latitude: 0, longitude: 0 }], "14 Glenara Ave")).toBeNull();
    expect(toResolvedPlace(results, "   ")).toBeNull();
  });

  it("caps the landmark at the confirm sheet's own field length", () => {
    const place = toResolvedPlace(results, "x".repeat(500));
    expect(place?.landmark).toHaveLength(120);
  });
});

describe("geocodeAddress (the expo-location edge)", () => {
  const HIT = [{ latitude: -17.8292, longitude: 31.0522 }];
  const PLACE = { lat: -17.8292, lng: 31.0522, landmark: "14 Glenara Ave", placeId: "" };

  beforeEach(() => {
    mockRequestPermissions.mockReset().mockResolvedValue({ status: "granted" });
    mockGeocode.mockReset();
  });

  it("resolves a verbatim hit without paying for the corridor-biased retry", async () => {
    mockGeocode.mockResolvedValueOnce(HIT);
    await expect(geocodeAddress("14 Glenara Ave")).resolves.toEqual({ ok: true, place: PLACE });
    expect(mockGeocode).toHaveBeenCalledTimes(1);
    expect(mockGeocode).toHaveBeenCalledWith("14 Glenara Ave");
  });

  it("retries corridor-biased when the verbatim query finds nothing", async () => {
    mockGeocode.mockResolvedValueOnce([]).mockResolvedValueOnce(HIT);
    await expect(geocodeAddress("14 Glenara Ave")).resolves.toEqual({ ok: true, place: PLACE });
    expect(mockGeocode).toHaveBeenNthCalledWith(2, "14 Glenara Ave, Harare, Zimbabwe");
  });

  it("reports not-found when every attempt misses", async () => {
    mockGeocode.mockResolvedValue([]);
    await expect(geocodeAddress("14 Glenara Ave")).resolves.toEqual({ ok: false, reason: "not-found" });
    expect(mockGeocode).toHaveBeenCalledTimes(2);
  });

  it("reports permission — and never geocodes — when foreground location is refused", async () => {
    // Android requires foreground location permission before `Geocoder` may be used, so a refusal is
    // its own reason: telling the customer "couldn't find that address" would be a lie.
    mockRequestPermissions.mockResolvedValue({ status: "denied" });
    await expect(geocodeAddress("14 Glenara Ave")).resolves.toEqual({ ok: false, reason: "permission" });
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it("reports unavailable when the device has no working geocoder, without a second stalled call", async () => {
    mockGeocode.mockRejectedValue(new Error("E_NO_GEOCODER"));
    await expect(geocodeAddress("14 Glenara Ave")).resolves.toEqual({ ok: false, reason: "unavailable" });
    expect(mockGeocode).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable when the permission request itself throws", async () => {
    mockRequestPermissions.mockRejectedValue(new Error("boom"));
    await expect(geocodeAddress("14 Glenara Ave")).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("short-circuits a query too short to geocode", async () => {
    await expect(geocodeAddress("ab")).resolves.toEqual({ ok: false, reason: "not-found" });
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });
});
