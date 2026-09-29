import { describe, expect, it } from "vitest";
import { isShortMapLink, parseMapLocation } from "./map-links";
import { BUSINESS_BOOKING_ACCOUNT_PREFIX, businessBookingAccountPhone, isBusinessBookingAccountPhone, normalizePhone } from "./phone";

describe("parseMapLocation (merchant web upgrade L2: the buyer's drop-off)", () => {
  it("reads plain coordinates", () => {
    expect(parseMapLocation("-17.8292, 31.0522")).toEqual({ lat: -17.8292, lng: 31.0522 });
    expect(parseMapLocation(" -17.8292,31.0522 ")).toEqual({ lat: -17.8292, lng: 31.0522 });
  });

  it("reads a geo: URI", () => {
    expect(parseMapLocation("geo:-17.83,31.05?z=17")).toEqual({ lat: -17.83, lng: 31.05 });
  });

  it("reads the link WhatsApp shares a location as", () => {
    expect(parseMapLocation("https://maps.google.com/maps?q=-17.8613%2C31.0362&z=17&hl=en")).toEqual({ lat: -17.8613, lng: 31.0362 });
  });

  it("prefers a place's own coordinates over the map's centre", () => {
    const url = "https://www.google.com/maps/place/Mbare+Musika/@-17.8600,31.0300,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-17.8613!4d31.0362";
    expect(parseMapLocation(url)).toEqual({ lat: -17.8613, lng: 31.0362 });
  });

  it("falls back to the map's centre, and reads search and query links", () => {
    expect(parseMapLocation("https://www.google.com/maps/@-17.8292,31.0522,15z")).toEqual({ lat: -17.8292, lng: 31.0522 });
    expect(parseMapLocation("https://www.google.com/maps/search/?api=1&query=-17.8292,31.0522")).toEqual({ lat: -17.8292, lng: 31.0522 });
    expect(parseMapLocation("https://www.google.com/maps/search/-17.8292,+31.0522?entry=tts")).toEqual({ lat: -17.8292, lng: 31.0522 });
    expect(parseMapLocation("https://www.google.co.zw/maps?ll=-17.8292,31.0522")).toEqual({ lat: -17.8292, lng: 31.0522 });
  });

  it("finds a link inside a longer message", () => {
    expect(parseMapLocation("I'm at the blue gate https://maps.google.com/?q=-17.83,31.05 thanks")).toEqual({ lat: -17.83, lng: 31.05 });
  });

  it("reads nothing from a place link without coordinates, a short link, another site or nonsense", () => {
    expect(parseMapLocation("https://www.google.com/maps/place/Mbare+Musika")).toBeNull();
    expect(parseMapLocation("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
    expect(parseMapLocation("https://example.com/?q=-17.83,31.05")).toBeNull();
    expect(parseMapLocation("near the market")).toBeNull();
    expect(parseMapLocation("")).toBeNull();
  });

  it("refuses out-of-range and null-island coordinates", () => {
    expect(parseMapLocation("-97.1, 31.05")).toBeNull();
    expect(parseMapLocation("-17.8, 191.0")).toBeNull();
    expect(parseMapLocation("0,0")).toBeNull();
  });
});

describe("isShortMapLink — the only links the API will follow (OV-6, T15)", () => {
  it("accepts https maps.app.goo.gl and goo.gl/maps", () => {
    expect(isShortMapLink("https://maps.app.goo.gl/AbCdEf123")).toBe(true);
    expect(isShortMapLink("https://goo.gl/maps/AbCdEf123")).toBe(true);
  });

  it("refuses http, other goo.gl paths, look-alike hosts and non-links", () => {
    expect(isShortMapLink("http://maps.app.goo.gl/AbCdEf123")).toBe(false);
    expect(isShortMapLink("https://goo.gl/AbCdEf123")).toBe(false);
    expect(isShortMapLink("https://maps.app.goo.gl.evil.example/AbC")).toBe(false);
    expect(isShortMapLink("https://evil.example/maps.app.goo.gl")).toBe(false);
    expect(isShortMapLink("not a link")).toBe(false);
  });
});

describe("booking-account phones (merchant web upgrade L2, D9)", () => {
  it("names the convention and recognises it", () => {
    const phone = businessBookingAccountPhone("5f0c2b1e-0000-4000-8000-000000000001");
    expect(phone).toBe(`${BUSINESS_BOOKING_ACCOUNT_PREFIX}5f0c2b1e-0000-4000-8000-000000000001`);
    expect(isBusinessBookingAccountPhone(phone)).toBe(true);
    expect(isBusinessBookingAccountPhone("+263771234567")).toBe(false);
    expect(isBusinessBookingAccountPhone(null)).toBe(false);
  });

  it("is never what sign-in looks an account up by: normalised numbers always start with +", () => {
    for (const typed of ["0771234567", "+263771234567", "263771234567", "00263771234567"]) {
      expect(normalizePhone(typed)?.startsWith("+")).toBe(true);
    }
  });
});
