"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PREP_CHIPS_MIN, SubstitutionProposalLine } from "@lynia/shared";
import { acceptOrder, cancelPreparing, confirmKitchen, proposeSubstitution, rejectOrder } from "../../lib/orders-api";
import { pickTakeover, takeoverCandidates } from "../../lib/takeover";
import { useKitchenConnection } from "../KitchenConnectionProvider";
import { RingingScreen } from "./RingingScreen";

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
 */
export function RingingHost() {
  const { session, queue, actionsDisabled, heldOrderIds } = useKitchenConnection();
  const { orders, loaded, refetch } = queue;
  const currentRef = useRef<string | null>(null);
  const active = session && loaded ? pickTakeover(takeoverCandidates(orders, heldOrderIds), currentRef.current) : null;
  useEffect(() => {
    currentRef.current = active?.id ?? null;
  });

  const handleAccept = useCallback(
    async (orderId: string, prepMinutes: (typeof PREP_CHIPS_MIN)[number], unavailableDishIds: string[]) => {
      await acceptOrder(orderId, { prepMinutes, unavailableDishIds: unavailableDishIds.length > 0 ? unavailableDishIds : undefined });
      await refetch();
    },
    [refetch],
  );
  const handleConfirm = useCallback(
    async (orderId: string) => {
      await confirmKitchen(orderId);
      await refetch();
    },
    [refetch],
  );
  const handleCancel = useCallback(
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
