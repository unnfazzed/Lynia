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
  replaceClearingStack(router, "/home");
}

/** The root-stack subset {@link replaceClearingStack} needs; `H` is whatever href type `replace` takes. */
export interface ClearingNav<H> {
  dismissAll: () => void;
  replace: (href: H) => void;
  /** expo-router's `canDismiss`; when present and false there is nothing to pop, so dismissAll is skipped. */
  canDismiss?: () => boolean;
}

/**
 * Land on `href` with nothing left behind it — for every auth transition (start-up review 2026-10-06,
 * C-1 / C-2). A bare `replace` swaps only the top screen: after sign-in the history read `[phone, Home]`,
 * so Android Back on Home showed "What's your number?" to a signed-in user (and "Send code" there spent
 * another paid OTP); after sign-out it read `[Home, phone]`, so Back reached a signed-out Home. dismissAll
 * pops the root stack to its first screen, then replace swaps that one out, so Back from `href` leaves the
 * app. Skipped when there is nothing to pop (a cold start straight onto this screen).
 */
export function replaceClearingStack<H>(router: ClearingNav<H>, href: H): void {
  if (router.canDismiss?.() !== false) router.dismissAll();
  router.replace(href);
}
