import React from "react";

/** Screen heading — 24px/700 ink (Inter bold). The one H1 per Lynia screen ("Send a parcel", "Your job"). */
export function Heading({ children, style, ...rest }) {
  return (
    <h1
      className="lynia-heading"
      style={{
        margin: 0,
        marginBottom: "var(--space-sm)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-h1)",
        fontWeight: "var(--weight-bold)",
        letterSpacing: "-0.02em",
        lineHeight: "var(--leading-tight)",
        color: "var(--ink)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </h1>
  );
}
