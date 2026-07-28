import React from "react";

/**
 * Lynia money — every price in the product renders through this: tabular numerals so columns line
 * up, a leading $, and one weight/colour vocabulary.
 */
export function Money({ v, size = 14, weight = 700, color = "var(--ink)", currency = "$", style, ...rest }) {
  return <span style={{ fontSize: size, fontWeight: weight, color, fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-sans)", ...style }} {...rest}>{currency}{v}</span>;
}
