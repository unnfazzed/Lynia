import { Platform } from "react-native";

/**
 * Which react-native-maps event actually proves the map DREW — and why it is not the same event on
 * every platform.
 *
 * `ComposeMap` decides "the map didn't load" by waiting for a load event and giving up on a timer, so
 * picking an event the platform never emits does not degrade the check — it inverts it, and the screen
 * accuses a working map. That is the bug this module exists to prevent, and it was live:
 *
 *  - **Android — `onMapLoaded`.** Documented "Supported". It fires only once tiles have actually
 *    rendered, which is the whole point: the Maps SDK fires `onMapReady` as soon as it holds a
 *    `GoogleMap` object *including when it has just rejected the API key*, so `onMapReady` cannot tell
 *    a working map from an authorization failure. `onMapLoaded` can.
 *  - **iOS — `onMapReady`.** react-native-maps annotates `onMapLoaded` as **`@platform iOS: Google Maps
 *    only`**: it is bridged from the Google Maps iOS SDK, so it is emitted ONLY when the view is
 *    rendered with `PROVIDER_GOOGLE`. This app passes no `provider` to any `MapView` (and configures no
 *    `ios.config.googleMapsApiKey`), so every iOS map is an Apple `MKMapView` and `onMapLoaded` is never
 *    emitted at all. Keyed on it, the 9s timer therefore ALWAYS expired on iOS — putting "The map didn't
 *    load" over a perfectly good Apple map, suppressing the `mapLoaded`-gated "tap the map to drop your
 *    pin" hint, and reporting a `compose-map-not-loaded` event on every single session.
 *
 * `onMapReady` is annotated Supported on both platforms, so it is a safe iOS floor. It is strictly
 * weaker — it proves the view initialised, not that anything drew — but the failure it cannot catch is
 * an API-key rejection, and Apple Maps has no API key to reject. The signal is matched to the failure
 * mode that platform can actually have.
 *
 * Should iOS ever adopt `PROVIDER_GOOGLE`, the caller still honours a real `onMapLoaded` if one
 * arrives; this only decides which event is REQUIRED before the screen is allowed to call the map dead.
 */
export type MapLoadSignal = "onMapLoaded" | "onMapReady";

/**
 * The event that must arrive before the map may be considered loaded on this platform.
 *
 * @param os defaults to the running platform; injectable so the choice is unit-testable without
 *   mutating the frozen `Platform` module.
 */
export function mapLoadSignal(os: string = Platform.OS): MapLoadSignal {
  return os === "android" ? "onMapLoaded" : "onMapReady";
}
