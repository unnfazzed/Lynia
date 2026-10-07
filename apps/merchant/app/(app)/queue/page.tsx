"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MerchantOrderResponse } from "@lynia/shared";
import { Icon } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { NotLiveHome } from "../../components/branches/NotLiveHome";
import { BookRiderCard, ClosedBody } from "../../components/m/ClosedBody";
import { OrdersHeader, useOpenSwitch } from "../../components/m/OrdersHeader";
import { useToast } from "../../components/m/Toast";
import { RetryableError } from "../../components/RetryableError";
import { showNotLiveHome } from "../../lib/branches";
import { ApiError, getMyMerchant, type MerchantProfile } from "../../lib/api-client";
import { bookingsAvailable, homePath } from "../../lib/booking";
import { buildBoard } from "../../lib/board";
import { useBookings } from "../../lib/use-bookings";
import { Board } from "../../components/queue/Board";
import { primeBusiness } from "../../lib/business";
import { listScheduledOrders } from "../../lib/orders-api";
import { hm, money, orderLabel, riderFirstName } from "../../lib/orders-view";
import { countOf, ORDER_FLOW as OF, vocabulary } from "../../lib/vocabulary";
import { useNow } from "../../lib/use-now";
import { orderHref } from "../../lib/routes";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; merchant: MerchantProfile }
  /** `retry`: a failure worth trying again by itself (anything but "signed out" / "not a member"). */
  | { status: "error"; message: string; retry: boolean };

/** MJ-RH4: the profile read retries by itself on a back-off — 2s, 4s, 8s… up to 30s. */
const PROFILE_RETRY_BASE_MS = 2_000;
const PROFILE_RETRY_MAX_MS = 30_000;

/**
 * B1 · Orders home and B5 · Closed (packages/design/handoff/merchant-mobile, ledger D-48). The mint
 * header carries the business, "● Open until 22:00" and the open/closed switch, then (owners) the
 * Orders · Sales · Cash overdue tiles. The body is the New · Cooking · Ready segments, then "Waiting
 * for rider" and "Out for delivery". Closed by hand, the header greys and the body says "You're
 * closed" with "Open now" and "Open in busy mode (+10 min)". A ringing order (B2) takes over the
 * whole screen until it is answered, and the alarm rings for as long as one is waiting.
 *
 * C20 (2026-10-07): the queue poll, the alarm and the ringing screen are no longer this page's — the
 * signed-in shell owns them (`KitchenConnectionProvider`, `RingingHost`), so they run on every screen
 * and this board reads the same queue. MJ-RH4: that poll starts with the session, beside this page's
 * `/merchant/me` read rather than after it, and a failed profile read retries by itself on a back-off.
 */
export default function QueuePage() {
  const { actionsDisabled, reachability, signOut, queue } = useKitchenConnection();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const retriesRef = useRef(0);

  const loadMerchant = useCallback((quiet = false) => {
    let cancelled = false;
    if (!quiet) setState({ status: "loading" });
    getMyMerchant()
      .then((merchant) => {
        if (cancelled) return;
        retriesRef.current = 0;
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
        else if (err instanceof ApiError && err.status === 401) signOut();
        else
          setState({
            status: "error",
            message: err instanceof ApiError ? err.message : "Something went wrong loading your orders.",
            retry: true,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [router, signOut]);

  useEffect(() => loadMerchant(), [loadMerchant]);

  // MJ-RH4: a 5xx (an API cold start) is a response, so reachability still reads "reachable" and the
  // effect below never fires — the board sat on "Try again" with nobody to tap it. Retry on a back-off.
  useEffect(() => {
    if (state.status !== "error" || !state.retry) return undefined;
    const delay = Math.min(PROFILE_RETRY_MAX_MS, PROFILE_RETRY_BASE_MS * 2 ** retriesRef.current);
    retriesRef.current += 1;
    let cancel: (() => void) | undefined;
    const t = setTimeout(() => {
      cancel = loadMerchant(true);
    }, delay);
    return () => {
      clearTimeout(t);
      cancel?.();
    };
  }, [state, loadMerchant]);

  // A dropped first load would otherwise leave the whole order poll and alarm unarmed until a manual
  // Retry: retry by itself the moment the connection comes back.
  useEffect(() => {
    if (state.status === "error" && reachability.reachable) loadMerchant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachability.reachable]);

  const ready = state.status === "ready";
  const open = useOpenSwitch(ready ? state.merchant : null, (merchant) => setState({ status: "ready", merchant }));
  // The shell's one queue poll (C20). Its 401 sign-out and the alarm are the shell's too.
  const { orders, loaded, error: queueError, refetch } = queue;

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
  if (state.status !== "ready") {
    return (
      <Kitchen active="queue">
        <div className="m-bd" style={{ paddingTop: 24 }}>
          {state.status === "loading" ? <div className="m-hint">Loading your orders…</div> : <RetryableError message={state.message} onRetry={() => loadMerchant()} />}
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
        <Link key={o.id} href={orderHref(o.id)} className="m-bc m-row m-dashed">
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
