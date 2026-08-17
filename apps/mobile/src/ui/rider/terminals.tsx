import { type UndeliveredReason } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import type { OrderSnapshot } from "../../api/orders";
import { UNDELIVERED_LABEL } from "../../logic/rider-job";
import { Button, Card, Heading, Icon, Screen, StatusPill } from "../index";

/**
 * Terminal screens for the rider job flow — full-screen end states rendered in place of the live
 * collect/deliver flow (extracted verbatim from app/rider/job.tsx).
 */

// Terminal: the customer or ops cancelled. Rendered from a frozen snapshot (keeps the sender contact
// after the order leaves the active feed).
export function CancelledHandback({
  collected,
  cancelledBy,
  snapshot,
  onBack,
}: {
  collected: boolean;
  /** Who actually cancelled — an admin cancel must not read as the customer's own choice. */
  cancelledBy: "customer" | "admin";
  snapshot: OrderSnapshot;
  onBack: () => void;
}): React.ReactElement {
  const senderPhone = snapshot.counterpartyPhone ?? snapshot.pickup.contactPhone ?? null;
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Your job</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status="cancelled" tone="offline" dot />
        </View>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.dangerWash, alignItems: "center", justifyContent: "center" }}>
              <Icon name="circle-alert" size={18} color={tokens.color.danger} />
            </View>
            <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.danger }}>
              {cancelledBy === "admin" ? "LyniaGo cancelled this delivery" : "The customer cancelled"}
            </Text>
          </View>
          {collected ? (
            <>
              <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginBottom: tokens.space.sm }}>
                This job has ended. You still have the parcel — arrange the hand-back directly with the sender. This doesn&apos;t affect your reliability score.
              </Text>
              {senderPhone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${senderPhone}`)}
                  accessibilityRole="button"
                  accessibilityLabel="Call sender"
                  style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
                >
                  <Icon name="phone" size={16} color={tokens.color.accentText} />
                  <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>Call sender · {senderPhone}</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20 }}>
              Cancelled before pickup — you&apos;re simply free. No parcel, straight back to the board.
            </Text>
          )}
        </Card>
        {/* Record that this parcel was handed back so the 24h reopen window doesn't re-prompt the
            rider on their next visit — then drop back to the board (wired via onBack). */}
        <Button label="Back to board" onPress={onBack} />
      </ScrollView>
    </Screen>
  );
}

// Terminal: the rider recorded a failed hand-off (R1). Frozen locally — an `undelivered` order leaves
// the active-job feed, so a refetch would drop to "No active job" with no acknowledgement.
export function UndeliveredDone({ reason, onBack }: { reason: UndeliveredReason; onBack: () => void }): React.ReactElement {
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Your job</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status="undelivered" tone="offline" dot />
        </View>
        <Card>
          {/* The kit's terminal grammar (`rider-screens.jsx` Undelivered): an icon in a danger-wash
              circle carries the bad news, so the headline never has to shout it in red alone. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.dangerWash, alignItems: "center", justifyContent: "center" }}>
              <Icon name="circle-alert" size={18} color={tokens.color.danger} />
            </View>
            <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.danger }}>
              Couldn&apos;t deliver
            </Text>
          </View>
          <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20 }}>
            Recorded as &ldquo;{UNDELIVERED_LABEL[reason]}&rdquo;. The customer has been told. You&apos;re free for the next job.
          </Text>
        </Card>
        {/* The parcel doesn't vanish with the job — the kit says where it stands before the exit. */}
        <View style={{ flexDirection: "row", gap: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, marginBottom: tokens.space.md }}>
          <Icon name="triangle-alert" size={15} color={tokens.color.muted} />
          <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
            The parcel is still with you — arrange its return directly with the customer. Settled off-platform.
          </Text>
        </View>
        <Button label="Back to board" onPress={onBack} />
      </ScrollView>
    </Screen>
  );
}
