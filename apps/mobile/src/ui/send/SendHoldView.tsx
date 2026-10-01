import { SOS_POLICY } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Linking, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { telUri } from "../../logic/safety";
import { Icon } from "../Icon";
import { SEND_COPY, SendButton, SendHeader } from "./kit";

/**
 * Account on hold (ledger D-51; handoff state 17). Checked before step 1 opens: a held customer never
 * reaches the composer. The header keeps its Back (no step bar), the middle says what happened, and the
 * two ways out are a call to support and "Back to home". A hold only blocks composing NEW orders —
 * tracking an order already in flight still works from Home and Orders.
 */
export function SendHoldView({ onBack, onHome }: { onBack: () => void; onHome: () => void }): React.ReactElement {
  const insets = useSafeAreaInsets();
  const uri = telUri(SOS_POLICY.safetyLine);
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
      <SendHeader step={1} bar={false} onBack={onBack} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 12 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
          <Icon name="ban" size={32} color={tokens.color.danger} />
        </View>
        <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: tokens.font.weight.bold, lineHeight: 28, color: tokens.color.ink, textAlign: "center" }}>
          {SEND_COPY.holdT}
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 22, color: tokens.color.muted, textAlign: "center" }}>{SEND_COPY.holdB}</Text>
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 + insets.bottom, gap: 10 }}>
        {uri ? <SendButton icon="phone" label={SEND_COPY.call} onPress={() => void Linking.openURL(uri)} /> : null}
        <SendButton ghost label={SEND_COPY.home} onPress={onHome} />
      </View>
    </View>
  );
}
