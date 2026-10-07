import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Image, KeyboardAvoidingView, Modal, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { RIDER_COPY as R } from "./copy";

/**
 * Order flow v2's rider deltas (packages/design/handoff/order-flow-v2, of-screens-mrg.js `note`,
 * `tickRow`, `camera`, `shutter`; README "TickRow 52 dp (box 24, r6)" and "Camera step: ink, r16
 * viewfinder with a dashed guide, white bottom panel, 72 dp shutter"; ledger D-59).
 */

/** `note(tone, icon, text)`: surface, highlight wash (`hi`) or mint (`ok`), an icon and a 13 line. */
export function OfNote({ tone, icon, text, bold }: { tone?: "hi" | "ok"; icon: IconName; text: string; bold?: boolean }): React.ReactElement {
  const bg = tone === "hi" ? tokens.color.highlightWash : tone === "ok" ? tokens.color.accentWash : tokens.color.surface;
  const fg = tone === "hi" ? tokens.color.highlightInk : tokens.color.ink;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: bg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Icon name={icon} size={18} color={tone === "hi" ? tokens.color.highlightInk : tokens.color.accentText} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: fg, fontWeight: bold ? tokens.font.weight.bold : tokens.font.weight.regular }}>{text}</Text>
    </View>
  );
}

/** TickRow: 52 high, a 24 box (r6) that fills green with a white check, the title 15/600, a muted sub. */
export function TickRow({ title, sub, on, onPress, disabled }: { title: string; sub?: string | null; on: boolean; onPress: () => void; disabled?: boolean }): React.ReactElement {
  return (
    <Tappable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: on ? 0 : 2,
          borderColor: tokens.color.line,
          backgroundColor: on ? tokens.color.accent : tokens.color.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {on ? <Icon name="check" size={16} color={tokens.color.onAccent} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{sub}</Text> : null}
      </View>
    </Tappable>
  );
}

/** The 72 shutter: a green ring around a 56 green disc with a white camera. */
export function Shutter({ onPress, disabled, label }: { onPress: () => void; disabled?: boolean; label: string }): React.ReactElement {
  return (
    <View style={{ alignItems: "center" }}>
      <Tappable
        testID="shutter"
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: tokens.color.accent, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.45 : 1 }}
      >
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
          <Icon name="camera" size={24} color={tokens.color.onAccent} />
        </View>
      </Tappable>
    </View>
  );
}

/**
 * The camera step (RD2b/RD2c/RD4d): an ink page, ✕ and the title on top, a r16 viewfinder with a dashed
 * guide — the shot once taken — and a white bottom panel holding the tick, the hint and the shutter (or,
 * once taken, Retake and the next step). The phone's own camera takes the picture (the shutter opens it).
 */
export function CameraStep({
  visible,
  title,
  photoUri,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  photoUri: string | null;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: tokens.color.ink }}>
        {/* A Modal is its own window, so Android's adjustResize never reaches it: lift the panel with
            padding instead, or the keyboard covers the "who took it" field and the shutter. */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 4 }}>
            <Tappable accessibilityRole="button" accessibilityLabel={R.close} onPress={onClose} style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, alignItems: "center", justifyContent: "center" }}>
              <Icon name="x" size={22} color={tokens.color.onAccent} />
            </Tappable>
            <Text accessibilityRole="header" style={{ flex: 1, marginRight: tokens.touchTargetMin, textAlign: "center", fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent }}>
              {title}
            </Text>
          </View>
          <View style={{ flex: 1, minHeight: 96, marginHorizontal: 16, marginTop: 12, marginBottom: 16, borderRadius: 16, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)" }}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} resizeMode="cover" style={{ flex: 1 }} accessibilityLabel={title} />
            ) : (
              <View style={{ position: "absolute", top: 24, left: 24, right: 24, bottom: 24, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: tokens.color.line }} />
            )}
          </View>
          {/* The panel scrolls past ~two thirds of the screen, so a large font scale can't push the shutter
              off the bottom or squeeze the viewfinder to nothing. */}
          <SafeAreaView edges={["bottom"]} style={{ maxHeight: "68%", backgroundColor: tokens.color.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 }}>
              {children}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
