import { mapPlaceDetails, mapPredictions } from "../places";

describe("mapPredictions (autocomplete → suggestion rows)", () => {
  it("flattens structured predictions, preferring main/secondary text", () => {
    const body = {
      predictions: [
        {
          place_id: "abc",
          description: "Eastgate Mall, Robert Mugabe Rd, Harare",
          structured_formatting: { main_text: "Eastgate Mall", secondary_text: "Robert Mugabe Rd, Harare" },
        },
      ],
    };
    expect(mapPredictions(body)).toEqual([
      { placeId: "abc", primary: "Eastgate Mall", secondary: "Robert Mugabe Rd, Harare" },
    ]);
  });

  it("falls back to the flat description when structured formatting is absent", () => {
    const body = { predictions: [{ place_id: "xyz", description: "14 Glenara Ave, Avenues" }] };
    expect(mapPredictions(body)).toEqual([{ placeId: "xyz", primary: "14 Glenara Ave, Avenues", secondary: "" }]);
  });

  it("drops predictions with no place_id (unselectable)", () => {
    const body = { predictions: [{ description: "no id here" }, { place_id: "ok", description: "keep me" }] };
    expect(mapPredictions(body)).toEqual([{ placeId: "ok", primary: "keep me", secondary: "" }]);
  });

  it("is total — malformed / empty bodies map to []", () => {
    expect(mapPredictions(null)).toEqual([]);
    expect(mapPredictions({})).toEqual([]);
    expect(mapPredictions({ predictions: "nope" })).toEqual([]);
    expect(mapPredictions({ status: "ZERO_RESULTS", predictions: [] })).toEqual([]);
  });
});

describe("mapPlaceDetails (place_id → resolved point)", () => {
  it("resolves coordinates + a deduped landmark", () => {
    const body = {
      result: {
        geometry: { location: { lat: -17.8292, lng: 31.0522 } },
        name: "Eastgate Mall",
        formatted_address: "Eastgate Mall, Robert Mugabe Rd, Harare",
        place_id: "abc",
      },
    };
    expect(mapPlaceDetails(body, "req-id")).toEqual({
      lat: -17.8292,
      lng: 31.0522,
      // name is the head of the formatted address → not repeated
      landmark: "Eastgate Mall, Robert Mugabe Rd, Harare",
      placeId: "abc",
    });
  });

  it("joins name + address when the name is not already the address head", () => {
    const body = {
      result: {
        geometry: { location: { lat: -17.81, lng: 31.06 } },
        name: "Reception",
        formatted_address: "14 Glenara Ave, Avenues",
      },
    };
    // no place_id in body → threaded from the request argument
    expect(mapPlaceDetails(body, "fallback-id")).toEqual({
      lat: -17.81,
      lng: 31.06,
      landmark: "Reception, 14 Glenara Ave, Avenues",
      placeId: "fallback-id",
    });
  });

  it("returns null when coordinates are missing (falls back to the pin)", () => {
    expect(mapPlaceDetails({ result: { name: "No geometry" } }, "id")).toBeNull();
    expect(mapPlaceDetails(null, "id")).toBeNull();
    expect(mapPlaceDetails({}, "id")).toBeNull();
  });

  it("caps an over-long landmark to the Waypoint max (160)", () => {
    const long = "x".repeat(300);
    const body = { result: { geometry: { location: { lat: 1, lng: 2 } }, name: long, formatted_address: "" } };
    expect(mapPlaceDetails(body, "id")!.landmark.length).toBe(160);
  });
});
