import type { OfferType } from "@lynia/shared";

/**
 * Pure decision helpers for the new customer/rider journey flows — extracted from the screens so the
 * rules (which carry real product semantics) are unit-testable without rendering.
 */

/**
 * F-07 counter-offer: a `counter` bid strictly ABOVE the customer's ask surfaces as an Accept/Decline
 * card. Decline is client-side dismissal only (`declined = true`) — the bid stays live server-side, so
 * once declined it stops being a "pending counter" and reverts to a normal choosable offer. An
 * `accept`-type bid, or a counter at/below the ask, is never a pending counter.
 */
export function isPendingCounter(type: OfferType, offeredFare: number, ask: number, declined: boolean): boolean {
  return type === "counter" && offeredFare > ask && !declined;
}

/**
 * Pickup item verification: the collect CTA counts PIECES across the ticked line-items, not rows —
 * a 1× + 2× selection reads "Confirm 3 items collected". Unticked rows contribute nothing.
 */
export function collectedItemCount(items: readonly { quantity: number }[], checked: ReadonlySet<number>): number {
  return items.reduce((sum, it, i) => (checked.has(i) ? sum + it.quantity : sum), 0);
}

/**
 * Customer-auction honesty: while the order is still open for offers with zero offers to show, the
 * calm "finding riders / hang tight" working state is only truthful when the offers fetch actually
 * succeeded. If the offers query is in an ERROR state with nothing to show, surface an honest
 * error+retry instead of pretending we're still looking. A WS-streamed or cached bid makes
 * `offerCount > 0`, so this never fires while there are offers on screen; and once the order leaves
 * `open_for_offers` (e.g. an optimistic select flips it to `assigned`) the whole auction block is
 * gone, so this can't disrupt that path either.
 */
export function shouldShowOffersError(isError: boolean, offerCount: number, isOpenForOffers: boolean): boolean {
  return isError && offerCount === 0 && isOpenForOffers;
}

/**
 * "No riders online" supply state (2·b1): the auction is open, no bid has landed, AND the server told
 * us there were zero online riders within the broadcast radius. This is a NON-terminal, honest empty —
 * "nobody nearby to ping right now", distinct from the calm "riders were pinged, hang tight" wait.
 *
 * Deliberately conservative: `ridersNearby == null` ("supply unknown", e.g. a geo blip) and any count
 * > 0 both keep the calm "finding riders" state, and any landing bid (`bidCount > 0` via WS/poll)
 * immediately overrides it — the auction keeps running and the 15s snapshot poll self-heals the count
 * the moment a rider comes online.
 */
export function noRidersOnline(
  ridersNearby: number | null | undefined,
  bidCount: number,
  isOpenForOffers: boolean,
): boolean {
  return isOpenForOffers && bidCount === 0 && ridersNearby === 0;
}

/**
 * Rider cold-start honesty: an active-job fetch that fails with NO data must not fall through to the
 * "No active job" empty state — that tells the rider they have no work when the fetch merely failed.
 * Only an error with no data (a cold start) is an honest error; a warm refetch that retains the job
 * keeps `hasData` true and flows to the normal job UI, and a successful empty fetch is the genuine
 * no-job state.
 */
export function shouldShowJobError(isError: boolean, hasData: boolean): boolean {
  return isError && !hasData;
}
