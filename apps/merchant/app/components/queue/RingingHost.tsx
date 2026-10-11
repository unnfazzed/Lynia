"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MerchantOrderResponse, MerchantRejectionReasonCode, PREP_CHIPS_MIN, SubstitutionProposalLine } from "@lynia/shared";
import { ApiError } from "../../lib/api-client";
import { useBranchEpoch } from "../../lib/branches";
import { acceptOrder, cancelPreparing, confirmKitchen, proposeSubstitution, rejectOrder } from "../../lib/orders-api";
import { orderLabel } from "../../lib/orders-view";
import { pickTakeover, takeoverCandidates } from "../../lib/takeover";
import { useKitchenConnection } from "../KitchenConnectionProvider";
import { useToast } from "../m/Toast";
import { RingingScreen } from "./RingingScreen";

/** MJ-M2 (C8): the reasons an auto-accepted order's "Can't take it" can carry to `POST …/cancel`. */
type CancelReason = "out_of_ingredient" | "out_of_stock" | "too_busy" | "closing_soon" | "other";
const CANCEL_REASONS: ReadonlySet<string> = new Set<CancelReason>(["out_of_ingredient", "out_of_stock", "too_busy", "closing_soon", "other"]);

/** MJ-M12: the toast for a ringing order that ended before anyone here answered it (ledger D-90). */
export const RING_ENDED = (label: string) => `${label} was cancelled`;

/**
 * K2 / S2 over whatever screen is open (C20 / MJ-B1; owner decision D4, ledger D-86). README T1b says "A
 * ringing order opens K2/S2 directly"; the ringing screen used to live on the Orders board alone, so a
 * merchant on a cooking ticket, the Rx check, hours or team never saw — or heard — a new order, and it was
 * cancelled `shop_closed`. Mounted once by the signed-in shell (`app/(app)/layout.tsx`), it reads the
 * provider's one queue poll; on the Orders board it is the same full-screen takeover as before.
 *
 * MJ-M10: the order being answered keeps the screen until it is resolved (`pickTakeover`); a newer ring
 * — or an older scheduled order that has just started ringing — waits its turn instead of remounting the
 * screen mid-tap. An order a screen answers itself (the Rx check, `holdTakeover`) never covers it.
 *
 * MJ-M12 (2026-10-07): an order that leaves the ring without being answered here used to vanish with the
 * screen. Now, when it goes: an answer this screen sent says its own toast; an answer the server refused
 * (a teammate's accept won the race, the customer cancelled first) toasts the server's sentence, which the
 * screen's alert would have shown had the screen stayed; and an order that left the queue altogether (the
 * customer cancelled, or the 24 h cap) toasts "#A1B2 was cancelled". A branch switch or sign-out says nothing.
 */
export function RingingHost() {
  const { session, queue, actionsDisabled, heldOrderIds } = useKitchenConnection();
  const { orders, loaded, refetch } = queue;
  const toast = useToast();
  const epoch = useBranchEpoch();
  const currentRef = useRef<string | null>(null);
  const active = session && loaded ? pickTakeover(takeoverCandidates(orders, heldOrderIds), currentRef.current) : null;

  // What the order on screen was (its label, the branch it rang on), and how this host's own answers went.
  const shownRef = useRef<{ order: MerchantOrderResponse; epoch: number } | null>(null);
  const answeredRef = useRef(new Set<string>());
  const refusedRef = useRef(new Map<string, string>());

  useEffect(() => {
    const shown = shownRef.current;
    if (shown && shown.order.id !== active?.id) {
      const id = shown.order.id;
      const refused = refusedRef.current.get(id);
      if (session && shown.epoch === epoch && !answeredRef.current.has(id)) {
        if (refused) toast(refused);
        else if (!orders.some((o) => o.id === id)) toast(RING_ENDED(orderLabel(shown.order)));
      }
      answeredRef.current.delete(id);
      refusedRef.current.delete(id);
    }
    shownRef.current = active ? { order: active, epoch: shown && shown.order.id === active.id ? shown.epoch : epoch } : null;
    currentRef.current = active?.id ?? null;
  });

  /** Runs one answer to `orderId`: a success marks it answered here; a refusal (not a dropped connection)
   *  is kept, so the toast can say it if the order leaves the ring with the screen. */
  const answer = useCallback(
    async (orderId: string, send: () => Promise<unknown>) => {
      try {
        await send();
        answeredRef.current.add(orderId);
        refusedRef.current.delete(orderId);
      } catch (err) {
        answeredRef.current.delete(orderId);
        if (err instanceof ApiError && err.status !== 0 && !err.validation) refusedRef.current.set(orderId, err.message);
        throw err;
      }
      await refetch();
    },
    [refetch],
  );

  const handleAccept = useCallback(
    (orderId: string, prepMinutes: (typeof PREP_CHIPS_MIN)[number], unavailableDishIds: string[]) =>
      answer(orderId, () => acceptOrder(orderId, { prepMinutes, unavailableDishIds: unavailableDishIds.length > 0 ? unavailableDishIds : undefined })),
    [answer],
  );
  const handleConfirm = useCallback((orderId: string) => answer(orderId, () => confirmKitchen(orderId)), [answer]);
  // MJ-M2 (C8): the reason and the note the reasons sheet promises the customer sees, not a bare cancel.
  const handleCancel = useCallback(
    (orderId: string, reason: MerchantRejectionReasonCode, note?: string) => {
      const why = (CANCEL_REASONS.has(reason) ? reason : "other") as CancelReason;
      return answer(orderId, () => cancelPreparing(orderId, note ? { reason: why, note } : { reason: why }));
    },
    [answer],
  );
  const handlePropose = useCallback(
    (orderId: string, prepMinutes: (typeof PREP_CHIPS_MIN)[number], lines: SubstitutionProposalLine[]) =>
      answer(orderId, () => proposeSubstitution(orderId, { lines, prepMinutes })),
    [answer],
  );
  const handleEditItems = useCallback(
    (orderId: string, lines: SubstitutionProposalLine[]) => answer(orderId, () => proposeSubstitution(orderId, { lines })),
    [answer],
  );
  const handleReject = useCallback(
    (orderId: string, reason: Parameters<typeof rejectOrder>[1], note?: string) => answer(orderId, () => rejectOrder(orderId, reason, note)),
    [answer],
  );

  if (!active) return null;
  return (
    <RingingScreen
      key={active.id}
      active={active}
      disabled={actionsDisabled}
      onAccept={handleAccept}
      onPropose={handlePropose}
      onReject={handleReject}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      onEditItems={handleEditItems}
      refetch={refetch}
    />
  );
}
