import { BidExpiredEvent, BoardNewOrderEvent, FoodOfferEvent, OrderTakenEvent, WS_EVENTS } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { OpenOrder } from "../api/orders";
import { shouldNoticeTakenOrder } from "../logic/journey";
import { useAuth } from "../auth/auth-context";
import { clampGlassSample, enqueue, noteDropped, setActiveRole } from "../telemetry/rum";
import { acquireSocket, releaseSocket } from "./socket";
import { createSelfHealGate } from "./self-heal-gate";

// B-O12: mirrors the server's own `take: 50` cap on `listOpen`/`GET /orders/open`
// (orders.service.ts) — the 15s REST poll that would otherwise reset this cache to that capped
// snapshot is disabled the whole time the board socket stays connected, so `boardNewOrder`'s
// unbounded prepend was the one write path with nothing bounding it "by design" for a rider who
// stays online, connected, and un-refetched for a very long shift. Capping the prepend here keeps
// the client cache bounded the same way the server's own response already is, without needing a
// periodic resync.
const OPEN_ORDERS_CACHE_CAP = 50;

// B-O13: same shape as the `sentOffers` leak LC-B08 fixed — nothing ever removed an id from
// `expiredOrderIds`/`takenOrderIds` for the rider's whole online session. Every UI read of these
// Sets is scoped to a `sentOffers` card (already swept `SENT_OFFER_RETENTION_MS` after its auction
// closes, per rider-bid-draft.ts) or the transient `selected` compose card, so an id this old is
// never rendered again — but an order the rider never bid on never entered `sentOffers` at all, so
// that sweep can't reach its id here. Cap + FIFO-evict (Sets preserve insertion order) bounds this
// regardless of bid history, the same way `OPEN_ORDERS_CACHE_CAP` bounds the board list above.
const BOARD_RESOLVED_ID_CAP = 200;

function addBoundedId(prev: Set<string>, id: string, cap: number): Set<string> {
  if (prev.has(id)) return prev;
  const next = new Set(prev);
  next.add(id);
  if (next.size > cap) {
    next.delete(next.values().next().value as string);
  }
  return next;
}

/**
 * While the rider is online, hold a board socket so a newly-broadcast order appears the instant it
 * opens (WS push) instead of waiting on the poll. The pushed order is the redacted `BoardNewOrderEvent`
 * (point + landmark, no phone) and is merged straight into the ["openOrders"] cache — deduped by id —
 * so the list updates with no refetch. Joins the board on connect, leaves it on go-offline / unmount.
 * Returns connection state for the online chip.
 */
