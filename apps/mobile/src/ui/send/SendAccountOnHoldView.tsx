import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import type { OrderSnapshot } from "../../api/orders";
import { ACCOUNT_ON_HOLD_COPY } from "../../logic/gates";
import { formatMoney } from "../../logic/money";
import { ActiveOrderCheckFailedBanner, Button, EmptyState, Icon, Screen, statusPillLabel } from "../index";
import { SupportCallRow } from "../safety";

/**
 * The "delivery in progress" restore banner — the always-available way back into a live order the
 * customer may have been killed away from (UX review #1). Extracted so both the normal compose home
 * AND the account-on-hold wall can render it: a hold only blocks composing NEW orders server-side, so a
 * customer put on hold mid-delivery must still be able to reach the order already in flight.
 */
export function ActiveOrderBanner({ order }: { order: OrderSnapshot }): React.ReactElement {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open your delivery in progress"
      onPress={() => router.push(`/order/${order.id}`)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.sm,
        backgroundColor: tokens.color.bg,
        borderRadius: tokens.radius.card,
        borderWidth: 1,
        borderColor: tokens.color.accent,
        padding: tokens.space.md,
        marginBottom: tokens.space.sm,
        ...tokens.shadow.card,
      }}
    >
      <Icon name="bike" size={20} color={tokens.color.accentText} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: tokens.font.size.body, fontWeight: "700", color: tokens.color.ink }}>
          Delivery in progress · {statusPillLabel(order.status)}
        </Text>
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
          {order.pickup.landmark || "Pickup"} → {order.dropoff.landmark || "Drop-off"} · {formatMoney(order.agreedFare ?? order.proposedFare)}
        </Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.accentText }}>Track</Text>
    </Pressable>
  );
}

/**
 * RF-21: the `accountOnHold` early-return of app/send.tsx, extracted verbatim (see
 * docs/RF-21-SEND-SCREEN.md). S·2: a held customer can't broadcast — show a calm, blocking screen
 * (not the compose form) with a real "contact support" affordance, matching the mockup's OnHold.
 * Overrides the whole home so a held customer never reaches the map/compose UI.
 */
export function SendAccountOnHoldView({
  activeOrder,
  activeOrderIsError,
  activeOrderIsFetching,
  onRetryActiveOrder,
  meIsFetching,
  onRefreshStatus,
}: {
  activeOrder: OrderSnapshot | null;
  activeOrderIsError: boolean;
  activeOrderIsFetching: boolean;
  onRetryActiveOrder: () => void;
  meIsFetching: boolean;
  onRefreshStatus: () => void;
}): React.ReactElement {
  return (
    <Screen>
      {/* A hold blocks composing NEW orders server-side, not viewing/tracking/cancelling/rating an order
          already in flight (getSnapshot/cancel/rating all still work for a held customer). So a customer
          put on hold mid-delivery keeps a way into that live order — the only nav entry point on this
          headerless screen — rather than being locked out of it entirely by the wall below. */}
      {activeOrder ? (
        <ActiveOrderBanner order={activeOrder} />
      ) : activeOrderIsError ? (
        <ActiveOrderCheckFailedBanner onRetry={onRetryActiveOrder} retrying={activeOrderIsFetching} />
      ) : null}
      <EmptyState icon="triangle-alert" title={ACCOUNT_ON_HOLD_COPY.title} message={ACCOUNT_ON_HOLD_COPY.message}>
        <SupportCallRow />
        <Button label="Refresh status" variant="ghost" onPress={onRefreshStatus} loading={meIsFetching} />
      </EmptyState>
    </Screen>
  );
}
