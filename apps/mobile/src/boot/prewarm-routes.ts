import { useEffect } from "react";
import { InteractionManager } from "react-native";

/**
 * Route prewarm registry — the generalisation of PERF-SEND-01.
 *
 * THE MECHANISM (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §2.1). expo-router loads route
 * components lazily: `useScreens` passes `getComponent={() => getQualifiedRouteComponent(route)}`,
 * so a route's module graph is EVALUATED on the first navigation to it — synchronously, inside the
 * tap handler. That is why the first tap into a screen is the slow one and later taps to the same
 * screen are not, and it is measured per route in the RCA:
 *
 *     /food/order/[orderId]  44 new modules  + react-native-maps, socket.io-client, expo-clipboard
 *     /rider/food-job        39              + react-native-maps, socket.io-client
 *     /rider/job             36              + expo-image-picker, expo-image-manipulator, maps, socket
 *     /send                  32              + react-native-maps          ← the one already warmed
 *     /order/[id]            29              + react-native-maps, socket.io-client
 *     /food/checkout         19              + react-native-maps
 *
 * (counts are NEW local modules, with the 83-module boot graph subtracted; react-native-maps is a
 * further ~29 npm modules on its own.) Warming a route from the idle time of the screen that LINKS
 * to it moves that evaluation off the tap path entirely — the module cache makes every later mount a
 * hit, so this needs no "already warmed" bookkeeping beyond not re-scheduling the work.
 *
 * WHY LAZY `require` AND NOT A TOP-LEVEL IMPORT. Metro keeps the module in the same single bundle
 * either way; what changes is only WHEN it is evaluated. A top-level import here would drag every
 * one of these graphs into the LAUNCH graph and re-open MOB-BOOT-03 — the opposite of the fix. The
 * literal, statically-analysable `require` in each loader below is load-bearing for that reason:
 * Metro cannot resolve a computed specifier, so the paths must stay inline string literals.
 *
 * WHY SCOPED PER SCREEN, NOT WARMED ALL AT ONCE. Each graph costs memory for the whole process life,
 * and this app targets Go-class handsets. A screen warms only the routes it can actually reach — the
 * customer launcher never evaluates the rider job screens' image-picker graph, and vice versa.
 */

/** The routes worth warming. Anything outside this list is small enough that warming it would cost
 *  more launcher idle time than it saves on the tap (see the RCA's table — the tail is <13 modules). */
export type PrewarmRoute = "send" | "order" | "foodOrder" | "foodCheckout" | "riderJob" | "riderFoodJob";

/**
 * Route key → its module. Each `require` argument MUST stay an inline literal (see the header).
 * Best-effort by construction: a throw here must never take down the warming screen, and the route
 * still loads on tap exactly the way it always did.
 */
const LOADERS: Record<PrewarmRoute, () => unknown> = {
  send: () => require("../../app/send"),
  order: () => require("../../app/order/[id]"),
  foodOrder: () => require("../../app/food/order/[orderId]"),
  foodCheckout: () => require("../../app/food/checkout"),
  riderJob: () => require("../../app/rider/job"),
  riderFoodJob: () => require("../../app/rider/food-job"),
};

/** Routes already evaluated in this process. The module cache makes a second `require` cheap, but
 *  re-scheduling the interaction on every remount of a warming screen is pure churn. */
const warmed = new Set<PrewarmRoute>();

/** Test seam: forget what this process has warmed. */
export function __resetPrewarmedRoutes(): void {
  warmed.clear();
}

/** Which routes have been evaluated so far — asserted by the unit test. */
export function prewarmedRoutes(): PrewarmRoute[] {
  return [...warmed];
}

/**
 * Evaluate one route's module graph now. Returns true if it ran (or had already run), false if the
 * `require` threw. Exported for the unit test; screens use {@link usePrewarmRoutes}.
 */
export function prewarmRoute(route: PrewarmRoute): boolean {
  if (warmed.has(route)) return true;
  try {
    LOADERS[route]();
    warmed.add(route);
    return true;
  } catch {
    // The tap path re-requires it and surfaces any real failure there.
    return false;
  }
}

/**
 * Warm `routes` from this screen's idle time, ONE GRAPH PER TURN OF THE EVENT LOOP.
 *
 * THE YIELD IS THE WHOLE DESIGN, and it is not what a first reading of `runAfterInteractions`
 * suggests. That API does NOT hand out one slot per call: with no `setDeadline` configured (this app
 * sets none) it drains its entire task queue inside a single `setImmediate` batch. So a chain that
 * scheduled the next route from inside the previous route's callback would put every module graph in
 * ONE uninterrupted block — 36 + 39 modules back to back on the rider board — which is precisely the
 * long stall this program exists to remove, just relocated from the tap to the scroll.
 *
 * Hence the `setTimeout` before EACH route, including the first. Two things fall out of it:
 *
 *  - each graph gets its own turn, so a touch, a frame or a network callback can land in between;
 *  - nothing is warmed while the screen that mounted us is still committing its own first frame.
 *    Prewarming is idle work by definition; it must never compete with the paint it rides behind.
 *
 * Both handles are cancellable, and the callback re-checks `cancelled` on the way in — cancelling an
 * interaction handle is best-effort, and an unmount can land after the callback is already queued.
 *
 * `routes` is keyed by value, not identity: callers pass a literal array, and re-warming is a no-op
 * anyway, so the effect deliberately does not depend on the array's reference.
 */
export function usePrewarmRoutes(routes: readonly PrewarmRoute[]): void {
  const key = routes.join(",");
  useEffect(() => {
    let cancelled = false;
    let interaction: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending = routes.filter((r) => !warmed.has(r));

    const step = (i: number): void => {
      if (cancelled || i >= pending.length) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        interaction = InteractionManager.runAfterInteractions(() => {
          if (cancelled) return;
          prewarmRoute(pending[i] as PrewarmRoute);
          step(i + 1);
        });
      }, 0);
    };
    step(0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      interaction?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the stable identity of `routes`.
  }, [key]);
}
