import { storeUrlFor } from "../config";

// The force-update "Update now" button opens this. A Google Play link on an iPhone is a dead end for
// the user, so iOS only ever gets the App Store listing — or nothing (the button hides) until one exists.
describe("storeUrlFor", () => {
  const urls = {
    appStore: "https://apps.apple.com/app/id1234567890",
    play: "https://play.google.com/store/apps/details?id=zw.co.lynia",
  };

  it("gives each platform its own listing", () => {
    expect(storeUrlFor("ios", urls)).toBe(urls.appStore);
    expect(storeUrlFor("android", urls)).toBe(urls.play);
  });

  it("never falls back to the Play listing on iOS", () => {
    expect(storeUrlFor("ios", { play: urls.play })).toBeNull();
  });

  it("is null on Android when no listing is configured", () => {
    expect(storeUrlFor("android", {})).toBeNull();
  });
});
