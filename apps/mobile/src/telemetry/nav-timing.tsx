import { usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { InteractionManager } from "react-native";
import { enqueueNavOpen } from "./rum";
import { consumeTouch } from "./tap-signal";

/**
 * Tap → destination screen on glass (`nav_open`).
 *
 * WHY IT IS SHAPED THIS WAY. The number worth having is "I pressed a thing and the next screen took
 * N ms to appear" — the segment `docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md` §2.1 attributes
 * to a route's module graph being evaluated inside the tap handler. Timing that from the call sites
 * would mean editing all 111 `router.push` calls and keeping them edited forever. Instead this pairs
 * two things the app already has in exactly one place each: the LAST TOUCH (recorded by the one
 * tappable primitive, src/ui/Tappable.tsx) and the ROUTE CHANGE (expo-router's `usePathname`).
 *
 * `usePathname`, NOT `useSegments` — and that distinction is load-bearing. `useSegments` yields the
 * route PATTERN (`["order", "[id]"]`), so tapping from one order straight into another produces the
 * identical key and the effect never re-runs: every such navigation would be silently missing from
 * the histogram. The analytics ScreenTracker deliberately uses the pattern for the opposite reason
 * (keeping screen names low-cardinality and order ids off the wire); this needs resolved identity,
 * and it only ever compares the path locally — the pathname is never sent anywhere.
 *
 * The pairing is also the filter. A route change with no recent touch is a redirect, a deep link, a
 * push-notification hand-off or a socket-driven navigation — none of which a person is waiting on
 * after a press — and those never enter the histogram at all. The touch is CONSUMED on read, so one
 * press can only ever attribute to one navigation.
 *
 * LOWER BOUND, deliberately. The end mark comes from `runAfterInteractions`, not a layout effect:
 * a layout effect runs before the native frame is presented and would understate the gap. Paper (the
 * architecture this app builds against) exposes no compositor-presentation callback, so this remains
 * a lower bound on what the customer saw — never an overstatement. Same technique and same caveat as
 * `boot_home_paint`; read the two histograms the same way.
 */

/**
 * How stale a touch may be and still be credited with opening the screen. Beyond this the press and
 * the navigation are almost certainly unrelated (a press that opened a sheet, then a socket-driven
 * route change some seconds later), and crediting it would report a latency nobody experienced.
 */
export const NAV_TOUCH_MAX_AGE_MS = 10_000;

/** Mounted once at the app root. Renders nothing. */
export function NavOpenProbe(): null {
  const path = usePathname();
  const firstRun = useRef(true);

  useEffect(() => {
    // The cold-start route is owned by the boot marks (`boot_paint`/`boot_home`/`boot_home_paint`);
    // reporting it here as well would file a whole launch under a tap that never happened.
    if (firstRun.current) {
      firstRun.current = false;
      consumeTouch();
      return;
    }
    const startedAt = consumeTouch();
    if (startedAt == null) return;
    if (Date.now() - startedAt > NAV_TOUCH_MAX_AGE_MS) return;
    const handle = InteractionManager.runAfterInteractions(() => enqueueNavOpen(Date.now() - startedAt));
    return () => handle.cancel();
  }, [path]);

  return null;
}
