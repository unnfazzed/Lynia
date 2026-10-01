import { formatPhoneLocal, SOS_POLICY } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { supportWhatsAppUrl } from "../../src/config";
import { Icon, Tappable } from "../../src/ui";
import { RIDER_COPY as R, RF } from "../../src/ui/rider/copy";
import { PushHeader, RCard, RRow, SectionLabel } from "../../src/ui/rider/kit";

/**
 * Help & support, rider side (Rider v2 S6, ledger D-54), from the rider Account. Message us on WhatsApp
 * (ok) · Call LyniaGo support, the 24-hour safety line on a danger-wash row, then COMMON QUESTIONS — each
 * question opens WhatsApp with that question written out (there is no help-article backend to fake).
 * The customer side keeps the gallery's Help hub (`app/help`).
 */
export default function RiderHelpScreen(): React.ReactElement {
  const router = useRouter();
  const wa = supportWhatsAppUrl();
  const dial = (phone: string): void => void Linking.openURL(`tel:${phone.replace(/\s/g, "")}`).catch(() => undefined);
  const ask = (text?: string): void => {
    if (!wa) {
      dial(SOS_POLICY.safetyLine);
      return;
    }
    void Linking.openURL(text ? `${wa}?text=${encodeURIComponent(text)}` : wa).catch(() => undefined);
  };
  const faqs = [R.hF1, R.hF2, R.hF3];

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <PushHeader title={R.tHelp} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 24, gap: 12 }} showsVerticalScrollIndicator={false}>
        <RCard>
          <RRow first icon="message-circle" tone="ok" label={R.hWa} sub={R.hWaS} onPress={() => ask()} />
          <RRow icon="phone" label={R.hCall} sub={RF.hCallS(formatPhoneLocal(SOS_POLICY.safetyLine))} onPress={() => dial(SOS_POLICY.safetyLine)} />
        </RCard>
        <Tappable
          onPress={() => dial(SOS_POLICY.safetyLine)}
          accessibilityRole="button"
          accessibilityLabel={`${R.hSafety}, ${R.hSafetyS}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, backgroundColor: tokens.color.dangerWash, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 }}
        >
          <Icon name="siren" size={22} color={tokens.color.dangerInk} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.dangerInk }}>{R.hSafety}</Text>
            <Text style={{ fontSize: 12, color: tokens.color.dangerInk }}>{R.hSafetyS}</Text>
          </View>
          <Icon name="phone" size={18} color={tokens.color.dangerInk} />
        </Tappable>
        <SectionLabel>{R.hFaq.toUpperCase()}</SectionLabel>
        <RCard>
          {faqs.map((q, i) => (
            <RRow key={q} first={i === 0} label={q} onPress={() => ask(q)} />
          ))}
        </RCard>
      </ScrollView>
    </View>
  );
}
