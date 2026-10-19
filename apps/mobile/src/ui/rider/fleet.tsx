import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Icon } from "../Icon";
import { Tappable } from "../Tappable";
import { CtaButton, IconDisc } from "../order/kit";
import { km } from "./copy";
import { OBB } from "./fleet-copy";
import { TABULAR } from "./kit";

/**
 * Own bikers v1 (`packages/design/handoff/own-bikers-v1/`, ledger D-117) · the biker's board parts: the
 * "Chicken Inn job" tag, the count row and its ring hint, the pin label, the Join card (OB-R2/R3) and the
 * invite strip (OB-R1). Fleet cards are previews: a fleet job rings one biker at a time, full screen (OB-R7), so
 * the card has no fare, no chevron and no button.
 */

/** 20 tall, radius 6, 11/700, accent wash: a store mark and "Chicken Inn job". */
/** `wide`: the offer draws it across the sheet (OB-R7). */
export function FleetTag({ shop, wide }: { shop: string; wide?: boolean }): React.ReactElement {
  return (
    <View
      style={{
        height: 20,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 7,
        borderRadius: 6,
        backgroundColor: tokens.color.accentWash,
        alignSelf: wide ? "stretch" : "flex-start",
        flexShrink: 0,
      }}
    >
      <Icon name="store" size={12} color={tokens.color.accentText} />
      <Text
        style={{
          fontSize: 11,
          fontWeight: tokens.font.weight.bold,
          letterSpacing: 0.22,
          color: tokens.color.accentText,
        }}
        numberOfLines={1}
      >
        {OBB.fleetTag(shop)}
      </Text>
    </View>
  );
}

/** "Chicken Inn jobs" with the count pill (none while loading). */
export function FleetCountRow({ shop, count }: { shop: string; count: number | null }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{
          flex: 1,
          fontSize: 17,
          fontWeight: tokens.font.weight.bold,
          color: tokens.color.ink,
        }}
      >
        {OBB.fleetJobs(shop)}
      </Text>
      {count != null ? (
        <View
          style={{
            height: 24,
            minWidth: 24,
            paddingHorizontal: 8,
            borderRadius: tokens.radius.pill,
            backgroundColor: tokens.color.accentWash,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: tokens.font.weight.bold,
              color: tokens.color.accentText,
              ...TABULAR,
            }}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** "Chicken Inn jobs ring full screen. Keep LyniaGo open." */
export function FleetRingsHint({ shop }: { shop: string }): React.ReactElement {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: -4,
      }}
    >
      <Icon name="volume-2" size={16} color={tokens.color.muted} />
      <Text
        style={{
          flex: 1,
          fontSize: 13,
          lineHeight: 18,
          color: tokens.color.muted,
        }}
      >
        {OBB.ringsHint(shop)}
      </Text>
    </View>
  );
}

/** J7 for the fleet: the calm notice with the auto-retry time, a spinner in place of the icon. No Retry button. */
export function FleetLoadFail({ shop }: { shop: string }): React.ReactElement {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: tokens.color.surface,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
      }}
    >
      <ActivityIndicator size={16} color={tokens.color.muted} />
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          lineHeight: 20,
          color: tokens.color.ink,
        }}
      >
        {OBB.loadFail(shop)}
      </Text>
    </View>
  );
}

/** A loading card in the real layout (J7 skeleton). */
export function FleetSkeletonCard(): React.ReactElement {
  const bar = (w: `${number}%`, h: number, r = 4) => (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: r,
        backgroundColor: tokens.color.surface,
      }}
    />
  );
  return (
    <View
      testID="fleet-skeleton"
      style={{
        borderWidth: 1,
        borderColor: tokens.color.line,
        borderRadius: 12,
        padding: 12,
        gap: 8,
      }}
    >
      {bar("46%", 20, 6)}
      {bar("80%", 14)}
      {bar("70%", 14)}
      {bar("40%", 12)}
    </View>
  );
}

