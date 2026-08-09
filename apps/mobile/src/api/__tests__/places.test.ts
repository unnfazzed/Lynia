/**
 * A-O16 / LC-A09 regression coverage: the autocomplete/details prefix cache added to cut redundant
 * Google Places calls on metered data (backspace-then-retype, a second address in the same order, a
 * re-selected suggestion). Pins three things: a repeat request is served from cache without a second
 * fetch, a normalized-but-different-case repeat still hits the same entry, and a FAILED request is never
 * cached (so a transient offline blip can't hide suggestions for the whole TTL window).
 */
import { __resetPlacesCacheForTests, autocompletePlaces, placeDetails } from "../places";

jest.mock("../../config", () => ({
  GOOGLE_PLACES_KEY: "test-key",
  placesEnabled: () => true,
}));

/** A minimal Response stub — only the fields `getJson` touches. */
function makeResponse(ok: boolean, body: unknown): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const AUTOCOMPLETE_BODY = {
  predictions: [{ place_id: "p1", structured_formatting: { main_text: "12 Josiah Tongogara", secondary_text: "Harare" } }],
};
const DETAILS_BODY = {
  result: { geometry: { location: { lat: -17.82, lng: 31.05 } }, name: "12 Josiah Tongogara", formatted_address: "Harare" },
};

let fetchMock: jest.Mock;

beforeEach(() => {
  __resetPlacesCacheForTests();
  fetchMock = jest.fn(async () => makeResponse(true, AUTOCOMPLETE_BODY));
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("autocompletePlaces cache", () => {
  it("serves an exact-repeat query from cache without a second fetch", async () => {
    const first = await autocompletePlaces("12 Josiah");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const second = await autocompletePlaces("12 Josiah");
    expect(fetchMock).toHaveBeenCalledTimes(1); // no new network call
    expect(second).toEqual(first);
  });

  it("normalizes case/whitespace so a re-typed variant still hits the cache", async () => {
    await autocompletePlaces("12 Josiah");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await autocompletePlaces("  12 JOSIAH  ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache a failed request, so a retry still hits the network", async () => {
    fetchMock.mockImplementationOnce(async () => makeResponse(false, null));
    const failed = await autocompletePlaces("12 Josiah");
    expect(failed).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const retried = await autocompletePlaces("12 Josiah");
    expect(fetchMock).toHaveBeenCalledTimes(2); // not served from cache
    expect(retried).toHaveLength(1);
  });

  it("treats a genuine zero-result answer as cacheable (not a failure)", async () => {
    fetchMock.mockImplementation(async () => makeResponse(true, { predictions: [] }));
    await autocompletePlaces("zzz no match");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await autocompletePlaces("zzz no match");
    expect(fetchMock).toHaveBeenCalledTimes(1); // still cached, even though the answer was empty
  });

  it("still fires a fresh call for a genuinely different query", async () => {
    await autocompletePlaces("12 Josiah");
    await autocompletePlaces("45 Samora Machel");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("placeDetails cache", () => {
  beforeEach(() => {
    fetchMock.mockImplementation(async () => makeResponse(true, DETAILS_BODY));
  });

  it("serves a repeat place_id lookup from cache without a second fetch", async () => {
    const first = await placeDetails("p1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const second = await placeDetails("p1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("does NOT cache a failed lookup", async () => {
    fetchMock.mockImplementationOnce(async () => makeResponse(false, null));
    const failed = await placeDetails("p1");
    expect(failed).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const retried = await placeDetails("p1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retried).not.toBeNull();
  });

  it("keeps distinct place_ids independent", async () => {
    await placeDetails("p1");
    await placeDetails("p2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
