import { describe, expect, it } from "vitest";
import { clampZoom, HARARE_CBD, insideServiceArea, MAX_ZOOM, MIN_ZOOM, panBy, project, TILE_SIZE, tileUrl, unproject, visibleTiles } from "./geo";

describe("Web Mercator (the sign-up map pin)", () => {
  it("puts (0, 0) in the middle of the world at every zoom", () => {
    for (const zoom of [0, 3, 16]) {
      const p = project({ lat: 0, lng: 0 }, zoom);
      expect(p.x).toBeCloseTo((TILE_SIZE * 2 ** zoom) / 2, 6);
      expect(p.y).toBeCloseTo((TILE_SIZE * 2 ** zoom) / 2, 6);
    }
  });

  it("round-trips a point through pixels and back", () => {
    const back = unproject(project(HARARE_CBD, 16), 16);
    expect(back.lat).toBeCloseTo(HARARE_CBD.lat, 5);
    expect(back.lng).toBeCloseTo(HARARE_CBD.lng, 5);
  });

  it("dragging the map right moves the pin's point west; dragging it down moves it north", () => {
    const right = panBy(HARARE_CBD, 100, 0, 16);
    expect(right.lng).toBeLessThan(HARARE_CBD.lng);
    expect(right.lat).toBeCloseTo(HARARE_CBD.lat, 6);
    const down = panBy(HARARE_CBD, 0, 100, 16);
    expect(down.lat).toBeGreaterThan(HARARE_CBD.lat);
  });

  it("covers the whole viewport with tiles, placed relative to its top-left corner", () => {
    const tiles = visibleTiles(HARARE_CBD, 16, 520, 260);
    const right = Math.max(...tiles.map((t) => t.left + TILE_SIZE));
    const bottom = Math.max(...tiles.map((t) => t.top + TILE_SIZE));
    expect(Math.min(...tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.min(...tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(520);
    expect(bottom).toBeGreaterThanOrEqual(260);
    expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
  });

  it("wraps tile columns across the antimeridian and never asks for a row off the world", () => {
    const tiles = visibleTiles({ lat: 0, lng: 179.99 }, 3, 800, 4000);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(8);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(8);
    }
  });

  it("builds OpenStreetMap tile URLs", () => {
    expect(tileUrl({ zoom: 16, x: 38420, y: 36480 })).toBe("https://tile.openstreetmap.org/16/38420/36480.png");
  });

  it("clamps zoom to the tile server's range", () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(40)).toBe(MAX_ZOOM);
    expect(clampZoom(15.6)).toBe(16);
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
