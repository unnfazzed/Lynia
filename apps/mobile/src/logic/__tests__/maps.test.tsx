import { mapsDirectionsUrl, mapsPlaceUrl } from "../maps";

const pickup = { lat: -17.8292, lng: 31.0522 };
const dropoff = { lat: -17.8145, lng: 31.0611 };

describe("mapsDirectionsUrl (rider leg — turn-by-turn)", () => {
  it("builds a driving directions URL with origin + destination", () => {
    const url = mapsDirectionsUrl(pickup, dropoff);
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=-17.829200%2C31.052200&destination=-17.814500%2C31.061100&travelmode=driving",
    );
  });

  it("orders origin before destination (the leg is pickup → drop-off, not reversed)", () => {
    const url = mapsDirectionsUrl(pickup, dropoff);
    expect(url.indexOf("origin=-17.829200")).toBeLessThan(url.indexOf("destination=-17.814500"));
  });

  it("trims floating-point noise to a stable precision", () => {
    const url = mapsDirectionsUrl({ lat: -17.8292000001, lng: 31.0522 }, dropoff);
    expect(url).toContain("origin=-17.829200%2C31.052200");
  });
});

describe("mapsPlaceUrl (customer — open the drop-off pin)", () => {
  it("builds a search URL querying the exact coordinate", () => {
    expect(mapsPlaceUrl(dropoff)).toBe(
      "https://www.google.com/maps/search/?api=1&query=-17.814500%2C31.061100",
    );
  });

  it("carries no route params — it's a single pin, not directions", () => {
    const url = mapsPlaceUrl(dropoff);
    expect(url).not.toContain("origin=");
    expect(url).not.toContain("travelmode=");
  });
});
