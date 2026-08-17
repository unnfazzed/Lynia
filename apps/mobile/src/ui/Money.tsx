import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { formatMoney } from "../logic/money";

/**
 * Every price renders through this — the RN port of the kit's `components/core/Money.jsx`: tabular
 * numerals so columns line up, a leading currency mark, one weight/colour vocabulary.
 *
 * One deliberate divergence from the kit's prop shape: the kit takes `v` pre-formatted ("15.50") and
 * prefixes `currency`; here `v` is whatever the API carries (server Decimal string, number, null) and
 * goes through the app's single `formatMoney` — which already owns two-decimal padding and the
 * sign-before-symbol rule for negatives (WD-008). Passing raw values through one formatter is the
 * whole point of the primitive; a `currency` prop would bypass it.
 */
export function Money({
  v,
  size = 14,
  weight = "700",
  color = tokens.color.ink,
  style,
}: {
  v: string | number | null | undefined;
  size?: number;
  weight?: TextStyle["fontWeight"];
  color?: string;
  style?: StyleProp<TextStyle>;
}): React.ReactElement {
  return <Text style={[{ fontSize: size, fontWeight: weight, color, fontVariant: ["tabular-nums"] }, style]}>{formatMoney(v)}</Text>;
}
