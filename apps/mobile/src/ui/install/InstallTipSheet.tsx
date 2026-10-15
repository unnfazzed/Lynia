import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Modal, Platform, ScrollView, Text, View, type TextStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton, TextLinkButton } from "../firstrun/actions";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { installTipCopy as C } from "./copy";
import type { InstallSheetVariant } from "./useInstallTip";

/** §2.1 scrim. */
const SCRIM = "rgba(20,24,27,0.5)";
const ELLIPSIS = "···";
/** §2.1 title `text-wrap: balance`. CSS only (react-native-web passes it through); native has no equivalent. */
const BALANCE = (Platform.OS === "web" ? { textWrap: "balance" } : {}) as TextStyle;

/**
 * The customer web app's Add to Home Screen sheet (handoff download-qr-install-tip-2026-10 §2.1, §2.2,
 * §2.5): "default" over Home from 360 wide, "small" below 360 (no tracker, shorter copy), "launched" once
 * the App Store app exists. Copy is ./copy.ts, verbatim. Generic Lucide icons only: no Apple logo, no
 * Safari UI.
 */
export function InstallTipSheet({
  variant,
  onDismiss,
  onAppStore,
}: {
  variant: InstallSheetVariant | null;
  onDismiss: () => void;
  onAppStore: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const small = variant === "small";
  const launched = variant === "launched";
  return (
    <Modal visible={variant != null} transparent animationType="slide" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={C.sheet.closeLabel}
          onPress={onDismiss}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: SCRIM }}
        />
        <View
          testID="install-tip-sheet"
          accessibilityViewIsModal
          style={{
            maxHeight: "92%",
            backgroundColor: tokens.color.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: small ? 8 : 10,
            paddingBottom: (small ? 18 : 24) + insets.bottom,
          }}
        >
          {/* Side padding inside the scroll content, so the ✕ can sit in it (header margin −8) unclipped. */}
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: small ? 12 : 14, paddingHorizontal: small ? 16 : 20 }}>
            <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: tokens.color.line }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: -2, marginRight: -8, marginBottom: -6 }}>
              {launched ? <DeliveredBadge /> : <SunChip label={small ? C.sheetSmall.chip : C.sheet.chip} />}
              <Tappable
                tone="icon"
                accessibilityRole="button"
                accessibilityLabel={C.sheet.closeLabel}
                onPress={onDismiss}
                style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="x" size={24} color={tokens.color.ink} />
              </Tappable>
            </View>
            <Text
              accessibilityRole="header"
              style={[{ fontSize: small ? 22 : 24, lineHeight: small ? 25.3 : 27.6, letterSpacing: small ? -0.55 : -0.6, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }, BALANCE]}
            >
              {launched ? C.launched.title : small ? C.sheetSmall.title : C.sheet.title}
            </Text>
            <Text style={{ fontSize: small ? 14 : 15, lineHeight: small ? 20.3 : 21.75, color: tokens.color.muted }}>
              {launched ? C.launched.body : small ? C.sheetSmall.body : C.sheet.body}
            </Text>
            {small ? null : <Tracker labels={launched ? C.launched.tracker : C.sheet.tracker} arrived={launched} />}
            {launched ? null : <Steps small={small} />}
            {launched ? (
              <View style={{ gap: 4 }}>
                <PrimaryButton label={C.launched.primary} onPress={onAppStore} testID="install-tip-app-store" />
                <TextLinkButton label={C.launched.secondary} onPress={onDismiss} testID="install-tip-keep-web" />
              </View>
            ) : (
              <PrimaryButton label={small ? C.sheetSmall.primary : C.sheet.primary} onPress={onDismiss} testID="install-tip-primary" />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SunChip({ label }: { label: string }): React.ReactElement {
  return (
    <View style={{ height: 26, paddingHorizontal: 10, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.highlight, justifyContent: "center" }}>
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.highlightChipInk }}>{label}</Text>
    </View>
  );
}