export function useRiderBoard(
  online: boolean,
  loc: { lat: number; lng: number } | null,
  bidIds?: Set<string>,
  // D5/C5: fires the moment a `food:offer` lands on this same board socket — the caller (the board
  // screen) navigates to the offer intake screen. No local offer state lives here: that screen's own
  // source of truth is the poll-fallback GET (dispatch/offer), so this is purely a "go look" signal,
  // mirroring how a `bid:expired`/`order:taken` push is a signal, not a value the caller trusts as-is.
  onFoodOffer?: (orderId: string) => void,
): { connected: boolean; expiredOrderIds: Set<string>; takenOrderIds: Set<string>; boardTakenNudge: number } {
  const { session } = useAuth();
  const token = session?.accessToken;
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  // Orders whose 90s auction closed with NObody picked (INTERFACE-AUDIT C2) — pushed to every bidder.
  // The rider screen uses this to show a distinct "that window closed" state on a sent offer (vs.
  // "not chosen", which means someone else was picked).
  const [expiredOrderIds, setExpiredOrderIds] = useState<Set<string>>(() => new Set());
  // Orders a customer assigned to SOMEONE (rider-journey 2·b1 / 3·b1) — the card leaves the board;
  // a rider who bid on one shows the "not chosen" state (distinct from `expiredOrderIds` above).
  const [takenOrderIds, setTakenOrderIds] = useState<Set<string>>(() => new Set());
  // 2·b1: a monotonic nudge that ticks each time an UN-BID order the rider had on their board is taken
  // by someone else. Drives a single, self-clearing "a nearby order was just taken" board notice — one
  // line no matter how many go at once (the timer just resets), so a busy board never spams. Orders the
  // rider DID bid on are excluded here: their sent-offer card already shows the "not chosen" state.
  const [boardTakenNudge, setBoardTakenNudge] = useState(0);
  // Hold the live socket + latest loc in refs so the loc-change effect can re-subscribe (re-scope the
  // geo rooms) without tearing down and rebuilding the connection.
  const socketRef = useRef<Socket | null>(null);
  const locRef = useRef(loc);
  locRef.current = loc;
  // The rider's own bid ids in a ref, so the taken-order handler can tell "a bid I lost" (card shows
  // 'not chosen') from "an order I never bid on" (the board notice) without re-running the socket effect.
  const bidIdsRef = useRef(bidIds);
  bidIdsRef.current = bidIds;
  const onFoodOfferRef = useRef(onFoodOffer);
  onFoodOfferRef.current = onFoodOffer;

  useEffect(() => {
    if (!online || !token) {
      setConnected(false);
      return;
    }
    setActiveRole("rider"); // rider board surface — label apifetch RUM as rider
    // A-O17: shared with the job/location sockets during an active job — one handshake + keepalive
    // for all three, not one each. Every listener below is registered with a NAMED handler and
    // explicitly `.off()`'d in cleanup (not a blind `disconnect()`), since a bare disconnect would
    // tear the connection down out from under the other hooks still holding a reference to it.
    const socket: Socket = acquireSocket(token);
    socketRef.current = socket;

    // Self-heal on (re)connect the way use-order-socket / use-rider-job-socket do: re-scope the board
    // rooms AND refetch the REST snapshot, so a broadcast/expiry/taken push that landed while the socket
    // was down (a blip with no AppState transition, so foreground-refetch never fired) is picked up
    // immediately instead of leaving a stale board until the next 15s poll. Also invalidate ["activeJob"]
    // — this same socket's live `orderTaken` handler below invalidates it too (a bid win), so a miss
    // while backgrounded/disconnected must be reconciled on reconnect the same way, not just openOrders.
    const healBoard = () => {
      void qc.invalidateQueries({ queryKey: ["openOrders"] });
      void qc.invalidateQueries({ queryKey: ["activeJob"] });
    };
    // B-O5: connect/connect_error can both fire repeatedly, seconds apart, while the connection
    // flaps — gate the reconnect-driven heal so a flapping episode pays it once, not once per
    // attempt (see self-heal-gate.ts).
    const gatedHealBoard = createSelfHealGate(healBoard);
    const onConnect = () => {
      setConnected(true);
      const l = locRef.current;
      socket.emit(WS_EVENTS.boardSubscribe, l ? { lat: l.lat, lng: l.lng } : {});
      gatedHealBoard();
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => {
      setConnected(false);
      gatedHealBoard();
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    const onBoardNewOrder = (raw: unknown) => {
      const parsed = BoardNewOrderEvent.safeParse(raw);
      if (!parsed.success) return;
      const order = parsed.data as OpenOrder;
      // RUM: glass-to-glass from the order's server `createdAt` to now (skew-clamped, rider role).
      const ms = clampGlassSample(Date.now(), parsed.data.createdAt);
      if (ms == null) noteDropped();
      else enqueue("board_glass", ms, "rider");
      // Merge into the same ["openOrders"] cache the REST fetch fills. Note: this live push is still
      // global (city-wide), whereas the REST fetch is now geo-scoped to nearby orders — the rider
      // screen's haversine sort reconciles the two visually (nearest first). No change needed here.
      qc.setQueryData<OpenOrder[]>(["openOrders"], (prev) => {
        if (!prev) return [order];
        if (prev.some((o) => o.id === order.id)) return prev; // dedupe: poll may have it already
        return [order, ...prev].slice(0, OPEN_ORDERS_CACHE_CAP);
      });
    };
    socket.on(WS_EVENTS.boardNewOrder, onBoardNewOrder);

    // Auction closed with no pick: drop the order from the board cache (it's no longer biddable) and
    // record its id so a rider who bid on it sees the "nobody picked" state, not a silent removal.
    const onBidExpired = (raw: unknown) => {
      const parsed = BidExpiredEvent.safeParse(raw);
      if (!parsed.success) return;
      const { orderId } = parsed.data;
      setExpiredOrderIds((prev) => addBoundedId(prev, orderId, BOARD_RESOLVED_ID_CAP));
      qc.setQueryData<OpenOrder[]>(["openOrders"], (prev) => prev?.filter((o) => o.id !== orderId));
    };
    socket.on(WS_EVENTS.bidExpired, onBidExpired);

    // A customer picked a rider: the card is no longer biddable — drop it from the board, and (for a
    // rider who bid on it) surface "not chosen" instead of a countdown that dead-ends at 0:00 (3·b1).
    // The winning rider ALSO receives this event, so we must NOT flip their sent-offer card to "not
    // chosen": resolve who was picked first by refetching the active job, and only mark the order taken
    // if it did not become OUR active job — otherwise the winner briefly reads "the customer picked
    // another rider" on the very order they just won. Until then the card keeps its neutral countdown.
    const onOrderTaken = (raw: unknown) => {
      const parsed = OrderTakenEvent.safeParse(raw);
      if (!parsed.success) return;
      const { orderId } = parsed.data;
      // Was this order actually on the rider's board (so its disappearance is worth a word)?
      const wasOnBoard = (qc.getQueryData<OpenOrder[]>(["openOrders"]) ?? []).some((o) => o.id === orderId);
      qc.setQueryData<OpenOrder[]>(["openOrders"], (prev) => prev?.filter((o) => o.id !== orderId));
      void qc.invalidateQueries({ queryKey: ["activeJob"] }).then(() => {
        const active = qc.getQueryData<{ id: string } | null>(["activeJob"]);
        if (active?.id === orderId) return; // we won — never mark our own order "not chosen"
        setTakenOrderIds((prev) => addBoundedId(prev, orderId, BOARD_RESOLVED_ID_CAP));
        // 2·b1: if it was on the board and we hadn't bid on it, nudge the muted "taken" notice. A bid
        // we lost is skipped — its sent-offer card is already flipping to "not this time".
        if (shouldNoticeTakenOrder(wasOnBoard, bidIdsRef.current?.has(orderId) ?? false)) {
          setBoardTakenNudge((n) => n + 1);
        }
      });
    };
    socket.on(WS_EVENTS.orderTaken, onOrderTaken);

    // D5/C5: a live food-dispatch offer for this rider — no room subscription needed (emitToRider
    // targets this authenticated socket directly, see tracking.gateway.ts). `food:offer-closed` needs
    // no handler here: the offer screen's own poll (dispatch/offer) is what notices it's gone.
    const onFoodOfferEvent = (raw: unknown) => {
      const parsed = FoodOfferEvent.safeParse(raw);
      if (!parsed.success) return;
      onFoodOfferRef.current?.(parsed.data.orderId);
    };
    socket.on(WS_EVENTS.foodOffer, onFoodOfferEvent);

    return () => {
      socketRef.current = null;
      socket.emit(WS_EVENTS.boardLeave);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off(WS_EVENTS.boardNewOrder, onBoardNewOrder);
      socket.off(WS_EVENTS.bidExpired, onBidExpired);
      socket.off(WS_EVENTS.orderTaken, onOrderTaken);
      socket.off(WS_EVENTS.foodOffer, onFoodOfferEvent);
      releaseSocket(token, socket);
    };
  }, [online, token, qc]);

  // When the rider's position changes while already connected, re-subscribe with the new loc so the
  // server re-scopes (leaves old geo rooms, joins the new neighbourhood). No socket teardown.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit(WS_EVENTS.boardSubscribe, loc ? { lat: loc.lat, lng: loc.lng } : {});
  }, [loc?.lat, loc?.lng]);

  return { connected, expiredOrderIds, takenOrderIds, boardTakenNudge };
}
