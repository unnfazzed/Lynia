import { mapPlaceDetails, mapPredictions, placesFault } from "../places";

/** One Autocomplete (New) place prediction, as `places.googleapis.com/v1/places:autocomplete` sends it. */
function prediction(placeId: unknown, main?: string, secondary?: string, text?: string): unknown {
  return {
    placePrediction: {
      placeId,
      ...(text !== undefined ? { text: { text } } : {}),
      ...(main !== undefined
        ? { structuredFormat: { mainText: { text: main }, ...(secondary !== undefined ? { secondaryText: { text: secondary } } : {}) } }
        : {}),
    },
  };
}

describe("mapPredictions (autocomplete → suggestion rows)", () => {
  it("flattens structured predictions, preferring main/secondary text", () => {
    const body = {
      suggestions: [prediction("abc", "Westgate Shopping Centre", "Lomagundi Rd, Harare", "Westgate Shopping Centre, Lomagundi Rd, Harare")],
    };
    expect(mapPredictions(body)).toEqual([
      { placeId: "abc", primary: "Westgate Shopping Centre", secondary: "Lomagundi Rd, Harare" },
    ]);
  });

  it("falls back to the flat text when structured formatting is absent", () => {
    const body = { suggestions: [prediction("xyz", undefined, undefined, "14 Glenara Ave, Avenues")] };
    expect(mapPredictions(body)).toEqual([{ placeId: "xyz", primary: "14 Glenara Ave, Avenues", secondary: "" }]);
  });

  it("drops rows that cannot be resolved to a point — no placeId, or a query prediction", () => {
    const body = {
      suggestions: [
        prediction(undefined, "no id here"),
        { queryPrediction: { text: { text: "pizza near Harare" } } },
        prediction("ok", "keep me"),
      ],
    };
    expect(mapPredictions(body)).toEqual([{ placeId: "ok", primary: "keep me", secondary: "" }]);
  });

  it("is total — malformed / empty bodies map to []", () => {
    expect(mapPredictions(null)).toEqual([]);
    // An empty result: proto3 omits the empty `suggestions`, so no matches arrive as `{}`.
    expect(mapPredictions({})).toEqual([]);
    expect(mapPredictions({ suggestions: [] })).toEqual([]);
    expect(mapPredictions({ suggestions: "nope" })).toEqual([]);
    expect(mapPredictions({ suggestions: [null, 7, { placePrediction: null }] })).toEqual([]);
  });

  it("maps a refusal to [] — which is why placesFault exists", () => {
    expect(mapPredictions({ error: { code: 403, status: "PERMISSION_DENIED", message: "denied" } })).toEqual([]);
  });
});

describe("mapPlaceDetails (place id → resolved point)", () => {
  it("resolves coordinates + a deduped landmark", () => {
    const body = {
      id: "abc",
      formattedAddress: "Eastgate Mall, Robert Mugabe Rd, Harare",
      location: { latitude: -17.8292, longitude: 31.0522 },
    };
    expect(mapPlaceDetails(body, "req-id", "Eastgate Mall")).toEqual({
      lat: -17.8292,
      lng: 31.0522,
      // name is the head of the formatted address → not repeated
      landmark: "Eastgate Mall, Robert Mugabe Rd, Harare",
      placeId: "abc",
    });
  });

  it("leads with the suggestion's name when the address does not start with it", () => {
    const body = {
      formattedAddress: "Lomagundi Rd, Harare, Zimbabwe",
      location: { latitude: -17.79, longitude: 30.99 },
    };
    // no id in body → threaded from the request argument
    expect(mapPlaceDetails(body, "fallback-id", "Westgate Shopping Centre")).toEqual({
      lat: -17.79,
      lng: 30.99,
      landmark: "Westgate Shopping Centre, Lomagundi Rd, Harare, Zimbabwe",
      placeId: "fallback-id",
    });
  });

  it("prefers a displayName in the body over the threaded name", () => {
    const body = {
      displayName: { text: "Reception" },
      formattedAddress: "14 Glenara Ave, Avenues",
      location: { latitude: -17.81, longitude: 31.06 },
    };
    expect(mapPlaceDetails(body, "id", "stale suggestion text")!.landmark).toBe("Reception, 14 Glenara Ave, Avenues");
  });

  it("still resolves with no name at all — the address alone is the landmark", () => {
    const body = { formattedAddress: "14 Glenara Ave, Avenues", location: { latitude: -17.81, longitude: 31.06 } };
    expect(mapPlaceDetails(body, "id")!.landmark).toBe("14 Glenara Ave, Avenues");
  });

  it("returns null when coordinates are missing (falls back to the pin)", () => {
    expect(mapPlaceDetails({ formattedAddress: "No location" }, "id")).toBeNull();
    expect(mapPlaceDetails({ location: { latitude: "-17.8", longitude: 31 } }, "id")).toBeNull();
    expect(mapPlaceDetails(null, "id")).toBeNull();
    expect(mapPlaceDetails({}, "id")).toBeNull();
    expect(mapPlaceDetails({ error: { code: 403, status: "PERMISSION_DENIED" } }, "id")).toBeNull();
  });

  it("caps an over-long landmark to the Waypoint max (160)", () => {
    const long = "x".repeat(300);
    const body = { location: { latitude: 1, longitude: 2 } };
    expect(mapPlaceDetails(body, "id", long)!.landmark.length).toBe(160);
  });
});

/**
 * A refused call and an honest miss both flatten to `[]` downstream, so a dead key is
 * indistinguishable from an address nobody could find — a live search box that never returns anything,
 * with nothing anywhere saying why. That is how the 2026-09-17 project suspension hid. This is the split
 * that makes them tellable apart (`src/api/places.ts` reports a fault once per run).
 */
describe("placesFault (configuration faults vs. honest misses)", () => {
  it("names the status and, when Google gives one, the precise reason", () => {
    const suspended = {
      error: {
        code: 403,
        status: "PERMISSION_DENIED",
        message: "Permission denied: Consumer 'api_key:…' has been suspended.",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "CONSUMER_SUSPENDED", domain: "googleapis.com" }],
      },
    };
    expect(placesFault(suspended)).toBe("PERMISSION_DENIED:CONSUMER_SUSPENDED");
    expect(
      placesFault({ error: { code: 403, status: "PERMISSION_DENIED", details: [{ "@type": "x", metadata: {} }, { reason: "SERVICE_DISABLED" }] } }),
    ).toBe("PERMISSION_DENIED:SERVICE_DISABLED");
  });

  it("falls back to the status, then the HTTP code, when the body is thinner", () => {
    expect(placesFault({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } })).toBe("RESOURCE_EXHAUSTED");
    expect(placesFault({ error: { code: 400 } })).toBe("HTTP_400");
    expect(placesFault({ error: {} })).toBe("UNKNOWN");
  });

  it("stays silent for success — including the empty one", () => {
    expect(placesFault({})).toBeNull();
    expect(placesFault({ suggestions: [] })).toBeNull();
    expect(placesFault({ id: "abc", location: { latitude: 1, longitude: 2 } })).toBeNull();
  });

  it("is total — a missing or malformed body is not a fault (the network layer already handled it)", () => {
    expect(placesFault(null)).toBeNull();
    expect(placesFault({ error: "nope" })).toBeNull();
    expect(placesFault({ error: null })).toBeNull();
  });
});
