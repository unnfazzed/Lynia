import { geocodeGoogle, reverseGeocodeGoogle, toExpoAddress } from "../geocode-google";

const respond = (body: unknown) => jest.fn(async (_url: string) => ({ json: async () => body }));

const AVONDALE = {
  formatted_address: "12 Fife Ave, Harare, Zimbabwe",
  address_components: [
    { long_name: "12", types: ["street_number"] },
    { long_name: "Fife Avenue", types: ["route"] },
    { long_name: "Avondale", types: ["sublocality", "political"] },
    { long_name: "Harare", types: ["locality", "political"] },
    { long_name: "Harare Province", types: ["administrative_area_level_1"] },
    { long_name: "Zimbabwe", short_name: "ZW", types: ["country"] },
  ],
  geometry: { location: { lat: -17.8, lng: 31.04 } },
};

describe("Google geocoding in expo-location's shapes (customer web build)", () => {
  it("maps a result to expo-location's address fields, with no place name made up from the street", () => {
    expect(toExpoAddress(AVONDALE)).toMatchObject({
      name: null,
      streetNumber: "12",
      street: "Fife Avenue",
      district: "Avondale",
      city: "Harare",
      region: "Harare Province",
      country: "Zimbabwe",
      isoCountryCode: "ZW",
      formattedAddress: "12 Fife Ave, Harare, Zimbabwe",
    });
  });

  it("reverse-geocodes a pin with the key", async () => {
    const fetchImpl = respond({ status: "OK", results: [AVONDALE] });
    const out = await reverseGeocodeGoogle({ latitude: -17.8, longitude: 31.04 }, "k-1", fetchImpl);
    expect(out[0]?.street).toBe("Fife Avenue");
    const url = new URL(fetchImpl.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(url.searchParams.get("latlng")).toBe("-17.8,31.04");
    expect(url.searchParams.get("key")).toBe("k-1");
  });

  it("looks up an address inside Zimbabwe only", async () => {
    const fetchImpl = respond({ status: "OK", results: [AVONDALE] });
    await expect(geocodeGoogle("Fife Ave", "k-1", fetchImpl)).resolves.toEqual([{ latitude: -17.8, longitude: 31.04 }]);
    expect(new URL(fetchImpl.mock.calls[0]![0]).searchParams.get("components")).toBe("country:ZW");
  });

  it("answers 'nothing here' with an empty list and 'couldn't ask' with a rejection, like the native calls", async () => {
    await expect(reverseGeocodeGoogle({ latitude: 0, longitude: 0 }, "k", respond({ status: "ZERO_RESULTS", results: [] }))).resolves.toEqual([]);
    await expect(reverseGeocodeGoogle({ latitude: 0, longitude: 0 }, "k", respond({ status: "REQUEST_DENIED" }))).rejects.toThrow("geocode-unavailable");
    await expect(geocodeGoogle("x", null, respond({}))).rejects.toThrow("no key");
  });
});
