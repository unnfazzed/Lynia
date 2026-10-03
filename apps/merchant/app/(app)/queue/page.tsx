"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MerchantOrderResponse, PREP_CHIPS_MIN, SubstitutionProposalLine } from "@lynia/shared";
import { Icon } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { Segmented } from "../../components/m/Segmented";
import { NotLiveHome } from "../../components/branches/NotLiveHome";
import { OrdersHeader, useOpenSwitch } from "../../components/m/OrdersHeader";
import { useToast } from "../../components/m/Toast";
import { KitchenConfirmTakeover } from "../../components/queue/KitchenConfirmTakeover";
import { NewOrderTakeover } from "../../components/queue/NewOrderTakeover";
import { RetryableError } from "../../components/RetryableError";
import { showNotLiveHome, useBranches } from "../../lib/branches";
import { ApiError, getMyMerchant, type MerchantProfile } from "../../lib/api-client";
import { homePath } from "../../lib/booking";
import { primeBusiness } from "../../lib/business";
import { alarmOrders } from "../../lib/alarm";
import { needsKitchenConfirm } from "../../lib/order-groups";
import { acceptOrder, cancelPreparing, confirmKitchen, listScheduledOrders, proposeSubstitution, rejectOrder } from "../../lib/orders-api";
import { hm, homeSections, itemsLine, money, orderLabel, riderFirstName, rowSub, slotLabel } from "../../lib/orders-view";
import { countOf, ORDER_FLOW as OF, vocabulary } from "../../lib/vocabulary";
import { useNow } from "../../lib/use-now";
import { useQueuePoll } from "../../lib/use-queue-poll";