/** The map pin's label: a store mark and the distance ("0.4 km"), in place of a fare. */
export function FleetPinLabel({ toPickupKm, selected }: { toPickupKm: number | null; selected: boolean }): React.ReactElement {
  const fg = selected ? tokens.color.onAccent : tokens.color.ink;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon name="store" size={12} color={fg} />
      <Text
        style={{
          fontSize: 12,
          fontWeight: tokens.font.weight.bold,
          color: fg,
          ...TABULAR,
        }}
      >
        {toPickupKm != null ? km(toPickupKm) : "—"}
      </Text>
    </View>
  );
}

/** OB-R1: the invite waits for the ID check ("Chicken Inn Avondale invited you · finish your ID check to join"). */
export function FleetInviteWaiting({ shop }: { shop: string }): React.ReactElement {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: tokens.color.surface,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
      }}
    >
      <Icon name="store" size={16} color={tokens.color.muted} />
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          lineHeight: 20,
          color: tokens.color.ink,
        }}
      >
        {OBB.invitedWait(shop)}
      </Text>
    </View>
  );
}

/**
 * OB-R2/R3: "Chicken Inn Avondale wants you on their bikers", Join (52 primary) and Not now; while joining the
 * primary spins "Joining…"; a refusal (shop staff, in another fleet, invite ended) replaces Join with the server's
 * sentence on the danger wash, leaving Not now.
 */
export function FleetJoinCard({
  shop,
  joining,
  refusal,
  onJoin,
  onNotNow,
}: {
  shop: string;
  joining: boolean;
  refusal: string | null;
  onJoin: () => void;
  onNotNow: () => void;
}): React.ReactElement {
  return (
    <View
      style={{
        backgroundColor: tokens.color.accentWash,
        borderRadius: 16,
        padding: 14,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: tokens.color.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="store" size={20} color={tokens.color.accentText} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            accessibilityRole="header"
            style={{
              fontSize: 16,
              lineHeight: 21,
              fontWeight: tokens.font.weight.bold,
              color: tokens.color.ink,
            }}
          >
            {OBB.joinT(shop)}
          </Text>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: tokens.color.muted,
              marginTop: 4,
            }}
          >
            {OBB.joinB(shop)}
          </Text>
        </View>
      </View>
      {refusal ? (
        <View
          accessibilityRole="alert"
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            backgroundColor: tokens.color.dangerWash,
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 12,
          }}
        >
          <View style={{ paddingTop: 2 }}>
            <Icon name="circle-alert" size={16} color={tokens.color.dangerInk} />
          </View>
          <Text
            style={{
              flex: 1,
              fontSize: 14,
              lineHeight: 20,
              color: tokens.color.dangerInk,
            }}
          >
            {refusal}
          </Text>
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        {refusal ? null : <CtaButton label={joining ? OBB.joining : OBB.join} loading={joining} disabled={joining} onPress={onJoin} />}
        <FleetBtn2 label={OBB.notNow} disabled={joining} onPress={onNotNow} />
      </View>
    </View>
  );
}

/** The kit's secondary (`btn2`): 48 tall, 1px line, no fill, ink 15/700 — "Not now" on the wash. */
export function FleetBtn2({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }): React.ReactElement {
  return (
    <Tappable
      tone="row"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        minHeight: 48,
        borderRadius: tokens.radius.pill,
        borderWidth: 1,
        borderColor: tokens.color.line,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
      }}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: tokens.font.weight.bold,
          color: disabled ? tokens.color.muted : tokens.color.ink,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Tappable>
  );
}

/** OB-R1's page under the invite strip: first run's 72 disc, "Your ID is under review" 22/700, the line 15/22. */
export function FleetIdPending(): React.ReactElement {
  return (
    <View
      style={{
        alignItems: "center",
        gap: 12,
        paddingTop: 72,
        paddingHorizontal: 8,
      }}
    >
      <IconDisc name="clock" size={72} />
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 22,
          lineHeight: 28,
          fontWeight: tokens.font.weight.bold,
          color: tokens.color.ink,
          textAlign: "center",
        }}
      >
        {OBB.gPendingT}
      </Text>
      <Text
        style={{
          fontSize: 15,
          lineHeight: 22,
          color: tokens.color.muted,
          textAlign: "center",
        }}
      >
        {OBB.gPendingB}
      </Text>
    </View>
  );
}
