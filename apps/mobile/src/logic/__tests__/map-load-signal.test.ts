/**
 * Which react-native-maps event is allowed to gate "the map didn't load", per platform.
 *
 * This is a two-line function with an outsized blast radius: `ComposeMap` waits for the signal and
 * gives up on a 9s timer, so naming an event the platform never emits does not make the check weaker —
 * it makes it fire every time. That is precisely what happened on iOS, and it reached Sentry as
 * `compose-map-not-loaded (onMapReady=true)`, mixed in with the real Android key rejection.
 *
 * The upstream contract these assertions encode (react-native-maps 1.18.4, `lib/MapView.d.ts`):
 *
 *   onMapLoaded — "@platform iOS: Google Maps only" / "@platform Android: Supported"
 *   onMapReady  — "@platform iOS: Supported"        / "@platform Android: Supported"
 */
import { mapLoadSignal } from "../map-load-signal";

describe("mapLoadSignal", () => {
  it("requires rendered TILES on Android, the only signal that outlives a rejected API key", () => {
    // The Maps SDK fires `onMapReady` as soon as it holds a `GoogleMap` object — including right after
    // refusing the key — so on Android only `onMapLoaded` can tell a working map from an auth failure.
    expect(mapLoadSignal("android")).toBe("onMapLoaded");
  });

  it("falls back to onMapReady on iOS, where onMapLoaded is Google-provider-only and never arrives", () => {
    // This app passes no `provider` and configures no `ios.config.googleMapsApiKey`, so iOS renders an
    // Apple MKMapView. Requiring `onMapLoaded` there condemned every working map after 9 seconds.
    expect(mapLoadSignal("ios")).toBe("onMapReady");
  });

  it("treats any other platform like iOS rather than condemning it by default", () => {
    // web/windows/macos: a false "the map didn't load" over a working map is a worse failure than a
    // missed detection, because the card replaces the pin hint and tells the customer to go elsewhere.
    expect(mapLoadSignal("web")).toBe("onMapReady");
  });
});
