/**
 * The Places network edge (`src/api/places.ts`) — the half of search-first addressing the mapper tests
 * cannot see: WHICH endpoint is called, HOW the key travels, and whether a refusal is ever reported.
 *
 * The last point is the one that let the 2026-09-17 project suspension go unnoticed. The old client
 * returned null for any non-OK status before the fault check ran, so a key refused on every call
 * produced an empty list and no report at all. Places (New) refuses with an HTTP 403 whose JSON names
 * the reason; these pin that the body is read, reported once, and still degrades to "no rows".
 */
let mockKey: string | null = "AIza-test-key";
const mockCapture = jest.fn();

jest.mock("../../config", () => ({
  get GOOGLE_PLACES_KEY() {
    return mockKey;
  },
  placesEnabled: () => typeof mockKey === "string" && mockKey.length > 0,
}));
jest.mock("../../telemetry/sentry", () => ({ captureException: (e: unknown) => mockCapture(e) }));

type PlacesModule = typeof import("../places");

/** A fresh module per test — the fault report is deliberately once-per-run module state. */
function loadPlaces(): PlacesModule {
  let mod!: PlacesModule;
  jest.isolateModules(() => {
    mod = require("../places") as PlacesModule;
  });
  return mod;
}

function respond(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  } as unknown as Response;
}

const REFUSED = {
  error: {
    code: 403,
    status: "PERMISSION_DENIED",
    message: "Permission denied: Consumer has been suspended.",
    details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "CONSUMER_SUSPENDED" }],
  },
};

let fetchMock: jest.Mock;

beforeEach(() => {
  mockKey = "AIza-test-key";
  mockCapture.mockReset();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("autocompletePlaces", () => {
  it("POSTs Places (New) autocomplete, biased to Harare and restricted to Zimbabwe", async () => {
    fetchMock.mockResolvedValue(
      respond(200, {
        suggestions: [
          {
            placePrediction: {
              placeId: "west",
              text: { text: "Westgate Shopping Centre, Harare" },
              structuredFormat: { mainText: { text: "Westgate Shopping Centre" }, secondaryText: { text: "Harare" } },
            },
          },
        ],
      }),
    );
    const { autocompletePlaces } = loadPlaces();

    const rows = await autocompletePlaces("  westgate ", "tok-1");

    expect(rows).toEqual([{ placeId: "west", primary: "Westgate Shopping Centre", secondary: "Harare" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Goog-Api-Key"]).toBe("AIza-test-key");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      input: "westgate",
      includedRegionCodes: ["zw"],
      locationBias: { circle: { center: { latitude: -17.8292, longitude: 31.0522 }, radius: 50000 } },
      sessionToken: "tok-1",
    });
  });

  it("never puts the key in the URL", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    const { autocompletePlaces } = loadPlaces();
    await autocompletePlaces("westgate");
    expect(fetchMock.mock.calls[0][0]).not.toContain("AIza-test-key");
  });

  it("makes no call without a key, or for a query too short to search", async () => {
    const { autocompletePlaces } = loadPlaces();
    await expect(autocompletePlaces("ab")).resolves.toEqual([]);
    mockKey = null;
    await expect(autocompletePlaces("westgate")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads a refusal's body, reports it once per run, and still degrades to no rows", async () => {
    fetchMock.mockResolvedValue(respond(403, REFUSED));
    const { autocompletePlaces } = loadPlaces();

    await expect(autocompletePlaces("westgate")).resolves.toEqual([]);
    await expect(autocompletePlaces("westgate mall")).resolves.toEqual([]);

    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect((mockCapture.mock.calls[0][0] as Error).message).toBe("places-status-PERMISSION_DENIED:CONSUMER_SUSPENDED");
  });

  it("reports each DISTINCT fault once, so a transient refusal cannot hide a configuration fault", async () => {
    const { autocompletePlaces } = loadPlaces();
    fetchMock.mockResolvedValueOnce(respond(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded." } }));
    await autocompletePlaces("westgate");
    fetchMock.mockResolvedValue(respond(403, REFUSED));
    await autocompletePlaces("westgate");
    await autocompletePlaces("westgate mall");

    expect(mockCapture.mock.calls.map(([e]) => (e as Error).message)).toEqual([
      "places-status-RESOURCE_EXHAUSTED",
      "places-status-PERMISSION_DENIED:CONSUMER_SUSPENDED",
    ]);
  });

  it("never puts Google's message text in the report — it can quote the key", async () => {
    const echoing = { error: { ...REFUSED.error, message: "Permission denied: Consumer 'api_key:AIza-test-key' has been suspended." } };
    fetchMock.mockResolvedValue(respond(403, echoing));
    const { autocompletePlaces } = loadPlaces();
    await autocompletePlaces("westgate");
    expect((mockCapture.mock.calls[0][0] as Error).message).not.toContain("AIza-test-key");
  });

  it("treats an honest empty answer as neither rows nor a fault", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    const { autocompletePlaces } = loadPlaces();
    await expect(autocompletePlaces("zzzzqqq")).resolves.toEqual([]);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("never throws — a dropped link or a non-JSON body is just no rows", async () => {
    const { autocompletePlaces } = loadPlaces();
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(autocompletePlaces("westgate")).resolves.toEqual([]);
    // A proxy's HTML error page: `res.json()` rejects.
    fetchMock.mockResolvedValueOnce(respond(502, "<html>Bad Gateway</html>"));
    await expect(autocompletePlaces("westgate")).resolves.toEqual([]);
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe("placeDetails", () => {
  it("GETs the place with an Essentials-only field mask and leads the landmark with the suggestion's name", async () => {
    fetchMock.mockResolvedValue(
      respond(200, { id: "west", formattedAddress: "Lomagundi Rd, Harare, Zimbabwe", location: { latitude: -17.79, longitude: 30.99 } }),
    );
    const { placeDetails } = loadPlaces();

    const place = await placeDetails("west", "tok-1", "Westgate Shopping Centre");

    expect(place).toEqual({
      lat: -17.79,
      lng: 30.99,
      landmark: "Westgate Shopping Centre, Lomagundi Rd, Harare, Zimbabwe",
      placeId: "west",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://places.googleapis.com/v1/places/west?sessionToken=tok-1");
    expect(init.method).toBe("GET");
    expect(init.headers["X-Goog-Api-Key"]).toBe("AIza-test-key");
    // `displayName` would bill every lookup at the Pro tier; the name comes from the suggestion instead.
    expect(init.headers["X-Goog-FieldMask"]).toBe("id,formattedAddress,location");
    expect(url).not.toContain("AIza-test-key");
  });

  it("returns null — and reports — when the lookup is refused", async () => {
    fetchMock.mockResolvedValue(respond(403, REFUSED));
    const { placeDetails } = loadPlaces();
    await expect(placeDetails("west", "tok-1", "Westgate")).resolves.toBeNull();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("makes no call without a key or a place id", async () => {
    const { placeDetails } = loadPlaces();
    await expect(placeDetails("")).resolves.toBeNull();
    mockKey = null;
    await expect(placeDetails("west")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
