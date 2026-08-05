import { tokens } from "@lynia/shared";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Button, Heading, Icon, type IconName, Sub } from "../index";

/**
 * A1-8 pre-broadcast liability disclaimer — an accept-to-continue sheet shown before the first order
 * is created. The primary "Agree & broadcast" stays disabled until the customer ticks the consent
 * box; agreeing records consent (policy version + timestamp) and proceeds. Modeled on the
 * new-flows.html disclaimer: three plain-language terms, then a mint consent row.
 */
const DISCLAIMER_ROWS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "triangle-alert",
    title: "Sending is at your own risk",
    body: "If your parcel is lost, damaged or not delivered, LyniaGo isn't liable — you're hiring an independent rider.",
  },
  {
    icon: "banknote",
    title: "Payment is between you and your rider",
    body: "You agree the price in the app and pay cash directly. LyniaGo isn't involved in payment or any money dispute.",
  },
  {
    icon: "user",
    title: "LyniaGo connects you — that's all",
    body: "We match you with a nearby rider. We don't carry, insure or guarantee your parcel.",
  },
];

export function DisclaimerSheet({ visible, onAgree, onBack }: { visible: boolean; onAgree: () => void; onBack: () => void }): React.ReactElement {
  const [checked, setChecked] = useState(false);
  // Reset the consent tick each time the sheet opens — consent is per-broadcast, never pre-ticked.
  useEffect(() => {
    if (visible) setChecked(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onBack} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(20,24,27,0.45)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: tokens.color.bg,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: tokens.space.lg,
            paddingTop: tokens.space.md,
            paddingBottom: tokens.space.xl,
            maxHeight: "94%",
            ...tokens.shadow.sheet,
          }}
        >
          <View style={{ width: 36, height: 4, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.line, alignSelf: "center", marginBottom: tokens.space.md }} />
          <Heading>Before you send</Heading>
          <Sub>Please read and accept — this is how LyniaGo works.</Sub>
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            {DISCLAIMER_ROWS.map((r) => (
              <View key={r.title} style={{ flexDirection: "row", gap: tokens.space.md, marginBottom: tokens.space.md }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={r.icon} size={17} color={tokens.color.accentText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{r.title}</Text>
                  <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18, marginTop: 1 }}>{r.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => setChecked((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel="I understand and accept these terms"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tokens.space.sm,
              padding: tokens.space.md,
              borderRadius: tokens.radius.input,
              backgroundColor: tokens.color.accentWash,
              marginTop: tokens.space.xs,
              minHeight: tokens.touchTargetMin,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                // Bright accent is a non-text fill here (the tick box) — the check glyph is white on it.
                backgroundColor: checked ? tokens.color.accent : tokens.color.bg,
                borderWidth: checked ? 0 : 1.5,
                borderColor: tokens.color.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {checked ? <Icon name="check" size={14} color={tokens.color.onAccent} /> : null}
            </View>
            <Text style={{ flex: 1, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
              I understand and accept these terms
            </Text>
          </Pressable>
          {/* Kit copy (screens.jsx:504) — "Agree & broadcast", matching the composer's own CTA. */}
          <Button label="Agree & broadcast" onPress={onAgree} disabled={!checked} />
          <Button label="Back" variant="ghost" onPress={onBack} />
        </View>
      </View>
    </Modal>
  );
}
