import { tokens } from "@lynia/shared/tokens";
import React, { useState } from "react";
import { Text, TextInput, type TextInputProps, type TextStyle, View, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../Icon";

/**
 * First Run v2 fields (README §1 "Fields", `fr-kit.js` `.fld` `.flab` `.fhelp`, ledger D-81): 52 tall,
 * radius 12, a 1 `line` border; focus = 2 brand; error = 2 danger, with the helper as a 13/600
 * danger-ink line behind a 16 alert icon. Label 13/600 muted, 6 above. Placeholder `illusIdleMid`.
 */
export interface FrFieldProps extends Pick<TextInputProps, "keyboardType" | "autoCapitalize" | "autoCorrect" | "autoComplete" | "textContentType" | "maxLength" | "returnKeyType" | "onSubmitEditing" | "autoFocus"> {
  label?: string;
  /** The regular-weight suffix after the label (" · optional"). */
  labelNote?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  /** A muted helper line under the field. */
  helper?: string;
  /** An error: red border + the danger helper line (replaces `helper`). */
  error?: string | null;
  /** The red border alone, with no helper line (D4: the danger box below explains it). */
  invalid?: boolean;
  /** A 20 leading icon in the field (PC4's search). */
  icon?: IconName;
  onBlur?: () => void;
  editable?: boolean;
  /** Text style on the input (the plate: uppercase look, letter-spacing .06em, 600). */
  inputStyle?: TextStyle;
  style?: ViewStyle;
  testID?: string;
}

export function FrField({ label, labelNote, value, onChangeText, placeholder, helper, error, invalid, icon, onBlur, editable, inputStyle, style, testID, ...input }: FrFieldProps): React.ReactElement {
  const [focused, setFocused] = useState(false);
  const hasError = !!error;
  const border = hasError || invalid ? { borderWidth: 2, borderColor: tokens.color.danger } : focused ? { borderWidth: 2, borderColor: tokens.color.accent } : { borderWidth: 1, borderColor: tokens.color.line };
  // Keep the text from shifting when the border thickens: pad 1 less at 2.
  const padH = 14 - (border.borderWidth - 1);
  return (
    <View style={style}>
      {label ? (
        <Text style={{ marginHorizontal: 2, marginBottom: 6, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>
          {label}
          {labelNote ? <Text style={{ fontWeight: tokens.font.weight.regular }}> · {labelNote}</Text> : null}
        </Text>
      ) : null}
      <View testID={testID ? `${testID}-box` : undefined} style={{ minHeight: 52, borderRadius: 12, ...border, paddingHorizontal: padH, flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon ? <Icon name={icon} size={20} color={tokens.color.muted} /> : null}
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={tokens.color.illusIdleMid}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          accessibilityLabel={label ?? placeholder}
          style={[{ flex: 1, minHeight: 48, fontSize: 16, color: tokens.color.ink, paddingVertical: 0 }, inputStyle]}
          {...input}
        />
      </View>
      {hasError ? (
        <View style={{ marginTop: 8, marginHorizontal: 2, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="circle-alert" size={16} color={tokens.color.dangerInk} />
          <Text accessibilityLiveRegion="assertive" style={{ flex: 1, fontSize: 13, lineHeight: 18.2, fontWeight: tokens.font.weight.semibold, color: tokens.color.dangerInk }}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text style={{ marginTop: 8, marginHorizontal: 2, fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{helper}</Text>
      ) : null}
    </View>
  );
}

/**
 * The verified read-only row (D2 phone, D6 masked ID): `surface`, no border, 52 tall, radius 12,
 * padding 0 14, 10 gap; an optional 20 `shield-check` in brand green, the text, and a trailing 600 14
 * green value (optionally with a 16 check).
 */
export function VerifiedRow({
  text,
  value,
  icon = "shield-check",
  valueIcon,
  textStyle,
  style,
}: {
  text: string;
  value?: string;
  icon?: IconName | null;
  valueIcon?: IconName;
  textStyle?: TextStyle;
  style?: ViewStyle;
}): React.ReactElement {
  return (
    <View accessible accessibilityLabel={value ? `${text}, ${value}` : text} style={[{ minHeight: 52, borderRadius: 12, backgroundColor: tokens.color.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }, style]}>
      {icon ? <Icon name={icon} size={20} color={tokens.color.accent} /> : null}
      <Text style={[{ flex: 1, fontSize: 16, color: tokens.color.ink }, textStyle]}>{text}</Text>
      {value ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {valueIcon ? <Icon name={valueIcon} size={16} color={tokens.color.accentText} /> : null}
          <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{value}</Text>
        </View>
      ) : null}
    </View>
  );
}
