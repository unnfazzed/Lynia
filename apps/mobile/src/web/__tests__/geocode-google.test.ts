import { geocodeGoogle, type GoogleResult, type JsGeocode, reverseGeocodeGoogle, toExpoAddress } from "../geocode-google";

const AVONDALE: GoogleResult = {
  formatted_address: "12 Fife Ave, Harare, Zimbabwe",
  address_components: [
    { long_name: "12", types: ["street_number"] },
    { long_name: "Fife Avenue", types: ["route"] },
    { long_name: "Avondale", types: ["sublocality", "political"] },
    { long_name: "Harare", types: ["locality", "political"] },
    { long_name: "Harare Province", types: ["administrative_area_level_1"] },
    { long_name: "Zimbabwe", short_name: "ZW", types: ["country"] },
  ],
  // The Maps JavaScript API's LatLng exposes lat()/lng() methods, not numbers.
  geometry: { location: { lat: () => -17.8, lng: () => 31.04 } },
};

const answering = (results: GoogleResult[]) => jest.fn<ReturnType<JsGeocode>, Parameters<JsGeocode>>(async () => ({ results }));
const failing = (err: unknown) => jest.fn<ReturnType<JsGeocode>, Parameters<JsGeocode>>(async () => Promise.reject(err));

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

  it("reverse-geocodes a pin through the Maps JavaScript Geocoder", async () => {
    const geocode = answering([AVONDALE]);
    const out = await reverseGeocodeGoogle({ latitude: -17.8, longitude: 31.04 }, geocode);
    expect(out[0]?.street).toBe("Fife Avenue");
    expect(geocode).toHaveBeenCalledWith({ location: { lat: -17.8, lng: 31.04 } });
  });

  it("looks up an address inside Zimbabwe only, reading LatLng methods", async () => {
    const geocode = answering([AVONDALE]);
    await expect(geocodeGoogle("Fife Ave", geocode)).resolves.toEqual([{ latitude: -17.8, longitude: 31.04 }]);
    expect(geocode).toHaveBeenCalledWith({ address: "Fife Ave", componentRestrictions: { country: "ZW" } });
  });

  it("answers 'nothing here' with an empty list and 'couldn't ask' with a rejection, like the native calls", async () => {
    await expect(reverseGeocodeGoogle({ latitude: 0, longitude: 0 }, failing({ code: "ZERO_RESULTS" }))).resolves.toEqual([]);
    await expect(reverseGeocodeGoogle({ latitude: 0, longitude: 0 }, failing(new Error("REQUEST_DENIED")))).rejects.toThrow("REQUEST_DENIED");
    await expect(geocodeGoogle("x", failing(new Error("maps-unavailable")))).rejects.toThrow("maps-unavailable");
  });
});
