// RR.offer_expired — the food-dispatch offer timed out or was taken by another rider. The screen's
// source of truth is GET /merchant/orders/dispatch/offer; when it answers no live offer, food-offer.tsx
// renders its expired EmptyState (Card + "That one went to another rider" + "Back to the board" + the
// "first in line" reassurance line). restaurantsEnabled stays on (default route) so the screen renders
// its expired state, not the flag-off "Restaurants isn't available yet" branch.
import { installRouter, withQuery } from "./_harness.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 900;

// No live offer: an empty body resolves getFoodDispatchOffer to null, so `!offer` renders.
installRouter([{ match: "/merchant/orders/dispatch/offer", json: {} }]);

export default { wrap: withQuery() };
