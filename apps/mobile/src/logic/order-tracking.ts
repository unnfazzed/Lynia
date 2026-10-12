// Pure cache-slicing selectors for the customer order screen's re-render split — no React,
// unit-testable in isolation (mirrors order-labels.ts).
//
// PERF: during an active delivery every WS "position" push rewrites the order snapshot in the React
// Query cache (rider.currentLat/currentLng/updatedAt, ~every 10s for the whole trip). The order screen
// is a ~900-line component sitting next to a live map — re-rendering all of it per GPS tick is exactly
// the kind of work a low-end Android can't hide. The split: the SCREEN subscribes through
// `selectOrderShell` (telemetry stripped, so a GPS-only cache write leaves its selected data deep-equal
// and — via React Query's structural sharing — referentially identical, meaning no re-render), while
// the map leaf (`LiveOrderMap` / `MerchantLiveMap`) subscribes through `selectRiderTelemetry` (the
// per-tick slice) and is the ONLY thing that re-renders on a position push. What the screen itself
// draws from the position (stage, ETA minutes, "last seen") reaches it as a display-granularity glance
// (`selectParcelGlance`, P42), so a fix that changes none of that leaves the screen still.
import { DELIVERY_OTP_MAX_ATTEMPTS } from "@lynia/shared";
import type { OrderSnapshot } from "../api/orders";
import { liveEta } from "./eta";
import { isLiveStage, minutesSince, resolveStage, type StageInput, type StageResult } from "./order-stage";

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
 * P42 (customer review 2026-10-07): what the parcel order SCREEN draws from the rider's position, at
 * display granularity and as primitives — the stage (a fix within ~150 m of the drop is the hand-off), the
 * GPS-paused / no-fix flags, the ETA minutes and the "Last seen N min" minutes. A position push that
 * changes none of these selects to a deep-equal glance, so structural sharing keeps the screen still; only
 * the map leaf (through `selectRiderTelemetry`) moves per fix. The screen's own inputs (`ctx`) are closed
 * over by the select, so a change in them re-runs it.
 */
export interface ParcelGlance extends StageResult {
  /** A live fix is on the order. */
  hasFix: boolean;
  /** Live-stage ETA in minutes from the fix, else null. */
  etaMinutes: number | null;
  /** Whole minutes since the last fix (≥ 1) — the "Last seen" pin. */
  lastSeenMin: number;
  /** The last fix's time, floored to the minute (ISO) — the offline banner's "as of HH:MM". */
  fixAtMinute: string | null;
}