type LoadState = { status: "loading" } | { status: "ready"; merchant: MerchantProfile } | { status: "error"; message: string };
type Segment = "new" | "cooking" | "ready" | "scheduled";

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
  const [segment, setSegment] = useState<Segment>("new");

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
        else setState({ status: "error", message: err instanceof ApiError ? err.message : "Something went wrong loading your orders." });
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
  const branches = useBranches(ready && state.merchant.myRole === "owner");

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

  const sections = useMemo(() => homeSections(orders), [orders]);
  const scheduled = useScheduled(ready, orders.length);
  const handleAccept = useCallback(
    async (orderId: string, prepMinutes: (typeof PREP_CHIPS_MIN)[number], unavailableDishIds: string[]) => {
      await acceptOrder(orderId, { prepMinutes, unavailableDishIds: unavailableDishIds.length > 0 ? unavailableDishIds : undefined });
      await refetch();
    },
    [refetch],
  );
  const handleConfirmKitchen = useCallback(
    async (orderId: string) => {
      await confirmKitchen(orderId);
      toast("Confirmed · we’ll send a rider when it’s nearly ready");
      await refetch();
    },
    [refetch, toast],
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
    async (orderId: string, reason: Parameters<typeof rejectOrder>[1]) => {
      await rejectOrder(orderId, reason);
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

  const segmentOrders = segment === "scheduled" ? [] : sections[segment];
  const nothing = orders.length === 0 && (scheduled?.length ?? 0) === 0;
  const v = vocabulary(state.merchant.businessType, state.merchant.shopKind);
  // Branches (ledger D-51): a branch not switched on yet, with nothing in its queue, is "Almost ready".
  const notLive = nothing && showNotLiveHome(state.merchant, branches.length);
  const closed = open.status.closedByHand && !notLive;

  return (
    <Kitchen active="queue" backfillCount={backfillCount}>
      <OrdersHeader merchant={state.merchant} open={open} disabled={actionsDisabled} refreshKey={orders.length}>
        {/* A live shop takes customer orders here; its rider bookings (D-48 D1) stay one tap away. */}
        {state.merchant.businessType === "shop" && (
          <Link href="/deliveries" className="m-hdbtn">
            <Icon name="bike" size={20} /> Book a rider
          </Link>
        )}
      </OrdersHeader>

      {notLive ? (
        <NotLiveHome businessType={state.merchant.businessType} />
      ) : closed ? (
        <div className="m-bd" style={{ alignItems: "center", textAlign: "center", gap: 10, paddingTop: 48 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center" }}>
            <Icon name="power" size={30} color="var(--muted)" />
          </div>
          <b style={{ fontSize: 18 }}>You’re closed</b>
          <button type="button" className="m-btn" style={{ width: "auto", padding: "0 28px", marginTop: 6 }} disabled={open.switching || actionsDisabled} onClick={() => void open.toggleOpen(true)}>
            Open now
          </button>
          <button type="button" className="m-lnk" style={{ fontSize: 13 }} disabled={open.switching || actionsDisabled} onClick={() => void open.toggleOpen(true, true)}>
            Open in busy mode (+10 min)
          </button>
          {/* Orders already in progress still need finishing while closed. */}
          {!nothing && <OrderSections sections={sections} alongside="all" />}
        </div>
      ) : (
        <div className="m-bd" style={{ paddingTop: 12 }}>
          {pollFailed && !loaded ? (
            <RetryableError message={queueError.message} onRetry={() => void refetch()} />
          ) : nothing ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", paddingTop: 40 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center" }}>
                <Icon name="inbox" size={30} color="var(--muted)" />
              </div>
              <b style={{ fontSize: 18 }}>No orders yet</b>
            </div>
          ) : (
            <>
              <Segmented
                label="Orders"
                value={segment}
                onChange={setSegment}
                options={[
                  { value: "new", label: "New", count: sections.new.length },
                  { value: "cooking", label: v.making, count: sections.cooking.length },
                  { value: "ready", label: "Ready", count: sections.ready.length },
                  ...(scheduled && scheduled.length > 0 ? [{ value: "scheduled" as const, label: OF.segSched, count: scheduled.length }] : []),
                ]}
              />
              {segment === "scheduled" && <ScheduledList orders={scheduled ?? []} v={v} />}
              {segmentOrders.length === 0 && segment !== "scheduled" && <div className="m-hint" style={{ padding: "8px 0" }}>Nothing here</div>}
              {segmentOrders.map((o) =>
                o.merchantPhase === "awaiting_accept" ? (
                  <NewOrderCard key={o.id} order={o} />
                ) : needsKitchenConfirm(o) ? (
                  <AutoAcceptedCard key={o.id} order={o} disabled={actionsDisabled} onConfirm={handleConfirmKitchen} />
                ) : null,
              )}
              <Rows orders={segmentOrders.filter((o) => o.merchantPhase !== "awaiting_accept" && !needsKitchenConfirm(o))} />
              {segment !== "scheduled" && <OrderSections sections={sections} alongside={segment} />}
            </>
          )}
        </div>
      )}

      {ringing[0] ? (
        <NewOrderTakeover
          key={ringing[0].id}
          active={ringing[0]}
          disabled={actionsDisabled}
          onAccept={handleAccept}
          onPropose={handlePropose}
          onReject={handleReject}
          refetch={refetch}
        />
      ) : confirming[0] ? (
        <KitchenConfirmTakeover
          key={confirming[0].id}
          active={confirming[0]}
          disabled={actionsDisabled}
          onConfirm={handleTakeoverConfirm}
          onCancel={handleTakeoverCancel}
          onEditItems={handleEditItems}
          refetch={refetch}
        />
      ) : null}
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

/** M7a · the Scheduled segment: per order "#A1B2 · $15.00", the slot with a calendar, then "2 dishes ·
 *  Rings at 12:05 like a new order". Each opens its ticket (M7b). */
function ScheduledList({ orders, v }: { orders: readonly MerchantOrderResponse[]; v: ReturnType<typeof vocabulary> }) {
  const now = useNow(60_000);
  return (
    <>
      {orders.map((o) => {
        const s = o.scheduledFor ? slotLabel(o.scheduledFor, new Date(now)) : null;
        const day = s ? s.day.charAt(0).toUpperCase() + s.day.slice(1) : "";
        return (
          <Link key={o.id} href={`/queue/${o.id}`} className="m-card" style={{ gap: 6, color: "inherit", textDecoration: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b className="m-num" style={{ fontSize: 15, flex: 1 }}>
                {orderLabel(o)}
              </b>
              <b className="m-num">{money(o.merchantGoodsTotal)}</b>
            </div>
            {s && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                <Icon name="calendar" size={15} color="var(--accent-text)" />
                {day} {s.slot}
              </div>
            )}
            <span className="m-hint" style={{ fontSize: 13 }}>
              {[countOf(o.items.length, v), o.ringsAt ? OF.schedRing(hm(o.ringsAt)) : null].filter(Boolean).join(" · ")}
            </span>
          </Link>
        );
      })}
    </>
  );
}

/** B1's new-order card: 2px accent border, the number and total, the lines, "View & accept". */
function NewOrderCard({ order }: { order: MerchantOrderResponse }) {
  return (
    <div className="m-card" style={{ border: "2px solid var(--accent)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <b className="m-num" style={{ fontSize: 15, flex: 1 }}>
          {orderLabel(order)}
        </b>
        <b className="m-num" style={{ fontSize: 15 }}>
          {money(order.merchantGoodsTotal)}
        </b>
      </div>
      <div style={{ fontSize: 13.5, color: "var(--muted)" }}>{itemsLine(order)}</div>
      {/* The ringing takeover is already over this screen; the card is what's left beneath it. */}
      <Link href={`/queue/${order.id}`} className="m-btn m-sm">
        View &amp; accept
      </Link>
    </div>
  );
}

/** Auto-accept: the new-order card for an order LyniaGo already accepted — the kitchen confirms it is
 *  making it, which is what lets a rider be sent. */
function AutoAcceptedCard({ order, disabled, onConfirm }: { order: MerchantOrderResponse; disabled: boolean; onConfirm: (orderId: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(order.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="m-card" style={{ border: "2px solid var(--accent)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link href={`/queue/${order.id}`} className="m-num" style={{ fontSize: 15, fontWeight: 700, color: "inherit", textDecoration: "none" }}>
          {orderLabel(order)}
        </Link>
        <span className="m-pl m-wal">Accepted for you</span>
        <span style={{ flex: 1 }} />
        <b className="m-num" style={{ fontSize: 15 }}>
          {money(order.merchantGoodsTotal)}
        </b>
      </div>
      <div style={{ fontSize: 13.5, color: "var(--muted)" }}>{itemsLine(order)}</div>
      {error && (
        <div className="m-alert" role="alert">
          {error}
        </div>
      )}
      <button type="button" className="m-btn m-sm" disabled={disabled || busy} onClick={() => void confirm()}>
        Got it, we’re making it
      </button>
    </div>
  );
}

/** "Waiting for rider" and "Out for delivery", under whichever segment is showing. */
function OrderSections({ sections, alongside }: { sections: ReturnType<typeof homeSections>; alongside: Segment | "all" }) {
  return (
    <>
      {alongside === "all" && [...sections.new, ...sections.cooking].length > 0 && (
        <>
          <div className="m-sec" style={{ alignSelf: "stretch", textAlign: "left" }}>
            In the kitchen
          </div>
          <Rows orders={[...sections.new, ...sections.cooking]} />
        </>
      )}
      {alongside !== "ready" && sections.ready.length > 0 && (
        <>
          <div className="m-sec" style={{ alignSelf: "stretch", textAlign: "left" }}>
            Waiting for rider
          </div>
          <Rows orders={sections.ready} />
        </>
      )}
      {sections.outForDelivery.length > 0 && (
        <>
          <div className="m-sec" style={{ alignSelf: "stretch", textAlign: "left" }}>
            Out for delivery
          </div>
          <Rows orders={sections.outForDelivery} />
        </>
      )}
    </>
  );
}

function Rows({ orders }: { orders: readonly MerchantOrderResponse[] }) {
  const now = useNow(30_000);
  if (orders.length === 0) return null;
  return (
    <div style={{ marginTop: -6, alignSelf: "stretch", textAlign: "left" }}>
      {orders.map((o) => {
        const rider = riderFirstName(o);
        const out = o.status === "picked_up" || o.status === "en_route_dropoff" || o.status === "delivered" || o.status === "undelivered" || o.status === "completed";
        const title = out && rider ? `${orderLabel(o)} · ${rider}` : `${orderLabel(o)} · ${itemsLine(o)}`;
        const dueMin = o.cashDueAt ? Math.round((new Date(o.cashDueAt).getTime() - now) / 60_000) : null;
        return (
          <Link key={o.id} href={`/queue/${o.id}`} className="m-li">
            <div className="m-t">
              <b className="m-num">{title}</b>
              <span>{rowSub(o)}</span>
            </div>
            {dueMin !== null ? (
              <span className={`m-pl m-num ${dueMin < 0 ? "m-red" : "m-gold"}`}>{dueMin < 0 ? "Overdue" : `${dueMin} min`}</span>
            ) : (
              !out && (
                <b className="m-num" style={{ fontSize: 14.5 }}>
                  {money(o.merchantGoodsTotal)}
                </b>
              )
            )}
            <Icon name="chevron-right" size={18} color="var(--muted)" />
          </Link>
        );
      })}
    </div>
  );
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
