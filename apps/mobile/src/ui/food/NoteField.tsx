import { tokens } from "@lynia/shared";
import React from "react";
import { Text, TextInput, View } from "react-native";

/**
 * D-35: free-text notes (per-dish or whole-order) — multiline, so kept separate from the shared
 * single-line `Field` rather than growing that component's prop surface for a food-only need.
 */
export function NoteField({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength = 200,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  maxLength?: number;
}): React.ReactElement {
  return (
    <View style={{ marginBottom: tokens.space.md }}>
      <Text style={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted, marginBottom: 4 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.color.muted}
        multiline
        maxLength={maxLength}
        accessibilityLabel={label}
        style={{
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.input,
          padding: tokens.space.md,
          minHeight: 64,
          textAlignVertical: "top",
          fontSize: tokens.font.size.body,
          color: tokens.color.ink,
          backgroundColor: tokens.color.bg,
        }}
      />
    </View>
  );
}