export function selectParcelGlance(o: OrderSnapshot, ctx: Pick<StageInput, "offerCount" | "online" | "nowMs" | "reopened">): ParcelGlance {
  const t = selectRiderTelemetry(o);
  const rider = t.lat != null && t.lng != null ? { lat: t.lat, lng: t.lng } : null;
  const r = resolveStage({
    status: o.status,
    offerCount: ctx.offerCount,
    ridersNearby: o.ridersNearby,
    cancelledBy: o.cancelledBy,
    events: o.events ?? [],
    rider: rider ? { ...rider, at: t.updatedAt } : null,
    dropoff: o.dropoff.point,
    online: ctx.online,
    nowMs: ctx.nowMs,
    reopened: ctx.reopened,
  });
  const eta = isLiveStage(r.stage) ? liveEta({ status: o.status, rider, pickup: o.pickup.point, dropoff: o.dropoff.point }) : null;
  const at = t.updatedAt ? Date.parse(t.updatedAt) : NaN;
  return {
    ...r,
    hasFix: rider != null,
    etaMinutes: eta?.minutes ?? null,
    lastSeenMin: minutesSince(t.updatedAt, ctx.nowMs),
    fixAtMinute: Number.isFinite(at) ? new Date(Math.floor(at / 60_000) * 60_000).toISOString() : null,
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
 * A stale local code is the danger: with a non-null local code nothing re-fetches it and the customer
 * confidently relays a DEAD code, burning the rider's attempts. Since D2 (owner 2026-10-07) the server can
 * show the current code again (`revealDeliveryCode`, idempotent), so "invalidate" just drops the local copy
 * and the screen re-reads the live one — it never has to mint a new code to recover.
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
 * U04 / D2 (owner 2026-10-07): the code card's lockout re-issue. The server locks a delivery code after
 * DELIVERY_OTP_MAX_ATTEMPTS wrong tries and tells the rider to ask the sender for a new one; the sender's
 * screen re-issues it (the explicit rotate: a new code, tries reset) ONCE per locked code. The lock is keyed
 * by the code's issue stamp (`codeRotatedAt`), so a code locked again after a re-issue is re-issued again,
 * while repeated snapshots of the SAME lock never rotate twice.
 *
 *   - "reissue": this locked code hasn't been re-issued from here yet → rotate, remember `key`.
 *   - "none":    not locked (or no attempt count yet), or already re-issued for this lock.
 */
export function deliveryCodeLockout(input: {
  attempts: number | null | undefined;
  codeRotatedAt: string | null | undefined;
  reissuedFor: string | null;
}): { action: "reissue"; key: string } | { action: "none" } {
  if (input.attempts == null || input.attempts < DELIVERY_OTP_MAX_ATTEMPTS) return { action: "none" };
  const key = input.codeRotatedAt ?? "unstamped";
  return input.reissuedFor === key ? { action: "none" } : { action: "reissue", key };
}

/**
 * D-97 (customer brief 08): the code card's state. `limit` once the server refused another re-issue
 * (2.14d); `ok` with a live code; `failed` when the automatic new-code fetch failed, or the code is locked
 * and there's no data to replace it (2.14c); else `fetching` (2.14). A locked code not yet replaced from
 * this phone (`lockPending`) is dead, so it never counts as a live code.
 */
export function codeCardStatus(i: { hasCode: boolean; lockPending: boolean; limit: boolean; newCodeFailed: boolean; online: boolean }): "ok" | "fetching" | "failed" | "limit" {
  if (i.limit) return "limit";
  if (i.hasCode && !i.lockPending) return "ok";
  if (i.newCodeFailed || (i.lockPending && !i.online)) return "failed";
  return "fetching";
}

/** D-97 (18f): the server sends the rider's number for a day after a cancel past pickup. */
export const LATE_CANCEL_REACH_MS = 24 * 60 * 60 * 1000;

/**
 * D-97 (customer brief 06): which "cancelled after pickup" sheet the customer sees, or null for the
 * existing cancelled sheets (18a before pickup, 18c a LyniaGo cancel, any rider viewer).
 *   - "hidden"  (18f): a day after the cancel — or no cancel time and no number — the number's gone.
 *   - "reach"   (18d / 18b): the rider's number came through.
 *   - "pending" (18e): not yet.
 */
export function lateCancelVariant(i: {
  status: string;
  riderViewer: boolean;
  pickedUpAt: string | null;
  cancelledBy: string | null | undefined;
  cancelledAt: string | null;
  phone: string | null | undefined;
  nowMs: number;
}): "reach" | "pending" | "hidden" | null {
  if (i.status !== "cancelled" || i.riderViewer || i.pickedUpAt == null) return null;
  if (i.cancelledBy !== "customer" && i.cancelledBy !== "rider") return null;
  const at = i.cancelledAt ? Date.parse(i.cancelledAt) : NaN;
  const expired = Number.isFinite(at) ? i.nowMs - at > LATE_CANCEL_REACH_MS : !i.phone;
  if (expired) return "hidden";
  return i.phone ? "reach" : "pending";
}

/**
 * BH-06: decide what to do with a durable "rating still pending for order X" marker (a star tap
 * armed the rating-on-tap undo window, then the app was killed before the timer flushed it) against the
 * current order snapshot. Mirrors reconcileConfirmItemsPending's shape. `rateOrder` moves the order to
 * `status: "completed"` — the live OrderSnapshot carries no separate rating field, so that transition
 * is itself the "already rated" signal (also true if a concurrent session rated it first).
 *
 *   - "retry": the marker matches the live order and it's still `delivered` (ratable, no rating landed yet).
 *   - "clear": the order already moved to `completed`.
 *   - "wait":  no marker, no snapshot yet, a DIFFERENT order is on screen, or the same order sits at
 *              neither `delivered` nor `completed` (shouldn't normally happen — a rating only arms once
 *              delivered) — keep the marker, do nothing.
 *
 * BH-19: a mismatched `order.id` used to return "clear", but `/order/:id` is a generic route reachable
 * for ANY of the customer's past orders (Trip History, Earnings, Notifications all link into it) — unlike
 * `rider/job.tsx`, which is only ever mounted for the rider's single current active job. Wiping the marker
 * just because a DIFFERENT order happened to be on screen silently dropped an app-killed rating tap with
 * no retry, the exact class `reconcilePendingSenderRating` already handles correctly by leaving a
 * mismatched marker in place ("wait") instead of clearing it.
 */
export function reconcilePendingRating(input: {
  pending: { orderId: string; score: number } | null | undefined;
  order: { id: string; status: string } | null;
}): "retry" | "clear" | "wait" {
  const { pending, order } = input;
  if (!pending) return "wait";
  if (!order) return "wait";
  if (order.id !== pending.orderId) return "wait";
  if (order.status === "completed") return "clear";
  if (order.status === "delivered") return "retry";
  return "wait";
}

/**
 * LC-C08: decide whether a `selectOffer` 409 actually means the customer's OWN pick landed — a
 * lost-response retry (the request succeeded server-side but the client never saw the 200, e.g. a
 * timeout on a slow reconnect) can hit the exact same `open_for_offers`/`pending`-offer CAS guard a
 * genuine race-loss (a DIFFERENT rider's offer won first) does, and the two are indistinguishable from
 * the bare error alone. Mirrors `advanceReconciled`/`deliverM`'s 409-reconciliation shape: a fresh
 * `getOrder()` after the 409 settles it — if the order is no longer open AND is now attached to the SAME
 * rider whose offer was tapped, this attempt's selection landed; anything else (still open, or assigned
 * to a different rider) is a genuine conflict. `selectedRiderId` is null when the tapped offer can't be
 * resolved locally (e.g. the offers list was already cleared) — always unreconciled in that case, the
 * same "show the notice" behavior as before this fix, since there's nothing to compare against.
 */
export function selectOfferReconciled(input: {
  freshStatus: string;
  freshRiderId: string | null | undefined;
  selectedRiderId: string | null | undefined;
}): boolean {
  const { freshStatus, freshRiderId, selectedRiderId } = input;
  if (selectedRiderId == null) return false;
  if (freshStatus === "open_for_offers") return false;
  return freshRiderId === selectedRiderId;
}

/**
 * BH-10: should the "raise price & send again" / "send another request" CTA cancel the CURRENT order
 * before navigating to compose a fresh one? Every terminal status (expired/cancelled/undelivered) has
 * nothing left to cancel — the order already left the live auction. `open_for_offers` is the one status
 * where the CTA fires while the original is still live, biddable, and selectable: submitting the
 * prefilled form without cancelling first used to leave the customer with TWO simultaneously live orders
 * for the same parcel (risking two riders dispatched for one physical trip).
 */
export function shouldCancelBeforeRebroadcast(orderStatus: string): boolean {
  return orderStatus === "open_for_offers";
}

/**
 * A resend refused because this trip already has a rider (API 409 `trip_in_progress`, DRS-02) carries the
 * live order's id: the screen opens it instead of offering a "Try again" that can never succeed. Null for
 * any other failure (those keep the toast).
 */
export function liveOrderFromResendError(e: unknown): string | null {
  // Read as fields (ApiError's shape) so this module stays free of the network client.
  const err = e as { status?: unknown; code?: unknown; body?: unknown } | null;
  if (!err || err.status !== 409 || err.code !== "trip_in_progress") return null;
  const id = (err.body as { orderId?: unknown } | null)?.orderId;
  return typeof id === "string" && id.length > 0 ? id : null;
}
