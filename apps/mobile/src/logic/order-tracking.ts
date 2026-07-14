// Pure cache-slicing selectors for the customer order screen's re-render split — no React,
// unit-testable in isolation (mirrors order-labels.ts).
//
// PERF: during an active delivery every WS "position" push rewrites the order snapshot in the React
// Query cache (rider.currentLat/currentLng/updatedAt, ~every 10s for the whole trip). The order screen
// is a ~900-line component sitting next to a live map — re-rendering all of it per GPS tick is exactly
// the kind of work a low-end Android can't hide. The split: the SCREEN subscribes through
// `selectOrderShell` (telemetry stripped, so a GPS-only cache write leaves its selected data deep-equal
// and — via React Query's structural sharing — referentially identical, meaning no re-render), while
// the extracted LiveTrackingCard subscribes through `selectRiderTelemetry` (the per-tick slice) and is
// the ONLY thing that re-renders on a position push.
import type { OrderSnapshot } from "../api/orders";

/**
 * The screen's view of the snapshot: everything EXCEPT the per-tick rider telemetry, which is pinned
 * to null. Two GPS ticks therefore select to deep-equal shells; structural sharing hands the observer
 * back the previous reference and the tracked `data` prop never changes. Rider PRESENCE is preserved
 * (`rider` stays non-null with its profileId) — the shell must still answer "is a rider attached?"
 * without subscribing to where that rider is.
 */
export function selectOrderShell(o: OrderSnapshot): OrderSnapshot {
  if (o.rider == null) return o;
  return { ...o, rider: { ...o.rider, currentLat: null, currentLng: null, updatedAt: null } };
}

/** The complement of the shell: exactly the fields a "position" push rewrites, plus rider presence. */
export interface RiderTelemetry {
  /** Snapshot has a rider attached at all — drives the "on the move / waiting for GPS" hint's visibility. */
  hasRider: boolean;
  lat: number | null;
  lng: number | null;
  /** ISO of the last live fix — feeds the C4 staleness escalation (isRiderTrackingStale). */
  updatedAt: string | null;
}

/**
 * The tracking card's view: a flat telemetry slice. It changes on every GPS tick (that's the point —
 * the card is the one component that SHOULD re-render), and structural sharing keeps it referentially
 * stable across unrelated cache writes (status transitions, offer refetches) so the card doesn't churn
 * on those either.
 */
export function selectRiderTelemetry(o: OrderSnapshot): RiderTelemetry {
  return {
    hasRider: o.rider != null,
    lat: o.rider?.currentLat ?? null,
    lng: o.rider?.currentLng ?? null,
    updatedAt: o.rider?.updatedAt ?? null,
  };
}

/**
 * How the order screen should treat a failed `getOrder` fetch. A 404 is a genuinely gone order
 * ("not found"). A 403 (P2-2's party-only IDOR gate — `orders.service.ts`'s `ForbiddenException`,
 * e.g. a losing bidder tapping a stale "new broadcast" push, or a stale deep link on a
 * shared/switched-account device) is permanent too, but was previously bucketed with a plain
 * network error and given a "Retry" button that can never succeed — a dead-end retry loop rather
 * than an honest terminal state. Anything else is a transient error worth retrying.
 */
export function orderLoadErrorKind(status: number | undefined): "not_found" | "forbidden" | "transient" {
  if (status === 404) return "not_found";
  if (status === 403) return "forbidden";
  return "transient";
}

/**
 * Which copy the expired-auction terminal should show. The live `bidCount` (from the offers-list query)
 * is empty on a COLD read into an already-expired order — that query only fetches `pending` offers, which
 * no longer exist post-expiry — so a customer who watched riders bid, force-killed the app, and cold-started
 * back in would wrongly be told "no riders took this price". The server's `hadOffers` (a count of offer rows,
 * which survive expiry) recovers the truth on that cold path. Either signal ("riders bid" locally OR per the
 * server) wins, so the honest "you didn't pick in time" copy shows; only when NEITHER says riders bid do we
 * fall through to the no-supply / no-offers copies (which stay exactly as before for the live case).
 *   - "had-offers": riders did bid — the window closed before the customer picked.
 *   - "no-supply":  zero bids AND nobody online near the pickup — the price was never the problem.
 *   - "no-offers":  zero bids with supply present — nudging the price up usually helps.
 */
export function expiredTerminalKind(input: {
  bidCount: number;
  hadOffers: boolean | null | undefined;
  expiryNoSupply: boolean | null | undefined;
}): "had-offers" | "no-supply" | "no-offers" {
  if (input.bidCount > 0 || input.hadOffers === true) return "had-offers";
  if (input.expiryNoSupply === true) return "no-supply";
  return "no-offers";
}