function DeliveredBadge(): React.ReactElement {
  return (
    <View style={{ height: 28, paddingHorizontal: 8, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.accentWash, flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon name="check" size={16} color={tokens.color.accentText} />
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{C.launched.chip}</Text>
    </View>
  );
}

type Dot = "done" | "current" | "todo";

/** §2.1 tracker: step · bar · step · bar · step. `arrived` = §2.5, every step done. */
function Tracker({ labels, arrived }: { labels: readonly string[]; arrived: boolean }): React.ReactElement {
  const dots: Dot[] = arrived ? ["done", "done", "done"] : ["done", "current", "todo"];
  const bars: Array<"full" | "half" | "empty"> = arrived ? ["full", "full"] : ["half", "empty"];
  const step = (i: number) => <TrackStep key={`s${i}`} dot={dots[i]!} label={labels[i]!} n={i + 1} />;
  return (
    <View testID="install-tip-tracker" style={{ flexDirection: "row", alignItems: "center", paddingTop: 4, paddingHorizontal: 2 }}>
      {step(0)}
      <TrackBar fill={bars[0]!} />
      {step(1)}
      <TrackBar fill={bars[1]!} />
      {step(2)}
    </View>
  );
}

function TrackStep({ dot, label, n }: { dot: Dot; label: string; n: number }): React.ReactElement {
  return (
    <View style={{ width: 72, alignItems: "center", gap: 6 }}>
      <View style={{ width: 28, height: 28 }}>
        {dot === "current" ? <View style={{ position: "absolute", top: -4, left: -4, right: -4, bottom: -4, borderRadius: 18, backgroundColor: tokens.color.highlight }} /> : null}
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: dot === "done" ? tokens.color.accentText : dot === "current" ? tokens.color.ink : tokens.color.surface,
            borderWidth: dot === "todo" ? 1 : 0,
            borderColor: tokens.color.line,
          }}
        >
          {dot === "done" ? (
            <Icon name="check" size={16} color={tokens.color.onAccent} />
          ) : dot === "current" ? (
            <Icon name="bike" size={16} color={tokens.color.onAccent} />
          ) : (
            <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{n}</Text>
          )}
        </View>
      </View>
      <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, textAlign: "center", color: dot === "todo" ? tokens.color.muted : tokens.color.accentText }}>{label}</Text>
    </View>
  );
}

function TrackBar({ fill }: { fill: "full" | "half" | "empty" }): React.ReactElement {
  return (
    <View style={{ flex: 1, height: 4, borderRadius: 2, marginBottom: 20, overflow: "hidden", flexDirection: "row", backgroundColor: tokens.color.line }}>
      {fill === "empty" ? null : <View style={{ flex: fill === "full" ? 1 : 0.5, backgroundColor: tokens.color.accentText }} />}
    </View>
  );
}

const STEP_ICONS: IconName[] = ["share", "square-plus", "check"];

function Steps({ small }: { small: boolean }): React.ReactElement {
  const steps: ReadonlyArray<{ title: string; sub?: string }> = small ? C.sheetSmall.steps : C.sheet.steps;
  return (
    <View testID="install-tip-steps" style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.card, paddingVertical: small ? 2 : 4, paddingHorizontal: small ? 12 : 14 }}>
      {steps.map((s, i) => (
        <View
          key={s.title}
          style={{ minHeight: small ? 50 : 54, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: tokens.color.line }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tokens.color.bg, borderWidth: 1, borderColor: tokens.color.line, alignItems: "center", justifyContent: "center" }}>
            <Icon name={STEP_ICONS[i]!} size={24} color={tokens.color.accentText} />
            <View
              style={{ position: "absolute", top: -6, left: -6, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: tokens.color.bg, backgroundColor: tokens.color.accentText, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent }}>{i + 1}</Text>
            </View>
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{s.title}</Text>
            {s.sub ? <StepSub text={s.sub} /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** A step's sub line; "···" is drawn as a mini keycap holding Lucide `ellipsis`. */
function StepSub({ text }: { text: string }): React.ReactElement {
  const at = text.indexOf(ELLIPSIS);
  const subStyle = { fontSize: 13, lineHeight: 18, color: tokens.color.muted } as const;
  if (at < 0) return <Text style={subStyle}>{text}</Text>;
  return (
    <View accessible accessibilityLabel={text} style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
      <Text style={subStyle}>{text.slice(0, at).trimEnd()}</Text>
      <View style={{ minWidth: 26, height: 22, paddingHorizontal: 4, borderRadius: 6, backgroundColor: tokens.color.bg, borderWidth: 1, borderColor: tokens.color.line, alignItems: "center", justifyContent: "center" }}>
        <Icon name="ellipsis" size={16} color={tokens.color.ink} />
      </View>
      {text.slice(at + ELLIPSIS.length).trim() ? <Text style={subStyle}>{text.slice(at + ELLIPSIS.length).trim()}</Text> : null}
    </View>
  );
}
