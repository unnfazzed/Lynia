import { tokens } from "@lynia/shared";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Icon } from "./Icon";

/**
 * UX20-01: the active-order check failing (not just returning "none") must be visible — a customer
 * with a genuine live order who hits a query error on this check would otherwise see zero indication
 * they may have an order in flight and zero way back to it (the same dead-end class BH-13 closed for
 * the rider board, here triggered by an error rather than a missed cache invalidation). Shared across
 * every screen that reads the `["activeCustomerOrder"]` query (send.tsx's compose home, the Home and
 * Orders tabs) so the fix can't drift between call sites.
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
