import { tokens } from "@lynia/shared/tokens";
import { Tappable } from "./Tappable";
import React, { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

/**
 * Digit-box code entry — the kit's hand-off code grid (`rider-screens.jsx` JobHandoff: one flex box
 * per digit, 1.5px accent border, 20/700 tabular digits) as a real input. One hidden TextInput holds
 * the whole value — so paste, OS one-time-code autofill and backspace all behave like a normal
 * field — and the boxes are purely its rendering. Tapping anywhere on the grid focuses the input.
 *
 * The active (next-to-fill) box carries the accent border while focused; untouched boxes keep the
 * hairline. `error` flips filled boxes to the danger border for the wrong-code state.
 */
export function CodeInput({
  length,
  value,
  onChangeText,
  accessibilityLabel,
  error = false,
  disabled = false,
}: {
  length: number;
  value: string;
  onChangeText: (code: string) => void;
  accessibilityLabel: string;
  error?: boolean;
  disabled?: boolean;
}): React.ReactElement {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.slice(0, length).split("");

  return (
    <Tappable
      onPress={() => inputRef.current?.focus()}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={{ marginBottom: tokens.space.md }}
    >
      <View style={{ flexDirection: "row", gap: 8 }} pointerEvents="none">
        {Array.from({ length }, (_, i) => {
          const filled = i < digits.length;
          const active = focused && !disabled && i === Math.min(digits.length, length - 1) && digits.length < length;
          const borderColor = error && filled ? tokens.color.danger : filled || active ? tokens.color.accent : tokens.color.line;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                paddingVertical: 10,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor,
                borderRadius: tokens.radius.input,
                backgroundColor: disabled ? tokens.color.surface : tokens.color.bg,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
                {digits[i] ?? ""}
              </Text>
            </View>
          );
        })}
      </View>
      {/* The real input — invisible but full-size over the grid so the keyboard, paste and OS
          code-autofill target it directly. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^\d]/g, "").slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        keyboardType="number-pad"
        maxLength={length}
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        caretHidden
        accessibilityLabel={accessibilityLabel}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.01 }}
      />
    </Tappable>
  );
}
