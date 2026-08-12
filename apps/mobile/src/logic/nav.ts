/**
 * Shared navigation helpers for the journey screens (parcel/food order trackers, composer).
 * Framework-free contracts so the stack-shaping decisions are unit-testable with plain spies.
 */

/** The root-stack subset of expo-router's `router` these helpers need. */
export interface RootNav {
  dismissAll: () => void;
  replace: (href: string) => void;
}

/**
 * P0/P2 (navigation review 2026-08-12): "Back home" from an order tracker.
 *
 * A bare `router.replace('/home')` only swaps the focused route, so the composer the customer came
 * through (`/send`, pushed just before the order screen) stayed on the stack beneath home — one back
 * press later they were staring at a fully-armed compose form that could open a SECOND auction.
 * dismissAll first drops everything stacked above the tab shell (the stale composer AND the order
 * screen), then replace selects home — so back from home exits the app, as a launcher screen should.
 * On a cold-start deep link (the order screen is the only route) dismissAll is a no-op and replace
 * still lands home.
 */
export function goHomeClearingStack(router: RootNav): void {
  router.dismissAll();
  router.replace("/home");
}
