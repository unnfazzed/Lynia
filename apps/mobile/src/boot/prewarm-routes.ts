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
 * Warm `routes` from this screen's idle time, ONE PER INTERACTION SLOT.
 *
 * The sequencing matters: evaluating 44 modules is not free, and doing several graphs inside a single
 * `runAfterInteractions` callback would hand the JS thread one long block — the exact stall this
 * program exists to remove, just moved from the tap to the scroll. Chaining one route per slot lets
 * anything the user actually does interleave between them.
 *
 * `routes` is read from a ref-free closure on purpose: callers pass a literal array, and re-warming
 * is a no-op anyway, so the effect deliberately does not depend on the array's identity.
 */
export function usePrewarmRoutes(routes: readonly PrewarmRoute[]): void {
  const key = routes.join(",");
  useEffect(() => {
    let cancelled = false;
    let handle: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
    const pending = routes.filter((r) => !warmed.has(r));

    const step = (i: number): void => {
      if (cancelled || i >= pending.length) return;
      handle = InteractionManager.runAfterInteractions(() => {
        // Re-check on the way IN, not only when scheduling: cancelling a handle is best-effort and
        // an unmount can land after the callback is already queued to run. Without this a screen the
        // user has left carries on evaluating route graphs it no longer has any reason to want.
        if (cancelled) return;
        prewarmRoute(pending[i] as PrewarmRoute);
        step(i + 1);
      });
    };
    step(0);

    return () => {
      cancelled = true;
      handle?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the stable identity of `routes`.
  }, [key]);
}
