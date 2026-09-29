/**
 * The keyless address→coordinates path (`src/logic/geocode.ts`) — the fallback that keeps /send
 * completable when the compose map's tiles never render and no Places key is configured.
 *
 * Pure halves (`geocodeQueries`, `toResolvedPlace`) are tested directly; the `expo-location` edge is
 * driven through a mock so the permission precondition, the suffixed retry firing only on a miss, a hit
 * outside Zimbabwe counting as a miss, and every failure resolving to a named reason rather than
 * throwing are all pinned.
 */
const mockRequestPermissions = jest.fn();
const mockGeocode = jest.fn();

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
  geocodeAsync: (...args: unknown[]) => mockGeocode(...args),
}));

import { geocodeAddress, geocodeQueries, toResolvedPlace } from "../geocode";

// Real places a global geocoder can return for these names. Only which side of the Zimbabwe box each
// falls on matters, so the coordinates are rounded.
const WESTGATE_ON_SEA = { latitude: 51.38, longitude: 1.34 }; // Kent, England
const WESTGATE_NAIROBI = { latitude: -1.26, longitude: 36.8 }; // Nairobi, Kenya
const WESTGATE_HARARE = { latitude: -17.79, longitude: 30.99 }; // Lomagundi Rd, Harare
const NORTON_ENGLAND = { latitude: 54.13, longitude: -0.79 }; // North Yorkshire
const NORTON_ZIMBABWE = { latitude: -17.88, longitude: 30.7 };

describe("geocodeQueries (corridor biasing)", () => {
  it("tries the query verbatim first, then corridor-biased", () => {
    expect(geocodeQueries("14 Glenara Ave")).toEqual(["14 Glenara Ave", "14 Glenara Ave, Harare, Zimbabwe"]);
  });

  it("adds no suffix when the query already names the country", () => {
    expect(geocodeQueries("Fife Ave, ZIMBABWE")).toEqual(["Fife Ave, ZIMBABWE"]);
    expect(geocodeQueries("Fife Ave, Harare ZW")).toEqual(["Fife Ave, Harare ZW"]);
  });

  it("retries a query that names a town but not the country with the country, never with Harare", () => {
    // There is a Norton and an Epworth in England: without this retry a verbatim hit there fails the
    // box, and the lookup ends in not-found for a real Zimbabwean town.
    expect(geocodeQueries("Norton")).toEqual(["Norton", "Norton, Zimbabwe"]);
    expect(geocodeQueries("Eastgate Mall, Harare")).toEqual(["Eastgate Mall, Harare", "Eastgate Mall, Harare, Zimbabwe"]);
    expect(geocodeQueries("Main St, Bulawayo")).toEqual(["Main St, Bulawayo", "Main St, Bulawayo, Zimbabwe"]);
  });

  it("collapses whitespace and trims", () => {
    expect(geocodeQueries("  14   Glenara   Ave, Harare ")).toEqual(["14 Glenara Ave, Harare", "14 Glenara Ave, Harare, Zimbabwe"]);
  });

  it("returns nothing for a query too short to be worth a round trip", () => {
    expect(geocodeQueries("")).toEqual([]);
    expect(geocodeQueries("  ")).toEqual([]);
    expect(geocodeQueries("ab")).toEqual([]);
  });

  it("matches localities as whole words only", () => {
    // "zw" inside another word must not suppress the corridor retry, and a town name inside another
    // word must not swap it for the country one.
    expect(geocodeQueries("Mzwane Road")).toEqual(["Mzwane Road", "Mzwane Road, Harare, Zimbabwe"]);
    expect(geocodeQueries("Nortonville Close")).toEqual(["Nortonville Close", "Nortonville Close, Harare, Zimbabwe"]);
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

  it("rejects results outside Zimbabwe and takes the first one inside", () => {
    // What a global geocoder can hand back for a bare "westgate", in the order it might.
    const westgates = [WESTGATE_ON_SEA, WESTGATE_NAIROBI, WESTGATE_HARARE];
    expect(toResolvedPlace(westgates, "westgate")).toEqual({ lat: -17.79, lng: 30.99, landmark: "westgate", placeId: "" });
  });

  it("is null when every result is abroad, never a point in another country", () => {
    expect(toResolvedPlace([WESTGATE_ON_SEA, WESTGATE_NAIROBI], "westgate")).toBeNull();
  });

  it("admits the country's real edges", () => {
    // Border towns at the country's southern and western ends: the box is padded past the border, not
    // drawn along it.
    expect(toResolvedPlace([{ latitude: -22.22, longitude: 30.0 }], "Beitbridge")).toMatchObject({ lat: -22.22, lng: 30.0 });
    expect(toResolvedPlace([{ latitude: -17.93, longitude: 25.84 }], "Victoria Falls")).toMatchObject({ lat: -17.93, lng: 25.84 });
  });

  it("stops just past the padding on every side", () => {
    const pastEachEdge = [
      { latitude: -22.55, longitude: 30.0 }, // south
      { latitude: -15.45, longitude: 30.0 }, // north
      { latitude: -18.0, longitude: 25.05 }, // west
      { latitude: -18.0, longitude: 33.25 }, // east
    ];
    for (const c of pastEachEdge) expect(toResolvedPlace([c], "somewhere")).toBeNull();
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

  it("treats a verbatim hit abroad as a miss and goes on to the Harare-suffixed attempt", async () => {
    mockGeocode.mockResolvedValueOnce([WESTGATE_ON_SEA]).mockResolvedValueOnce([WESTGATE_HARARE]);
    await expect(geocodeAddress("westgate")).resolves.toEqual({
      ok: true,
      place: { lat: -17.79, lng: 30.99, landmark: "westgate", placeId: "" },
    });
    expect(mockGeocode).toHaveBeenNthCalledWith(1, "westgate");
    expect(mockGeocode).toHaveBeenNthCalledWith(2, "westgate, Harare, Zimbabwe");
  });

  it("reports not-found, never a point abroad, when every hit is outside Zimbabwe", async () => {
    mockGeocode.mockResolvedValueOnce([WESTGATE_ON_SEA]).mockResolvedValueOnce([WESTGATE_NAIROBI]);
    await expect(geocodeAddress("westgate")).resolves.toEqual({ ok: false, reason: "not-found" });
    expect(mockGeocode).toHaveBeenCalledTimes(2);
  });

  it("retries a town that also exists abroad as '<q>, Zimbabwe'", async () => {
    mockGeocode.mockResolvedValueOnce([NORTON_ENGLAND]).mockResolvedValueOnce([NORTON_ZIMBABWE]);
    await expect(geocodeAddress("Norton")).resolves.toEqual({
      ok: true,
      place: { lat: -17.88, lng: 30.7, landmark: "Norton", placeId: "" },
    });
    expect(mockGeocode).toHaveBeenNthCalledWith(1, "Norton");
    expect(mockGeocode).toHaveBeenNthCalledWith(2, "Norton, Zimbabwe");
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
