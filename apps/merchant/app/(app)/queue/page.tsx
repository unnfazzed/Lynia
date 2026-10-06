"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MerchantOrderResponse, PREP_CHIPS_MIN, SubstitutionProposalLine } from "@lynia/shared";
import { Icon } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { NotLiveHome } from "../../components/branches/NotLiveHome";
import { BookRiderCard, ClosedBody } from "../../components/m/ClosedBody";
import { OrdersHeader, useOpenSwitch } from "../../components/m/OrdersHeader";
import { useToast } from "../../components/m/Toast";
import { RingingScreen } from "../../components/queue/RingingScreen";
import { RetryableError } from "../../components/RetryableError";
import { showNotLiveHome } from "../../lib/branches";
import { ApiError, getMyMerchant, type MerchantProfile } from "../../lib/api-client";
import { bookingsAvailable, homePath } from "../../lib/booking";
import { buildBoard } from "../../lib/board";
import { useBookings } from "../../lib/use-bookings";
import { Board } from "../../components/queue/Board";
import { primeBusiness } from "../../lib/business";
import { alarmOrders } from "../../lib/alarm";
import { needsKitchenConfirm } from "../../lib/order-groups";
import { acceptOrder, cancelPreparing, confirmKitchen, listScheduledOrders, proposeSubstitution, rejectOrder } from "../../lib/orders-api";
import { hm, money, orderLabel, riderFirstName } from "../../lib/orders-view";
import { countOf, ORDER_FLOW as OF, vocabulary } from "../../lib/vocabulary";
import { useNow } from "../../lib/use-now";
import { useQueuePoll } from "../../lib/use-queue-poll";

type LoadState = { status: "loading" } | { status: "ready"; merchant: MerchantProfile } | { status: "error"; message: string };

/**
 * B1 · Orders home and B5 · Closed (packages/design/handoff/merchant-mobile, ledger D-48). The mint
 * header carries the business, "● Open until 22:00" and the open/closed switch, then (owners) the
 * Orders · Sales · Cash overdue tiles. The body is the New · Cooking · Ready segments, then "Waiting
 * for rider" and "Out for delivery". Closed by hand, the header greys and the body says "You're
 * closed" with "Open now" and "Open in busy mode (+10 min)". A ringing order (B2) takes over the
 * whole screen until it is answered, and the alarm rings for as long as one is waiting.
 */
