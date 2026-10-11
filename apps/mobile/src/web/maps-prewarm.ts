import { InteractionManager } from "react-native";
import { isCustomerWebBuild } from "../web-build";

/** What the customer web build's `react-native-maps` shim (metro-shims/react-native-maps-web.js) adds. */
interface WebMapsShim {
  loadGoogle?: () => Promise<unknown>;
}

/**
 * P21 + P33 — on app.lyniago.com, fetch the Google Maps JS API during idle after Home's first paint.
 *
 * The web shim loaded the script only from a MapView's mount effect (and from the first reverse
 * geocode), so the first Send or order-screen open in a session started DNS + TLS to two Google origins,
 * the bootstrap script and its modules at the tap, and the map sat grey for seconds on 3G. The Android
 * twin of this is Home's MapsSdkPrewarm (a 1×1 native map); the web needs no map at all — `loadGoogle`
 * only injects the script, once per page (it is memoised, so a later map or geocode joins the same load).
 *
 * Scheduled behind the first interactions so it never competes with Home's own first paint, and a no-op
 * outside the customer web build (phones, the parity lane). Best-effort: a missing key or a refused
 * script leaves every map on its existing grey-panel fallback. Returns the cancel for an unmount.
 */
export function prewarmGoogleMapsOnWeb(): () => void {
  if (!isCustomerWebBuild()) return () => undefined;
  const handle = InteractionManager.runAfterInteractions(() => {
    try {
      // Lazy, so the shim stays off the launch graph; resolved to the web shim by metro-shims/web-runtime.js.
      const shim = require("react-native-maps") as WebMapsShim;
      void shim.loadGoogle?.().catch(() => undefined);
    } catch {
      /* best-effort — the first map loads the script itself, as before */
    }
  });
  return () => handle.cancel();
}
