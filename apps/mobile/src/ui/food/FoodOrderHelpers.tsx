import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon, StatusPill } from "../index";

/** Shared header row (back + restaurant name + status pill) reused across every phase/status branch of
 *  the food order tracking screen (app/food/order/[orderId].tsx) and its extracted terminal-state views.
 *
 *  The back chevron is this header's own (ledger D-18). The kit's `OrderHead` (`r-customer-b.jsx:10`)
 *  draws name + pill and nothing else — correct for a mock drawn as a standalone board, wrong for the
 *  shipped screen, which is PUSHED from the Orders tab (`app/(tabs)/orders.tsx:162`) with no tab bar and
 *  `headerShown:false` on both stacks. Eight of this screen's twelve state views drew no exit of any
 *  kind, including the safety-net fallback whose own comment claims it exists so the screen "never
 *  dead-ends". Owning the affordance here fixes all of them at once and cannot drift back apart, since
 *  every branch already renders this header. */
export function OrderHeader({
  restaurantName,
  pillLabel,
  pillTone,
}: {
  restaurantName: string;
  pillLabel: string;
  pillTone: "neutral" | "highlight" | "success";
}): React.ReactElement {
  const router = useRouter();
  // Pop when there is a stack; a push notification or deep link into a live order can make this the
  // first route, and landing on the orders list is the honest destination for "leave this order".
  const goBack = useCallback((): void => {
    if (router.canGoBack()) router.back();
    else router.replace("/orders");
  }, [router]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: 12 }}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => ({ width: 32, height: 32, marginLeft: -4, alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: pressed ? 0.6 : 1 })}
      >
        {/* Same 32px footprint + hitSlop trade, flipped glyph, and wrapper-View rotation as shell/AppBar
            and the D-14 puck — react-native-web drops a transform set on the glyph itself. */}
        <View style={{ transform: [{ rotate: "180deg" }] }}>
          <Icon name="chevron-right" size={20} color={tokens.color.ink} />
        </View>
      </Pressable>
      <Text style={{ flex: 1, fontSize: 19, fontWeight: "700" }} numberOfLines={1}>
        {restaurantName}
      </Text>
      <StatusPill status={pillLabel} tone={pillTone} />
    </View>
  );
}

/** Shared label/value summary row reused across the food order tracking screen and its extracted
 *  terminal-state views. */
export function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: "500", color: tokens.color.muted }}>{label}</Text>
      <Text style={{ fontSize: 14.5, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}