/**
 * Reconcile a locally-stored delivery code against the server's `deliveryOtpAttempts` on each snapshot
 * refresh, to catch a code that was rotated (customer tapped "Re-issue delivery code" → server rotated the
 * hash and reset the attempt counter to 0) while the app was killed before the rotate response landed.
 *
 * The server never re-sends the plaintext code, so the client keeps the OLD value in secure storage; with a
 * non-null local code the re-issue UI never re-prompts and the customer confidently relays a DEAD code,
 * burning the rider's attempts.
 *
 * PRIMARY signal (KB-DELIVERY-CODE-ROTATION-SIGNAL): the snapshot's `codeRotatedAt` — an ISO timestamp the
 * server stamps on every code issue/rotate. It's always reliable: once we've confirmed a baseline value for
 * the code we hold, any change to a different value proves the code was rotated out from under us, EVEN if
 * the app was killed before the rotate response landed (the earlier baseline was recorded while holding the
 * old code, before the customer initiated the — then lost — re-issue). `null`/`undefined` = no signal (older
 * API, or a cached pre-field snapshot) → fall through to the heuristic below.
 *
 * FALLBACK / defense-in-depth: `deliveryOtpAttempts`, which is monotonic while a given code is current (0 at
 * issue, +1 per failed rider attempt) and resets to 0 ONLY on a rotation. Track the highest attempts value
 * seen while holding this code; a fresh snapshot whose count has DROPPED below that high-water mark reveals a
 * rotation too — but only if the client observed the elevated count before any kill, which is why the
 * timestamp signal above is preferred whenever it's present.
 *
 *   - "invalidate":        a rotation was detected — clear the stored code + companions.
 *   - "sync-rotation-ts":  first confirmed sighting of the rotation stamp for the held code — adopt it as the
 *                          baseline so a LATER change is detectable (never invalidates on this).
 *   - "advance-highwater": attempts climbed (a rider is failing against OUR code) — persist the new high-water.
 *   - "none":              nothing to do (no local code, no server signal yet, or steady state).
 */
export function reconcileDeliveryCode(input: {
  hasLocalCode: boolean;
  storedAttemptsHighWater: number | null | undefined;
  snapshotAttempts: number | null | undefined;
  storedCodeRotatedAt?: string | null | undefined;
  snapshotCodeRotatedAt?: string | null | undefined;
}):
  | { action: "invalidate" }
  | { action: "sync-rotation-ts"; codeRotatedAt: string }
  | { action: "advance-highwater"; attempts: number }
  | { action: "none" } {
  const { hasLocalCode, storedAttemptsHighWater, snapshotAttempts, storedCodeRotatedAt, snapshotCodeRotatedAt } = input;
  // No code to protect → never invalidate on missing data, stay backward-safe.
  if (!hasLocalCode) return { action: "none" };

  // PRIMARY: the explicit rotation timestamp. Present-and-different from our confirmed baseline ⇒ rotated.
  // Present-with-no-baseline ⇒ first sighting for the held code, adopt it (on a fresh issue the stored
  // baseline is deliberately cleared so we re-baseline here instead of false-positiving on our own new code).
  if (snapshotCodeRotatedAt != null) {
    if (storedCodeRotatedAt == null) return { action: "sync-rotation-ts", codeRotatedAt: snapshotCodeRotatedAt };
    if (snapshotCodeRotatedAt !== storedCodeRotatedAt) return { action: "invalidate" };
    // Equal → steady state on the timestamp; still let the attempts high-water advance below.
  }

  // FALLBACK: the attempts high-water heuristic. Skipped (⇒ "none") when either side is missing.
  if (snapshotAttempts == null || storedAttemptsHighWater == null) return { action: "none" };
  if (snapshotAttempts < storedAttemptsHighWater) return { action: "invalidate" };
  if (snapshotAttempts > storedAttemptsHighWater) return { action: "advance-highwater", attempts: snapshotAttempts };
  return { action: "none" };
}

/**
 * BH-06: decide what to do with a durable "rating still pending for order X" marker (a star tap
 * armed the rating-on-tap undo window, then the app was killed before the timer flushed it) against the
 * current order snapshot. Mirrors reconcileConfirmItemsPending's shape. `rateOrder` moves the order to
 * `status: "completed"` — the live OrderSnapshot carries no separate rating field, so that transition
 * is itself the "already rated" signal (also true if a concurrent session rated it first).
 *
 *   - "retry": the marker matches the live order and it's still `delivered` (ratable, no rating landed yet).
 *   - "clear": the order already moved to `completed`, OR a DIFFERENT order is now the live one — the
 *              marker is stale.
 *   - "wait":  no marker, no snapshot yet, or the same order sits at neither `delivered` nor `completed`
 *              (shouldn't normally happen — a rating only arms once delivered) — keep the marker, do nothing.
 */
export function reconcilePendingRating(input: {
  pending: { orderId: string; score: number } | null | undefined;
  order: { id: string; status: string } | null;
}): "retry" | "clear" | "wait" {
  const { pending, order } = input;
  if (!pending) return "wait";
  if (!order) return "wait";
  if (order.id !== pending.orderId) return "clear";
  if (order.status === "completed") return "clear";
  if (order.status === "delivered") return "retry";
  return "wait";
}
