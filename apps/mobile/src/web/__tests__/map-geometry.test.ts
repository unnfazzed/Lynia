import { anchorOffset, dashSpec, MAX_ZOOM, MIN_ZOOM, regionFromBounds, toGoogleColour, zoomForRegion } from "../map-geometry";

const HARARE = { latitude: -17.8292, longitude: 31.0522 };

describe("zoomForRegion — react-native-maps regions as Google zoom levels", () => {
  it("halving the span zooms in one level", () => {
    const wide = zoomForRegion({ ...HARARE, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 360, 720);
    const close = zoomForRegion({ ...HARARE, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 360, 720);
    expect(close - wide).toBeCloseTo(1, 5);
  });

  it("frames a neighbourhood around street level on a phone", () => {
    const z = zoomForRegion({ ...HARARE, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 360, 720);
    expect(z).toBeGreaterThan(14);
    expect(z).toBeLessThan(16);
  });

  it("stays inside Google's range and survives an unmeasured map", () => {
    expect(zoomForRegion({ ...HARARE, latitudeDelta: 0, longitudeDelta: 0 }, 0, 0)).toBe(MAX_ZOOM);
    expect(zoomForRegion({ ...HARARE, latitudeDelta: 170, longitudeDelta: 360 }, 360, 720)).toBe(MIN_ZOOM);
  });
});

describe("regionFromBounds", () => {
  it("is the centre and spans of the visible box", () => {
    expect(regionFromBounds({ latitude: -17.9, longitude: 31.0 }, { latitude: -17.8, longitude: 31.1 })).toEqual({
      latitude: -17.85,
      longitude: 31.05,
      latitudeDelta: expect.closeTo(0.1, 10) as unknown as number,
      longitudeDelta: expect.closeTo(0.1, 10) as unknown as number,
    });
  });
});

describe("toGoogleColour — RN colours as Google's hex + opacity", () => {
  it("reads hex, short hex, hex with alpha, rgb and rgba", () => {
    expect(toGoogleColour("#00B14F")).toEqual({ color: "#00B14F", opacity: 1 });
    expect(toGoogleColour("#0a0")).toEqual({ color: "#00aa00", opacity: 1 });
    expect(toGoogleColour("#00B14F80")).toEqual({ color: "#00B14F", opacity: 0.5 });
    expect(toGoogleColour("rgb(0, 177, 79)")).toEqual({ color: "#00b14f", opacity: 1 });
    expect(toGoogleColour("rgba(0,177,79,0.12)")).toEqual({ color: "#00b14f", opacity: 0.12 });
  });

  it("falls back when there is no colour", () => {
    expect(toGoogleColour(undefined, "#123456")).toEqual({ color: "#123456", opacity: 1 });
  });
});

describe("dashSpec and anchorOffset", () => {
  it("turns [dash, gap] into a dash every dash+gap pixels", () => {
    expect(dashSpec([7, 7])).toEqual({ dashPx: 7, repeatPx: 14 });
    expect(dashSpec([1, 7])).toEqual({ dashPx: 1, repeatPx: 8 });
    expect(dashSpec(undefined)).toBeNull();
  });

  it("puts the anchor point of the marker on the coordinate", () => {
    expect(anchorOffset(100, 200, 40, 60, { x: 0.5, y: 1 })).toEqual({ left: 80, top: 140 });
    expect(anchorOffset(100, 200, 40, 60, { x: 0.5, y: 0.3 })).toEqual({ left: 80, top: 182 });
  });
});
