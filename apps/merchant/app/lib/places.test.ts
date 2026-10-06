import { describe, expect, it } from "vitest";
import { mapDetails, mapReverse, mapSuggestions, pinnedLine } from "./places";

describe("address search for the sign-up location (D-48: Google Places)", () => {
  it("keeps only selectable predictions, with the structured main and secondary text", () => {
    expect(
      mapSuggestions({
        suggestions: [
          { placePrediction: { placeId: "p1", structuredFormat: { mainText: { text: "5th Street" }, secondaryText: { text: "Mbare, Harare" } } } },
          { placePrediction: { text: { text: "no id" } } },
          { queryPrediction: { text: { text: "pizza" } } },
        ],
      }),
    ).toEqual([{ placeId: "p1", primary: "5th Street", secondary: "Mbare, Harare" }]);
    expect(mapSuggestions({})).toEqual([]);
    expect(mapSuggestions(null)).toEqual([]);
  });

  it("resolves a place to its point and a short line: the name, then the next part of the address", () => {
    expect(
      mapDetails({ location: { latitude: -17.86, longitude: 31.04 }, formattedAddress: "5th St, Mbare, Harare, Zimbabwe" }, "5th Street"),
    ).toEqual({ point: { lat: -17.86, lng: 31.04 }, address: "5th Street, Mbare" });
    expect(mapDetails({ formattedAddress: "x" }, "x")).toBeNull();
  });

  it("turns a GPS fix into street + suburb, or null when Google has nothing", () => {
    const point = { lat: -17.86, lng: 31.04 };
    expect(
      mapReverse(
        {
          results: [
            {
              formatted_address: "12 5th St, Mbare, Harare, Zimbabwe",
              address_components: [
                { long_name: "12", types: ["street_number"] },
                { long_name: "5th Street", types: ["route"] },
                { long_name: "Mbare", types: ["sublocality", "political"] },
                { long_name: "Harare", types: ["locality"] },
              ],
            },
          ],
        },
        point,
      ),
    ).toEqual({ point, address: "12 5th Street, Mbare", area: "Mbare" });
    expect(mapReverse({ results: [] }, point)).toBeNull();
    expect(mapReverse({ error_message: "denied", results: [] }, point)).toBeNull();
  });
});

describe("S4: a pasted pin's line (Merchant v2, D-77)", () => {
  it("names the area once the reverse lookup knows it", () => {
    expect(pinnedLine()).toBe("Pin the buyer sent");
    expect(pinnedLine(null)).toBe("Pin the buyer sent");
    expect(pinnedLine("Copacabana")).toBe("Pin the buyer sent · Copacabana");
  });
});
