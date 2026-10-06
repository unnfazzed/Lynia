import { formatPhoneDisplay } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React, { useRef } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { useTabBarSpace } from "../shell/TabShell";
import { OB } from "./copy";

/**
 * The Calm Mint v2 onboarding kit (`packages/design/handoff/calm-mint-v2-2026-10`, `shared.js` — the
 * `.pad`, `.back`, `.sub`, `.foot`, `.field`, `.note` rules; ledger D-55). Every measurement is the
 * handoff's. Zero shadows.
 */

/** The page: content scrolls under a footer pinned 24px off the bottom (`.foot`). */
export function OnbScreen({
  children,
  footer,
  padTop = 12,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  padTop?: number;
}): React.ReactElement {
  // R2/R3 render inside the rider tab shell, whose floating bar sits over the bottom of the screen. Its
  // reserve (0 outside a tab shell) keeps the footer CTA — R3's "Go online" — clear of the bar.
  const tabSpace = useTabBarSpace();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }} edges={tabSpace ? ["top"] : ["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={{ flex: 1, paddingTop: padTop }}>{children}</View>
          {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 + tabSpace, gap: 12 }}>{footer}</View> : null}
          {!footer && tabSpace ? <View style={{ height: tabSpace }} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** `.pad` — 16px gutters. */
export function Pad({ children, style }: { children: React.ReactNode; style?: object }): React.ReactElement {
  return <View style={[{ paddingHorizontal: 16 }, style]}>{children}</View>;
}

/** `.back` — a 44px target pulled 10px into the gutter, a 22px chevron. */
export function BackButton({ onPress }: { onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      tone="icon"
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, marginLeft: -10, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name="chevron-left" size={22} color={tokens.color.ink} />
    </Tappable>
  );
}

/** `.pad h1` — 28/700, line-height 1.12, tracking −0.6; an optional second line in an accent colour. */
export function H1({ children, accent, accentColor = tokens.color.accentText, size = 28 }: { children: string; accent?: string; accentColor?: string; size?: number }): React.ReactElement {
  return (
    <Text accessibilityRole="header" style={{ fontSize: size, lineHeight: size * 1.12, letterSpacing: -0.6, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
      {children}
      {accent ? (
        <>
          {"\n"}
          <Text style={{ fontWeight: tokens.font.weight.bold, color: accentColor }}>{accent}</Text>
        </>
      ) : null}
    </Text>
  );
}

/** `.pad h2` — 24/700, line-height 1.15, tracking −0.4, 8px above and below. */
export function H2({ children }: { children: string }): React.ReactElement {
  return (
    <Text accessibilityRole="header" style={{ marginTop: 8, marginBottom: 8, fontSize: 24, lineHeight: 27.6, letterSpacing: -0.4, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
      {children}
    </Text>
  );
}

/** `.sub` — 15px muted, line-height 1.45, 20px below. */
export function Sub({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={{ marginBottom: 20, fontSize: 15, lineHeight: 21.75, color: tokens.color.muted }}>{children}</Text>;
}

/** `label` — 13/600 muted, 6px above its field. */
export function FieldLabel({ children }: { children: string }): React.ReactElement {
  return <Text style={{ marginBottom: 6, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{children}</Text>;
}

/** One C5 name field: the `label`, then a 52px `.field` (1px line border, radius 12, 17px text, 14px in). */
function NameField({
  label,
  value,
  onChangeText,
  autoComplete,
  inputRef,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  autoComplete: "given-name" | "family-name";
  inputRef?: React.Ref<TextInput>;
  returnKeyType: "next" | "done";
  onSubmitEditing?: () => void;
}): React.ReactElement {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        returnKeyType={returnKeyType}
        // "next" moves on without dropping the keyboard in between.
        submitBehavior={returnKeyType === "next" ? "submit" : "blurAndSubmit"}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={label}
        autoComplete={autoComplete}
        textContentType={autoComplete === "given-name" ? "givenName" : "familyName"}
        autoCapitalize="words"
        maxLength={60}
        style={{
          height: tokens.touchTargetPrimary,
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.input,
          paddingHorizontal: 14,
          fontSize: 17,
          color: tokens.color.ink,
        }}
      />
    </View>
  );
}

/**
 * C5 · Name's field pair — First name · Surname side by side (`grid 1fr 1fr`, gap 12). The keyboard
 * chains them: First name's return key moves to Surname, Surname's submits (`onSubmit`, when given).
 */
export function NameFields({
  firstName,
  lastName,
  onFirstName,
  onLastName,
  onSubmit,
}: {
  firstName: string;
  lastName: string;
  onFirstName: (v: string) => void;
  onLastName: (v: string) => void;
  onSubmit?: () => void;
}): React.ReactElement {
  const surname = useRef<TextInput>(null);
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <NameField
        label={OB.firstName}
        value={firstName}
        onChangeText={onFirstName}
        autoComplete="given-name"
        returnKeyType="next"
        onSubmitEditing={() => surname.current?.focus()}
      />
      <NameField label={OB.surname} value={lastName} onChangeText={onLastName} autoComplete="family-name" inputRef={surname} returnKeyType="done" onSubmitEditing={onSubmit} />
    </View>
  );
}

/** C5's `.vrow` — the verified phone: a surface row, an 18px brand check, the number, "Verified" in green text. */
export function VerifiedPhoneRow({ phone }: { phone: string }): React.ReactElement {
  return (
    <View
      accessible
      accessibilityLabel={`${formatPhoneDisplay(phone)}, ${OB.verified}`}
      style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: tokens.color.surface }}
    >
      <Icon name="circle-check" size={18} color={tokens.color.accent} />
      <Text style={{ fontSize: 14, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatPhoneDisplay(phone)}</Text>
      <Text style={{ marginLeft: "auto", fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{OB.verified}</Text>
    </View>
  );
}

/** `.note` — a surface box with a leading 18px icon, 13px muted text. */
export function Note({ icon, children }: { icon: IconName; children: React.ReactNode }): React.ReactElement {
  return (
    <View style={{ marginTop: 16, flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: tokens.color.surface }}>
      <View style={{ marginTop: 1 }}>
        <Icon name={icon} size={18} color={tokens.color.muted} />
      </View>
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18.85, color: tokens.color.muted }}>{children}</Text>
    </View>
  );
}

/** `.btn` primary — 52px, the cta fill, white 16/600. */
export function Cta({
  label,
  icon,
  onPress,
  disabled = false,
  busy = false,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}): React.ReactElement {
  const off = disabled || busy;
  return (
    <Tappable
      onPress={onPress}
      disabled={off}
      tone="onDark"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy }}
      style={{
        height: tokens.touchTargetPrimary,
        borderRadius: tokens.radius.button,
        backgroundColor: tokens.color.cta,
        opacity: off ? 0.5 : 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {icon ? <Icon name={icon} size={18} color={tokens.color.onAccent} /> : null}
      <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent }}>{label}</Text>
    </Tappable>
  );
}

/** `ghost` — a 48px outline pill with green text (R2 "Send a parcel while you wait"). */
export function GhostButton({ label, onPress }: { label: string; onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ height: 48, borderRadius: tokens.radius.button, borderWidth: 1, borderColor: tokens.color.line, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{label}</Text>
    </Tappable>
  );
}
