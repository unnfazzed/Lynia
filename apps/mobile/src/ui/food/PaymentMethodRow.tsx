import { tokens } from "@lynia/shared/tokens";
import { Tappable } from "../Tappable";
import React from "react";
import { Text, View } from "react-native";
import { Icon, type IconName } from "../Icon";

/**
 * D2 checkout — a selectable CASH/WALLET row (r-customer-a.jsx RC.checkout_cash/checkout_wallet
 * anatomy): a 1.5px accent border + accent wash when selected, a filled accent circle-check trailing
 * it; an unselected row gets a plain 1px line border and an empty ring. Mirrors the same
 * accent-selected-state convention `[id].tsx`'s category tabs already use — no new pattern.
 */
export function PaymentMethodRow({
  icon,
  title,
  subtitle,
  selected,
  onPress,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  /** Extra content shown only while selected (e.g. R4·2's "you pay only after they accept" note). */
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}: ${subtitle}`}
      style={{
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? tokens.color.accent : tokens.color.line,
        backgroundColor: selected ? tokens.color.accentWash : tokens.color.bg,
        borderRadius: tokens.radius.input,
        padding: tokens.space.md,
        marginBottom: tokens.space.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}>
        <Icon name={icon} size={20} color={selected ? tokens.color.accentText : tokens.color.muted} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14.5, fontWeight: "700", color: tokens.color.ink }}>{title}</Text>
          <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 1 }}>{subtitle}</Text>
        </View>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: selected ? tokens.color.accent : "transparent",
            borderWidth: selected ? 0 : 2,
            borderColor: tokens.color.line,
          }}
        >
          {selected ? <Icon name="check" size={13} color={tokens.color.onAccent} /> : null}
        </View>
      </View>
      {selected && children ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: tokens.space.sm, paddingTop: tokens.space.sm, borderTopWidth: 1, borderTopColor: tokens.color.line }}>
          {children}
        </View>
      ) : null}
    </Tappable>
  );
}
