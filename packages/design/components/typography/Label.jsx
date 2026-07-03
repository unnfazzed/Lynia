import React from "react";

/** Field/section label — 12px/600 muted uppercase-free caption. Used above inputs and small groups. */
export function Label({ children, style, ...rest }) {
  return (
    <span
      className="lynia-label"
      style={{
        display: "block",
        marginBottom: 4,
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-label)",
        fontWeight: "var(--weight-semibold)",
        color: "var(--muted)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
