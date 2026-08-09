"use client";

import { useCallback, useMemo, useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { PREP_CHIPS_MIN } from "@lynia/shared";
import { addBoundedId } from "../../lib/bounded-id-set";
import { useHandoverWatch } from "../../lib/handover-watch";
import { groupQueue, isNoRiderHold, isRiderSecured, shouldUseBoard } from "../../lib/order-groups";
import {
  acceptOrder,
  confirmGoodsReturned,
  confirmPayment,
  confirmReturnedCash,
  dispatchCancel,
  dispatchResume,
  logCall,
  markReady,
  refundOrder,
  rejectOrder,
  releaseUnpaid,
  reportNonReturn,
  requestPayment,
  revealPickupCode,
} from "../../lib/orders-api";
import { Icon } from "../icons";
import { NewOrderTakeover } from "./NewOrderTakeover";
import { NoRiderHoldTakeover } from "./NoRiderHoldTakeover";
import { OrderCard, type OrderCardBucket } from "./OrderCard";
import { PickupDoneTakeover } from "./PickupDoneTakeover";
import { ReturnsSection } from "./ReturnsSection";
import { RiderSecuredTakeover } from "./RiderSecuredTakeover";

interface OrderActions {
  onMarkReady: (orderId: string) => Promise<void>;
  onRevealPickupCode: (orderId: string) => Promise<string>;
}

interface MoneyActions {
  onLogCall: (orderId: string) => Promise<void>;
  onRequestPayment: (orderId: string, overrideCallLog: boolean) => Promise<void>;
  onConfirmPayment: (orderId: string, body: { reference: string; amount: number }) => Promise<void>;
  onReleaseUnpaid: (orderId: string) => Promise<void>;
  onRefund: (orderId: string, body: { reference: string; amount: number }) => Promise<void>;
}

// RF-13: ~15 handlers all shared the shape `await apiCall(...args); refetch();` — one generic
// wrapper replaces the repeated bodies while keeping each call site's own argument list.
//
// LC-D##: `refetch()` is now awaited, not fired-and-forgotten. Before this, the returned promise
// resolved as soon as the mutation's own HTTP round trip finished — well before the follow-up
// GET actually landed — so a caller like NewOrderTakeover's submitAccept reset its `submitting`
// flag and re-enabled the Accept/Reject buttons while the takeover was still showing the SAME,
// just-accepted order (the refetch that would swap/remove it hadn't resolved yet). On this
// program's 300-600ms-RTT/dead-zone links that window was easily 1-2s of a fully interactive,
// visually-unchanged screen — inviting a "nothing happened, tap again" retry that the server's
// atomic per-order CAS turns into a scary but harmless 409 on an order that was in fact handled.
function withRefetch<Args extends unknown[]>(action: (...args: Args) => Promise<unknown>, refetch: () => Promise<void>) {
  return async (...args: Args): Promise<void> => {
    await action(...args);
    await refetch();
  };
}

function Column({
  title,
  tint,
  items,
  disabled,
  onOpenHold,
  orderActions,
  moneyActions,
}: {
  title: string;
  tint: string;
  items: { order: MerchantOrderResponse; bucket: OrderCardBucket }[];
  disabled: boolean;
  onOpenHold: (order: MerchantOrderResponse) => void;
  orderActions: OrderActions;
  moneyActions: MoneyActions;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Column head sizes follow the gallery's BoardCol (r-merchant.jsx:48-52): 14.5/800 title,
       *  13/700 muted tabular count beside it. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: tint }} />
        <span style={{ fontSize: 14.5, fontWeight: 800 }}>{title}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{items.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflow: "auto" }}>
        {items.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Nothing here</div>}
        {items.map(({ order, bucket }) => (
          <OrderCard
            key={order.id}
            order={order}
            bucket={bucket}
            disabled={disabled}
            onOpenHold={onOpenHold}
            {...orderActions}
            {...moneyActions}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The kitchen queue board (E2, §5 Lane E). Priority stack for full-viewport takeovers: an
 * unanswered NEW ORDER always wins (D-05), then an unacknowledged "rider secured" moment (D-04),
 * then an open/auto-surfaced NO_RIDER hold decision (D-34) — everything else renders as ordinary
 * board/list cards so the awaiting-payment lane (M2·7) never blocks progress elsewhere.
 */
// B-O14: the kitchen tablet stays mounted for a whole shift with no unmount to reset these —
// bounded in practice by one restaurant's daily order volume (tens to a few hundred), same
// low-severity shape as the mobile rider board's B-O13 fix. Cap value matches that precedent.
const ACK_ID_CAP = 200;

export function QueueBoard({
  orders,
  disabled,
  refetch,
}: {
  orders: readonly MerchantOrderResponse[];
  disabled: boolean;
  refetch: () => Promise<void>;
}) {
  const [ackSecuredIds, setAckSecuredIds] = useState<Set<string>>(new Set());
  const [ackHoldIds, setAckHoldIds] = useState<Set<string>>(new Set());
  const [openHoldId, setOpenHoldId] = useState<string | null>(null);

  const groups = groupQueue(orders);
  const board = shouldUseBoard(orders);

  const [active, ...queued] = groups.awaitingAccept;

  // M3·3: a rider-secured order leaving the queue, re-read and confirmed as actually handed over.
  // Suppressed while a NEW ORDER is unanswered — that alarm outranks every other screen (D-05).
  const { handedOver, dismiss: dismissHandover } = useHandoverWatch(orders, !active);

  const securedToShow = groups.ready.find((o) => isRiderSecured(o) && !isNoRiderHold(o) && !ackSecuredIds.has(o.id)) ?? null;
  const holdCandidates = groups.ready.filter(isNoRiderHold);
  const holdToShow = openHoldId ? (holdCandidates.find((o) => o.id === openHoldId) ?? null) : (holdCandidates.find((o) => !ackHoldIds.has(o.id)) ?? null);

  const handleAccept = withRefetch(
    (orderId: string, prepMinutes: (typeof PREP_CHIPS_MIN)[number], unavailableDishIds: string[]) =>
      acceptOrder(orderId, { prepMinutes, unavailableDishIds: unavailableDishIds.length > 0 ? unavailableDishIds : undefined }),
    refetch,
  );

  const handleReject = withRefetch(rejectOrder, refetch);

  // LC-D03: callers (OrderCard) own the busy/error state per order — this just propagates
  // the rejection instead of swallowing it in a bare `void` fire-and-forget.
  // B-O17: memoized (like every other OrderCard-bound handler below) so OrderCard's new memo
  // boundary sees a stable prop reference across re-renders that don't touch this handler's inputs,
  // instead of a fresh closure — and therefore a "changed prop" — every render.
  const handleMarkReady = useMemo(() => withRefetch(markReady, refetch), [refetch]);

  const handleRevealPickupCode = useCallback(async (orderId: string): Promise<string> => {
    const res = await revealPickupCode(orderId);
    return res.pickupCode;
  }, []);

  const handleOpenHold = useCallback((order: MerchantOrderResponse) => {
    setOpenHoldId(order.id);
  }, []);

  function handleHoldDismiss() {
    if (holdToShow) setAckHoldIds((prev) => addBoundedId(prev, holdToShow.id, ACK_ID_CAP));
    setOpenHoldId(null);
  }

  const handleHoldResume = withRefetch(async (orderId: string) => {
    await dispatchResume(orderId);
    setOpenHoldId(null);
  }, refetch);

  const handleHoldCancel = withRefetch(async (orderId: string) => {
    await dispatchCancel(orderId);
    setOpenHoldId(null);
  }, refetch);

  // E3 (R-16/R-17): the awaiting-payment lane's real flow. B-O17: memoized, see handleMarkReady's
  // own note above.
  const handleLogCall = useMemo(() => withRefetch(logCall, refetch), [refetch]);
  const handleRequestPayment = useMemo(() => withRefetch(requestPayment, refetch), [refetch]);
  const handleConfirmPayment = useMemo(() => withRefetch(confirmPayment, refetch), [refetch]);
  // No reason picker here (the gallery's M2·7 ships a single release button with no reason UI) —
  // "other" is the honest default rather than guessing a more specific one (flagged, not decided).
  const handleReleaseUnpaid = useMemo(() => withRefetch((orderId: string) => releaseUnpaid(orderId, "other"), refetch), [refetch]);
  // D-12: refund-then-cancel an already-confirmed WALLET order.
  const handleRefund = useMemo(
    () => withRefetch((orderId: string, body: { reference: string; amount: number }) => refundOrder(orderId, body.reference, body.amount), refetch),
    [refetch],
  );

  // E3/R-01: the collect-and-return debt ledger's merchant-side settlement actions.
  const handleConfirmReturnedCash = withRefetch(confirmReturnedCash, refetch);
  const handleConfirmGoodsReturned = withRefetch(confirmGoodsReturned, refetch);
  const handleReportNonReturn = withRefetch(reportNonReturn, refetch);

  const moneyActions = {
    onLogCall: handleLogCall,
    onRequestPayment: handleRequestPayment,
    onConfirmPayment: handleConfirmPayment,
    onReleaseUnpaid: handleReleaseUnpaid,
    onRefund: handleRefund,
  };

  if (active) {
    return <NewOrderTakeover key={active.id} active={active} queued={queued} disabled={disabled} onAccept={handleAccept} onReject={handleReject} refetch={refetch} />;
  }

  // M3·3: five seconds of "that one's gone", then straight back to the board — it self-dismisses, so
  // it sits above the secured/hold takeovers rather than being starved by them.
  if (handedOver) {
    return <PickupDoneTakeover key={handedOver.id} order={handedOver} onDismiss={dismissHandover} />;
  }

  if (securedToShow) {
    // LC-D##: without a key, React reused the same component instance across two orders secured
    // back-to-back (a rider-secured order B superseding order A before A's "Got it" dismiss even
    // fires the next render) — the local pickupCode state stayed A's real code while the label
    // switched to B, and stayed wrong indefinitely if B's own revealPickupCode() call errored. A
    // per-order key forces a full remount at the order boundary, mirroring NewOrderTakeover's own
    // key={active.id} and NoRiderHoldTakeover's key={holdToShow.id} three lines below.
    return (
      <RiderSecuredTakeover
        key={securedToShow.id}
        order={securedToShow}
        onDismiss={() => setAckSecuredIds((prev) => addBoundedId(prev, securedToShow.id, ACK_ID_CAP))}
      />
    );
  }

  if (holdToShow) {
    return (
      <NoRiderHoldTakeover
        key={holdToShow.id}
        order={holdToShow}
        disabled={disabled}
        onResume={handleHoldResume}
        onCancel={handleHoldCancel}
        onHold={handleHoldDismiss}
      />
    );
  }

  const newColumnItems: { order: MerchantOrderResponse; bucket: OrderCardBucket }[] = [
    ...groups.awaitingItemApproval.map((order) => ({ order, bucket: "waiting" as const })),
    ...groups.awaitingPayment.map((order) => ({ order, bucket: "payment" as const })),
  ];
  const cookingColumnItems = groups.preparing.map((order) => ({ order, bucket: "preparing" as const }));
  const readyColumnItems = groups.ready.map((order) => ({ order, bucket: "ready" as const }));

  const returnsSection = (
    <ReturnsSection
      orders={groups.awaitingReturn}
      disabled={disabled}
      onConfirmReturnedCash={handleConfirmReturnedCash}
      onConfirmGoodsReturned={handleConfirmGoodsReturned}
      onReportNonReturn={handleReportNonReturn}
    />
  );

  if (orders.length === 0) {
    return (
      // M1·1's resting screen (r-merchant.jsx:149-153): the empty state carries the `inbox` glyph
      // above the title, in a card with the kit's own 16/20/26 padding and 30px top offset.
      <div style={{ background: "var(--bg)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: "16px 20px 26px", marginTop: 30, textAlign: "center", maxWidth: 420 }}>
        <span
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--surface)",
            display: "grid",
            placeItems: "center",
            margin: "8px auto 12px",
          }}
        >
          <Icon name="inbox" size={24} color="var(--muted)" />
        </span>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>No orders right now</div>
        <div style={{ fontSize: 13.5, color: "var(--muted)" }}>The alarm is armed — you&apos;ll hear it before you see it.</div>
      </div>
    );
  }

  const orderActions: OrderActions = { onMarkReady: handleMarkReady, onRevealPickupCode: handleRevealPickupCode };
  const columnProps = { disabled, onOpenHold: handleOpenHold, orderActions, moneyActions };

  if (!board) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {returnsSection}
        <Column title="New" tint="var(--accent)" items={newColumnItems} {...columnProps} />
        <Column title="Cooking" tint="var(--highlight)" items={cookingColumnItems} {...columnProps} />
        <Column title="Ready · waiting for rider" tint="var(--ink)" items={readyColumnItems} {...columnProps} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%", minHeight: 0 }}>
      {returnsSection}
      <div style={{ display: "flex", gap: 22, flex: 1, minHeight: 0 }}>
        <Column title="New" tint="var(--accent)" items={newColumnItems} {...columnProps} />
        <Column title="Cooking" tint="var(--highlight)" items={cookingColumnItems} {...columnProps} />
        <Column title="Ready · waiting for rider" tint="var(--ink)" items={readyColumnItems} {...columnProps} />
      </div>
    </div>
  );
}