export default function QueuePage() {
  const { alarm, actionsDisabled, reachability, signOut } = useKitchenConnection();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const loadMerchant = useCallback(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getMyMerchant()
      .then((merchant) => {
        if (cancelled) return;
        primeBusiness(merchant);
        // A shop that isn't live to customers takes no orders, so its Orders home is Deliveries (D-48).
        if (homePath(merchant) !== "/queue") {
          router.replace(homePath(merchant));
          return;
        }
        setState({ status: "ready", merchant });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) router.replace("/onboarding");
        else
          setState({
            status: "error",
            message: err instanceof ApiError ? err.message : "Something went wrong loading your orders.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => loadMerchant(), [loadMerchant]);

  // A dropped first load would otherwise leave the whole order poll and alarm unarmed until a manual
  // Retry: retry by itself the moment the connection comes back.
  useEffect(() => {
    if (state.status === "error" && reachability.reachable) loadMerchant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachability.reachable]);

  const ready = state.status === "ready";
  const open = useOpenSwitch(ready ? state.merchant : null, (merchant) => setState({ status: "ready", merchant }));
  const { orders, loaded, error: queueError, refetch } = useQueuePoll(ready);

  // D-05: rings the whole time any order is unanswered — or auto-accepted and not yet confirmed by the
  // kitchen — and stops the instant none are. Both take over the screen: a new order (B2) first, then
  // an auto-accepted one waiting for the kitchen (Order flow v2 M1a, ledger D-59).
  const ringing = orders.filter((o) => o.merchantPhase === "awaiting_accept");
  const confirming = orders.filter(needsKitchenConfirm);
  const alarmCount = alarmOrders(orders).length;
  useEffect(() => {
    if (alarmCount > 0) alarm.ring();
    else alarm.silence();
  }, [alarmCount, alarm]);

  useEffect(() => {
    if (queueError?.status === 401) signOut();
  }, [queueError, signOut]);

  // Order flow v2's rule for every merchant screen (ledger D-74): a failed poll is never a lasting red
  // line. Before the first load lands it is the calm "↻ Try again" below; after that the board keeps its
  // last state. A lost connection already shows the shell's offline bar; any other failure is said once
  // in the ink toast, and again only after a poll has worked in between.
  const pollFailed = queueError !== null && queueError.status !== 401;
  const failureToldRef = useRef(false);
  useEffect(() => {
    if (!pollFailed) {
      failureToldRef.current = false;
      return;
    }
    if (!loaded || failureToldRef.current || queueError.status === 0) return;
    failureToldRef.current = true;
    toast(queueError.message);
  }, [pollFailed, loaded, queueError, toast]);

  useOrderToasts(orders, toast);

  // Reconnect: count the orders that arrived while offline, for the "Back online" toast.
  const backfillCount = useBackfillCount(orders, reachability.reachable);

  const scheduled = useScheduled(ready, orders.length);
  // S1 (Merchant v2, D-77): a shop's own rider bookings sit on the same board as its customer orders.
  const shop = ready && state.merchant.businessType === "shop";
  const { bookings } = useBookings(shop && bookingsAvailable(state.status === "ready" ? state.merchant : null));
  const now = useNow(15_000);
  const handleAccept = useCallback(
    async (orderId: string, prepMinutes: (typeof PREP_CHIPS_MIN)[number], unavailableDishIds: string[]) => {
      await acceptOrder(orderId, {
        prepMinutes,
        unavailableDishIds: unavailableDishIds.length > 0 ? unavailableDishIds : undefined,
      });
      await refetch();
    },
    [refetch],
  );
  const handleTakeoverConfirm = useCallback(
    async (orderId: string) => {
      await confirmKitchen(orderId);
      await refetch();
    },
    [refetch],
  );
  const handleTakeoverCancel = useCallback(
    async (orderId: string) => {
      await cancelPreparing(orderId);
      await refetch();
    },
    [refetch],
  );
  const handlePropose = useCallback(
    async (orderId: string, prepMinutes: (typeof PREP_CHIPS_MIN)[number], lines: SubstitutionProposalLine[]) => {
      await proposeSubstitution(orderId, { lines, prepMinutes });
      await refetch();
    },
    [refetch],
  );
  const handleEditItems = useCallback(
    async (orderId: string, lines: SubstitutionProposalLine[]) => {
      await proposeSubstitution(orderId, { lines });
      await refetch();
    },
    [refetch],
  );
  const handleReject = useCallback(
    async (orderId: string, reason: Parameters<typeof rejectOrder>[1], note?: string) => {
      await rejectOrder(orderId, reason, note);
      await refetch();
    },
    [refetch],
  );

  if (state.status !== "ready") {
    return (
      <Kitchen active="queue">
        <div className="m-bd" style={{ paddingTop: 24 }}>
          {state.status === "loading" ? <div className="m-hint">Loading your orders…</div> : <RetryableError message={state.message} onRetry={loadMerchant} />}
        </div>
      </Kitchen>
    );
  }

  const nothing = orders.length === 0 && (scheduled?.length ?? 0) === 0 && bookings.length === 0;
  const v = vocabulary(state.merchant.businessType, state.merchant.shopKind);
  // Branches (ledger D-51): a branch not switched on yet, with nothing in its queue, is "Almost ready".
  const notLive = nothing && showNotLiveHome(state.merchant);
  const closed = open.status.closedByHand && !notLive;
  const board = buildBoard({ orders, bookings, v, shop, now });
  // K1b (D-77 follow-ups): SCHEDULED · n, last on the board, as dashed cards.
  const scheduledSection =
    scheduled && scheduled.length > 0 ? (
      <div className="m-board" style={{ paddingTop: board.length > 0 ? 0 : undefined }}>
        <section aria-label={OF.segSched} className="m-board-sec">
          <h2 className="m-bh">{`${OF.segSched.toUpperCase()} · ${scheduled.length}`}</h2>
          <ScheduledList orders={scheduled} v={v} />
        </section>
      </div>
    ) : null;

  return (
    <Kitchen active="queue" backfillCount={backfillCount}>
      <OrdersHeader merchant={state.merchant} open={open} disabled={actionsDisabled} refreshKey={orders.length}>
        {/* S1: a shop books riders for its own sales from the top card; they join this board as BOOKED. */}
        {shop && <BookRiderCard href="/deliveries/new" />}
      </OrdersHeader>

      {notLive ? (
        <NotLiveHome businessType={state.merchant.businessType} />
      ) : closed ? (
        <ClosedBody merchant={state.merchant} open={open} disabled={actionsDisabled}>
          {/* Orders already in progress still need finishing while closed. */}
          {board.length > 0 && <Board sections={board} />}
        </ClosedBody>
      ) : pollFailed && !loaded ? (
        <div className="m-bd" style={{ paddingTop: 12 }}>
          <RetryableError message={queueError.message} onRetry={() => void refetch()} />
        </div>
      ) : nothing ? (
        // K1c (D-77 follow-ups): open and quiet — mint, so it can't be mistaken for T4 Closed.
        <div className="m-quiet">
          <i>
            <Icon name="inbox" size={30} />
          </i>
          <b>All quiet for now</b>
          <p>You&apos;re open. New orders ring here with sound, so keep the volume up.</p>
          <Link href={shop ? "/deliveries/new" : "/menu"} className="m-btn2">
            {shop ? "Book a rider" : "Check your menu"}
          </Link>
        </div>
      ) : (
        <>
          <Board sections={board} />
          {scheduledSection}
        </>
      )}

      {/* K2 / S2 (Merchant v2, D-77): one ringing screen — a new order first, then an auto-accepted one. */}
      {(ringing[0] ?? confirming[0]) && (
        <RingingScreen
          key={(ringing[0] ?? confirming[0])!.id}
          active={(ringing[0] ?? confirming[0])!}
          disabled={actionsDisabled}
          onAccept={handleAccept}
          onPropose={handlePropose}
          onReject={handleReject}
          onConfirm={handleTakeoverConfirm}
          onCancel={handleTakeoverCancel}
          onEditItems={handleEditItems}
          refetch={refetch}
        />
      )}
    </Kitchen>
  );
}

/** M7a: scheduled orders that haven't rung, polled beside the queue (null until the first read lands,
 *  or when the API has no Scheduled list). Re-read whenever the queue's size changes — a scheduled order
 *  ringing leaves this list for the queue. */
function useScheduled(enabled: boolean, queueSize: number): MerchantOrderResponse[] | null {
  const [list, setList] = useState<MerchantOrderResponse[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      listScheduledOrders()
        .then((l) => {
          if (alive) setList(Array.isArray(l) ? l : []);
        })
        .catch(() => {});
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled, queueSize]);
  return list;
}

/** K1b's SCHEDULED rows (D-77 follow-ups): a dashed card with a clock — "12:30 today · #A301" (beyond
 *  today, "Tue 07:00 · #A301"), then "3 dishes · $18.00 · rings at 12:00". Each opens its ticket (M7b). */
function ScheduledList({ orders, v }: { orders: readonly MerchantOrderResponse[]; v: ReturnType<typeof vocabulary> }) {
  const now = useNow(60_000);
  return (
    <>
      {orders.map((o) => (
        <Link key={o.id} href={`/queue/${o.id}`} className="m-bc m-row m-dashed">
          <Icon name="clock" size={20} color="var(--muted)" />
          <div className="m-bt">
            <b className="m-num">{[o.scheduledFor ? schedWhen(o.scheduledFor, new Date(now)) : null, orderLabel(o)].filter(Boolean).join(" · ")}</b>
            <span className="m-bsub">
              {[countOf(o.items.length, v), money(o.merchantGoodsTotal), o.ringsAt ? `rings at ${hm(o.ringsAt)}` : null].filter(Boolean).join(" · ")}
            </span>
          </div>
          <Icon name="chevron-right" size={20} color="var(--muted)" />
        </Link>
      ))}
    </>
  );
}

/** "12:30 today", or "Tue 07:00" beyond today. */
function schedWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  const today = d.toDateString() === now.toDateString();
  return today ? `${hm(iso)} today` : `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${hm(iso)}`;
}

/** One-line toasts for the moments the old full-screen takeovers used to announce. */
function useOrderToasts(orders: readonly MerchantOrderResponse[], toast: (m: string) => void) {
  const prev = useRef<Map<string, MerchantOrderResponse> | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = new Map(orders.map((o) => [o.id, o]));
    if (!before) return;
    for (const o of orders) {
      const was = before.get(o.id);
      if (!was) continue;
      if (!was.riderId && o.riderId) toast(`Rider secured · ${riderFirstName(o) ?? "on the way"}`);
      else if (was.status !== "picked_up" && o.status === "picked_up") toast(`Handed over · ${orderLabel(o)}`);
    }
  }, [orders, toast]);
}

function useBackfillCount(orders: readonly MerchantOrderResponse[], reachable: boolean): number {
  const preOutageIds = useRef<Set<string> | null>(null);
  const wasReachable = useRef(true);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (wasReachable.current && !reachable) preOutageIds.current = new Set(orders.map((o) => o.id));
    if (!wasReachable.current && reachable) {
      const before = preOutageIds.current;
      setCount(before ? orders.filter((o) => !before.has(o.id)).length : 0);
      preOutageIds.current = null;
    }
    wasReachable.current = reachable;
  }, [reachable, orders]);
  return count;
}
