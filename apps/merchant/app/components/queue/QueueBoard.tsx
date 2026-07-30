"use client";

import { useState } from "react";
import type { MerchantOrderResponse, MerchantRejectionReasonCode } from "@lynia/shared";
import { PREP_CHIPS_MIN } from "@lynia/shared";
import { groupQueue, isNoRiderHold, isRiderSecured, shouldUseBoard } from "../../lib/order-groups";
import {
  acceptOrder,
  dispatchCancel,
  dispatchResume,
  markReady,
  rejectOrder,
  revealPickupCode,
} from "../../lib/orders-api";
import { NewOrderTakeover } from "./NewOrderTakeover";
import { NoRiderHoldTakeover } from "./NoRiderHoldTakeover";
import { OrderCard, type OrderCardBucket } from "./OrderCard";
import { RiderSecuredTakeover } from "./RiderSecuredTakeover";

function Column({
  title,
  tint,
  items,
  disabled,
  pickupCodes,
  revealingId,
  onMarkReady,
  onRevealPickupCode,
  onOpenHold,
}: {
  title: string;
  tint: string;
  items: { order: MerchantOrderResponse; bucket: OrderCardBucket }[];
  disabled: boolean;
  pickupCodes: Record<string, string>;
  revealingId: string | null;
  onMarkReady: (orderId: string) => void;
  onRevealPickupCode: (orderId: string) => void;
  onOpenHold: (order: MerchantOrderResponse) => void;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: tint }} />
        <span style={{ fontSize: 13, fontWeight: 800 }}>{title}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{items.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflow: "auto" }}>
        {items.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Nothing here</div>}
        {items.map(({ order, bucket }) => (
          <OrderCard
            key={order.id}
            order={order}
            bucket={bucket}
            disabled={disabled}
            pickupCode={pickupCodes[order.id]}
            revealingCode={revealingId === order.id}
            onMarkReady={onMarkReady}
            onRevealPickupCode={onRevealPickupCode}
            onOpenHold={onOpenHold}
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
export function QueueBoard({
  orders,
  disabled,
  refetch,
}: {
  orders: readonly MerchantOrderResponse[];
  disabled: boolean;
  refetch: () => void;
}) {
  const [ackSecuredIds, setAckSecuredIds] = useState<Set<string>>(new Set());
  const [ackHoldIds, setAckHoldIds] = useState<Set<string>>(new Set());
  const [openHoldId, setOpenHoldId] = useState<string | null>(null);
  const [pickupCodes, setPickupCodes] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const groups = groupQueue(orders);
  const board = shouldUseBoard(orders);

  const [active, ...queued] = groups.awaitingAccept;

  const securedToShow = groups.ready.find((o) => isRiderSecured(o) && !isNoRiderHold(o) && !ackSecuredIds.has(o.id)) ?? null;
  const holdCandidates = groups.ready.filter(isNoRiderHold);
  const holdToShow = openHoldId ? (holdCandidates.find((o) => o.id === openHoldId) ?? null) : (holdCandidates.find((o) => !ackHoldIds.has(o.id)) ?? null);

  async function handleAccept(orderId: string, prepMinutes: (typeof PREP_CHIPS_MIN)[number], unavailableDishIds: string[]) {
    await acceptOrder(orderId, { prepMinutes, unavailableDishIds: unavailableDishIds.length > 0 ? unavailableDishIds : undefined });
    refetch();
  }

  async function handleReject(orderId: string, reason: MerchantRejectionReasonCode) {
    await rejectOrder(orderId, reason);
    refetch();
  }

  function handleMarkReady(orderId: string) {
    void markReady(orderId).then(refetch);
  }

  function handleRevealPickupCode(orderId: string) {
    setRevealingId(orderId);
    void revealPickupCode(orderId)
      .then((res) => setPickupCodes((prev) => ({ ...prev, [orderId]: res.pickupCode })))
      .finally(() => setRevealingId(null));
  }

  function handleOpenHold(order: MerchantOrderResponse) {
    setOpenHoldId(order.id);
  }

  function handleHoldDismiss() {
    if (holdToShow) setAckHoldIds((prev) => new Set(prev).add(holdToShow.id));
    setOpenHoldId(null);
  }

  async function handleHoldResume(orderId: string) {
    await dispatchResume(orderId);
    setOpenHoldId(null);
    refetch();
  }

  async function handleHoldCancel(orderId: string) {
    await dispatchCancel(orderId);
    setOpenHoldId(null);
    refetch();
  }

  if (active) {
    return <NewOrderTakeover active={active} queued={queued} disabled={disabled} onAccept={handleAccept} onReject={handleReject} />;
  }

  if (securedToShow) {
    return <RiderSecuredTakeover order={securedToShow} onDismiss={() => setAckSecuredIds((prev) => new Set(prev).add(securedToShow.id))} />;
  }

  if (holdToShow) {
    return (
      <NoRiderHoldTakeover order={holdToShow} disabled={disabled} onResume={handleHoldResume} onCancel={handleHoldCancel} onHold={handleHoldDismiss} />
    );
  }

  const newColumnItems: { order: MerchantOrderResponse; bucket: OrderCardBucket }[] = [
    ...groups.awaitingItemApproval.map((order) => ({ order, bucket: "waiting" as const })),
    ...groups.awaitingPayment.map((order) => ({ order, bucket: "payment" as const })),
  ];
  const cookingColumnItems = groups.preparing.map((order) => ({ order, bucket: "preparing" as const }));
  const readyColumnItems = groups.ready.map((order) => ({ order, bucket: "ready" as const }));

  if (orders.length === 0) {
    return (
      <div style={{ background: "var(--bg)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: "16px 20px 26px", textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>No orders right now</div>
        <div style={{ fontSize: 13.5, color: "var(--muted)" }}>The alarm is armed — you&apos;ll hear it before you see it.</div>
      </div>
    );
  }

  const columnProps = { disabled, pickupCodes, revealingId, onMarkReady: handleMarkReady, onRevealPickupCode: handleRevealPickupCode, onOpenHold: handleOpenHold };

  if (!board) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Column title="New" tint="var(--accent)" items={newColumnItems} {...columnProps} />
        <Column title="Cooking" tint="var(--highlight)" items={cookingColumnItems} {...columnProps} />
        <Column title="Ready · waiting for rider" tint="var(--ink)" items={readyColumnItems} {...columnProps} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 22, height: "100%", minHeight: 0 }}>
      <Column title="New" tint="var(--accent)" items={newColumnItems} {...columnProps} />
      <Column title="Cooking" tint="var(--highlight)" items={cookingColumnItems} {...columnProps} />
      <Column title="Ready · waiting for rider" tint="var(--ink)" items={readyColumnItems} {...columnProps} />
    </div>
  );
}
