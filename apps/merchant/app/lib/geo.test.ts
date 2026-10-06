import { SERVICE_CORRIDOR } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { insideServiceArea, STATIC_MAP_MAX, staticMapUrl } from "./geo";

const HARARE_CBD = { lat: SERVICE_CORRIDOR.centerLat, lng: SERVICE_CORRIDOR.centerLng };

describe("staticMapUrl — the tracking band's Google Static Maps image (D-80)", () => {
  it("centres a 2× image of the band's size on the point, with the key and no marker", () => {
    const url = new URL(staticMapUrl({ lat: -17.8292, lng: 31.0522 }, 360, 250, "k-123"));
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/staticmap");
    expect(url.searchParams.get("center")).toBe("-17.8292,31.0522");
    expect(url.searchParams.get("zoom")).toBe("15");
    expect(url.searchParams.get("size")).toBe("360x250");
    expect(url.searchParams.get("scale")).toBe("2");
    expect(url.searchParams.get("key")).toBe("k-123");
    expect(url.searchParams.has("markers")).toBe(false);
  });

  it("holds each side to the API's 1..640 range and whole pixels", () => {
    const size = (w: number, h: number) => new URL(staticMapUrl(HARARE_CBD, w, h, "k")).searchParams.get("size");
    expect(size(1024, 250)).toBe(`${STATIC_MAP_MAX}x250`);
    expect(size(359.6, 0)).toBe("360x1");
  });
});

describe("insideServiceArea — the same service area POST /merchant/become checks", () => {
  it("accepts the satellite towns (Norton, Chitungwiza, Goromonzi)", () => {
    expect(insideServiceArea({ lat: -17.8833, lng: 30.7 })).toBe(true);
    expect(insideServiceArea({ lat: -18.0127, lng: 31.0756 })).toBe(true);
    expect(insideServiceArea({ lat: -17.87, lng: 31.37 })).toBe(true);
  });

  it("accepts Harare CBD and a pin in Mbare", () => {
    expect(insideServiceArea(HARARE_CBD)).toBe(true);
    expect(insideServiceArea({ lat: -17.861, lng: 31.036 })).toBe(true);
  });

  it("refuses Bulawayo", () => {
    expect(insideServiceArea({ lat: -20.15, lng: 28.58 })).toBe(false);
  });
});
