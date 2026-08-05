import { tokens } from "@lynia/shared";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { clearActiveOrderHint, loadActiveOrderHint, saveActiveOrderHint } from "../net/last-active-store";
import { Icon } from "./Icon";

/**
 * UX-2026-08-05: decides whether a failed active-order check is worth a banner at all. UX20-01's rule
 * (an error must not silently collapse to the same UI as "no active order") originally rendered the
 * banner on EVERY query error — but for the overwhelmingly common case (nothing in flight, flaky
 * link) that meant a permanent danger banner + Retry camped at the top of Home/Orders/Send while the
 * customer composed a brand-new order, re-erroring every 30s poll (user report, 2026-08-05). The
 * check is a background safety net that already self-heals (refetchInterval + refetchOnReconnect), so
 * its failure is only worth interrupting for when the way back might genuinely be needed: gate on the
 * persisted single-slot hint written at broadcast success / whenever a screen observes a live order
 * (net/last-active-store). This is NOT a UX20-01 regression: with the hint present the banner renders
 * exactly as before; without it the device has positive evidence no order was in flight.
 *
 * Bookkeeping lives here (not in the screens) so the rule can't drift between call sites: a check
 * that settles on a live order refreshes the hint; one that authoritatively returns "none" clears it.
 * Residual risk, accepted: a live-order customer whose keystore write failed AND whose link is flaky
 * sees no banner — the poll/reconnect refetch still restores their LiveOrderCard the moment the link
 * heals.
 */
export function useActiveOrderCheckGate(q: { isError: boolean; isSuccess: boolean; data?: { id: string } | null }): boolean {
  const [maybeInFlight, setMaybeInFlight] = useState(false);
  // Set once the query itself has answered (either way) — a slow initial hint read resolving AFTER a
  // fast authoritative "none" must not re-arm the gate with the stale pre-clear value it read.
  const answered = useRef(false);
  useEffect(() => {
    let alive = true;
    void loadActiveOrderHint().then((id) => {
      if (alive && id && !answered.current) setMaybeInFlight(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  const dataId = q.data?.id ?? null;
  useEffect(() => {
    if (dataId) {
      answered.current = true;
      setMaybeInFlight(true);
      void saveActiveOrderHint(dataId);
    } else if (q.isSuccess) {
      answered.current = true;
      setMaybeInFlight(false);
      void clearActiveOrderHint();
    }
  }, [q.isSuccess, dataId]);
  return q.isError && maybeInFlight;
}

/**
 * UX20-01: the active-order check failing (not just returning "none") must be visible — a customer
 * with a genuine live order who hits a query error on this check would otherwise see zero indication
 * they may have an order in flight and zero way back to it (the same dead-end class BH-13 closed for
 * the rider board, here triggered by an error rather than a missed cache invalidation). Shared across
 * every screen that reads the `["activeCustomerOrder"]` query (send.tsx's compose home, the Home and
 * Orders tabs) so the fix can't drift between call sites. Render it behind `useActiveOrderCheckGate`
 * above, never bare `isError` — see that hook's rationale.
 */
export function ActiveOrderCheckFailedBanner({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }): React.ReactElement {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.sm,
        backgroundColor: tokens.color.bg,
        borderRadius: tokens.radius.card,
        borderWidth: 1,
        borderColor: tokens.color.danger,
        padding: tokens.space.md,
        marginBottom: tokens.space.sm,
        ...tokens.shadow.card,
      }}
    >
      <Icon name="wifi-off" size={20} color={tokens.color.danger} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: tokens.font.size.body, fontWeight: "700", color: tokens.color.ink }}>
          Couldn&apos;t check for an active order
        </Text>
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted }}>
          If you have a delivery in progress, retry to find your way back to it.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry"
        onPress={onRetry}
        disabled={retrying}
        style={({ pressed }) => ({
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.button,
          paddingHorizontal: tokens.space.md,
          minHeight: tokens.touchTargetMin,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? tokens.color.accentWash : "transparent",
        })}
      >
        {retrying ? (
          <ActivityIndicator color={tokens.color.accentText} />
        ) : (
          <Text style={{ color: tokens.color.accentText, fontWeight: tokens.font.weight.semibold, fontSize: tokens.font.size.body }}>Retry</Text>
        )}
      </Pressable>
    </View>
  );
}
