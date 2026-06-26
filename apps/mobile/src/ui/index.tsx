import { tokens } from "@lynia/shared";
import React from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.surface }}>
      <View style={{ flex: 1, padding: tokens.space.xl }}>{children}</View>
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={{ fontSize: 24, fontWeight: "800", color: tokens.color.ink, marginBottom: tokens.space.sm }}>{children}</Text>;
}

export function Sub({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={{ fontSize: 14, color: tokens.color.muted, marginBottom: tokens.space.lg }}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginBottom: 4 }}>{children}</Text>;
}

export function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "phone-pad" | "decimal-pad";
  maxLength?: number;
}): React.ReactElement {
  return (
    <View style={{ marginBottom: tokens.space.md }}>
      <Label>{props.label}</Label>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={tokens.color.muted}
        keyboardType={props.keyboardType ?? "default"}
        maxLength={props.maxLength}
        style={{
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.input,
          padding: tokens.space.md,
          fontSize: 16,
          color: tokens.color.ink,
          backgroundColor: tokens.color.bg,
        }}
      />
    </View>
  );
}

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "ghost";
}): React.ReactElement {
  const primary = (props.variant ?? "primary") === "primary";
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      style={({ pressed }) => ({
        backgroundColor: primary ? tokens.color.accent : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: tokens.color.line,
        opacity: props.disabled ? 0.5 : pressed ? 0.85 : 1,
        borderRadius: tokens.radius.input,
        paddingVertical: 14,
        marginTop: tokens.space.sm,
        alignItems: "center",
        justifyContent: "center",
        minHeight: tokens.touchTargetMin,
      })}
    >
      {props.loading ? (
        <ActivityIndicator color={primary ? "#fff" : tokens.color.accent} />
      ) : (
        <Text style={{ color: primary ? "#fff" : tokens.color.ink, fontWeight: "700", fontSize: 16 }}>{props.label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }): React.ReactElement {
  return (
    <View
      style={[
        {
          backgroundColor: tokens.color.bg,
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.card,
          padding: tokens.space.lg,
          marginBottom: tokens.space.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function StatusPill({ status }: { status: string }): React.ReactElement {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: tokens.color.surface,
        borderWidth: 1,
        borderColor: tokens.color.line,
        borderRadius: tokens.radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.accent }}>{status.replace(/_/g, " ")}</Text>
    </View>
  );
}

export function ErrorText({ message }: { message?: string | null }): React.ReactElement | null {
  if (!message) return null;
  return <Text style={{ color: tokens.color.danger, fontSize: 13, marginTop: tokens.space.sm }}>{message}</Text>;
}
