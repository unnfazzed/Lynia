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
