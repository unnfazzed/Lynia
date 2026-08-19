import { homeAddressLabel, homeAreaLabel, isUsablePoint, parseStoredPlace } from "../home-location";

describe("homeAddressLabel — the header's one-line detected address", () => {
  it("prefers a street line, the way the mock draws it", () => {
    expect(homeAddressLabel({ streetNumber: "12", street: "Samora Machel Ave", city: "Harare" })).toBe("12 Samora Machel Ave");
  });

  it("reads Android's Geocoder shape, where the house number arrives as `name`", () => {
    expect(homeAddressLabel({ name: "12", street: "Samora Machel Ave", district: "Avenues" })).toBe("12 Samora Machel Ave");
    // A `name` that is a place, not a number, is the label on its own — not glued to the street.
    expect(homeAddressLabel({ name: "Eastgate Mall", street: "Robert Mugabe Rd" })).toBe("Eastgate Mall");
  });

  it("degrades district → city → subregion → region rather than rendering nothing", () => {
    expect(homeAddressLabel({ district: "Belgravia", city: "Harare" })).toBe("Belgravia");
    expect(homeAddressLabel({ city: "Harare" })).toBe("Harare");
    expect(homeAddressLabel({ region: "Harare Province" })).toBe("Harare Province");
  });

  it("returns an empty string when the geocoder has nothing — the caller shows the set-location prompt", () => {
    expect(homeAddressLabel({})).toBe("");
  });

  it("caps the label so it cannot wrap the header on a 320px entry phone", () => {
    const long = homeAddressLabel({ name: "A".repeat(120) });
    expect(long.length).toBe(48);
  });
});

describe("isUsablePoint", () => {
  it("accepts a real coordinate", () => {
    expect(isUsablePoint({ lat: -17.8292, lng: 31.0522 })).toBe(true);
  });

  it("rejects null, non-finite values and out-of-domain coordinates", () => {
    expect(isUsablePoint(null)).toBe(false);
    expect(isUsablePoint({ lat: Number.NaN, lng: 31 })).toBe(false);
    expect(isUsablePoint({ lat: 91, lng: 31 })).toBe(false);
    expect(isUsablePoint({ lat: -17, lng: 181 })).toBe(false);
  });

  it("rejects 0,0 — the geocoder's 'I found nothing but must return something'", () => {
    expect(isUsablePoint({ lat: 0, lng: 0 })).toBe(false);
  });
});

describe("parseStoredPlace — the persisted last-known address", () => {
  it("round-trips a stored place and its manual flag", () => {
    expect(parseStoredPlace(JSON.stringify({ label: "12 Samora Machel Ave", lat: -17.8, lng: 31.05, manual: true }))).toEqual({
      place: { label: "12 Samora Machel Ave", lat: -17.8, lng: 31.05 },
      manual: true,
    });
  });

  it("defaults `manual` to false — a stored GPS fix must not masquerade as the customer's choice", () => {
    expect(parseStoredPlace(JSON.stringify({ label: "Avondale", lat: -17.8, lng: 31.05 }))?.manual).toBe(false);
  });

  it("drops anything malformed rather than painting a half-parsed address", () => {
    expect(parseStoredPlace(null)).toBeNull();
    expect(parseStoredPlace("not json")).toBeNull();
    expect(parseStoredPlace(JSON.stringify({ lat: -17.8, lng: 31.05 }))).toBeNull();
    expect(parseStoredPlace(JSON.stringify({ label: "  ", lat: -17.8, lng: 31.05 }))).toBeNull();
    expect(parseStoredPlace(JSON.stringify({ label: "Nowhere", lat: 0, lng: 0 }))).toBeNull();
  });
});

/**
 * The suburb is a SECOND reading of the same reverse-geocode result, for prose that names an area
 * ("5 places deliver to Belgravia" — RC.list) rather than a delivery destination. It deliberately
 * does NOT share `homeAddressLabel`'s precedence: that one wants the finest line available, this one
 * wants the finest AREA, and falling back to "Harare" too eagerly reproduces exactly the imprecise
 * label the restaurant list used to hardcode.
 */
describe("homeAreaLabel — the suburb behind the address", () => {
  it("prefers the district over the city, even when a street line exists", () => {
    expect(homeAreaLabel({ streetNumber: "12", street: "Lanark Rd", district: "Belgravia", city: "Harare" })).toBe("Belgravia");
  });

  it("falls back through subregion → city → region rather than rendering nothing", () => {
    expect(homeAreaLabel({ subregion: "Avondale", city: "Harare" })).toBe("Avondale");
    expect(homeAreaLabel({ city: "Harare" })).toBe("Harare");
    expect(homeAreaLabel({ region: "Harare Province" })).toBe("Harare Province");
  });

  it("returns an empty string when nothing names an area — the summary then says 'here'", () => {
    expect(homeAreaLabel({})).toBe("");
    expect(homeAreaLabel({ street: "Lanark Rd" })).toBe("");
  });

  it("ignores whitespace-only parts instead of treating them as an answer", () => {
    expect(homeAreaLabel({ district: "   ", city: "Harare" })).toBe("Harare");
  });
});

describe("parseStoredPlace — the persisted suburb is additive", () => {
  it("round-trips an area when one was stored", () => {
    const raw = JSON.stringify({ label: "12 Lanark Rd", lat: -17.8, lng: 31.05, area: "Belgravia", manual: true });
    expect(parseStoredPlace(raw)).toEqual({ place: { label: "12 Lanark Rd", lat: -17.8, lng: 31.05, area: "Belgravia" }, manual: true });
  });

  it("still parses a slot written before the field existed — it simply has no suburb", () => {
    const raw = JSON.stringify({ label: "12 Lanark Rd", lat: -17.8, lng: 31.05, manual: false });
    const parsed = parseStoredPlace(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.place.area).toBeUndefined();
    expect(parsed!.place.label).toBe("12 Lanark Rd");
  });

  it("stores the TRIMMED value, not just a trimmed check — padding must not reach the header", () => {
    const raw = JSON.stringify({ label: "  12 Lanark Rd  ", lat: -17.8, lng: 31.05, area: "  Belgravia  " });
    const parsed = parseStoredPlace(raw)!;
    expect(parsed.place.area).toBe("Belgravia");
    expect(parsed.place.label).toBe("12 Lanark Rd");
  });

  it("drops a non-string or empty area rather than carrying junk into the header", () => {
    const raw = JSON.stringify({ label: "12 Lanark Rd", lat: -17.8, lng: 31.05, area: 42 });
    expect(parseStoredPlace(raw)!.place.area).toBeUndefined();
    const blank = JSON.stringify({ label: "12 Lanark Rd", lat: -17.8, lng: 31.05, area: "  " });
    expect(parseStoredPlace(blank)!.place.area).toBeUndefined();
  });
});
