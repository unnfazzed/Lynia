import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import type { OrderSnapshot } from "../../api/orders";
import { useAuth } from "../../auth/auth-context";
import { ACCOUNT_ON_HOLD_COPY } from "../../logic/gates";
import { formatMoney } from "../../logic/money";
import { Button, EmptyState, Icon, Screen, statusPillLabel } from "../index";
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
export function SendAccountOnHoldView({ activeOrder }: { activeOrder: OrderSnapshot | null }): React.ReactElement {
  const { signOut } = useAuth();
  return (
    <Screen>
      {/* A hold blocks composing NEW orders server-side, not viewing/tracking/cancelling/rating an order
          already in flight (getSnapshot/cancel/rating all still work for a held customer). So a customer
          put on hold mid-delivery keeps a way into that live order — the only nav entry point on this
          headerless screen — rather than being locked out of it entirely by the wall below. */}
      {activeOrder ? <ActiveOrderBanner order={activeOrder} /> : null}
      {/* No "Refresh status" (owner instruction 2026-08-16 — nothing in the app asks the user to refresh
          by hand any more). A lift is an ops action landing server-side, so the screen watches for it
          itself: app/send.tsx polls ["me"] while the hold stands and re-reads it on every app foreground,
          which is strictly more current than a button the customer had to remember to press. */}
      <EmptyState icon="triangle-alert" title={ACCOUNT_ON_HOLD_COPY.title} message={ACCOUNT_ON_HOLD_COPY.message}>
        <SupportCallRow />
        {/* The kit's OnHold (`screens.jsx:852`) draws a "Sign out" ghost button under the call row, and
            the app had dropped it — which is what made this wall a true dead end. /send is PUSHED, so
            no tab bar shows; app/send.tsx returns this view BEFORE the map top bar renders, so the D-14
            back puck never mounts for a held customer; and with the manual "Refresh status" gone there
            was nothing left to tap but a phone number. Restoring the drawn control is not a new
            affordance, it is the app paying back drift — and it is the honest one: a hold is lifted by
            ops server-side, so the only thing a held customer can actually DO here is call, or leave. */}
        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      </EmptyState>
    </Screen>
  );
}
