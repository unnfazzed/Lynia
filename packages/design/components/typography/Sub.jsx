import React from "react";

/** Sub-heading / lede — 14px muted, sits under a Heading to explain the screen in one calm sentence. */
export function Sub({ children, style, ...rest }) {
  return (
    <p
      className="lynia-sub"
      style={{
        margin: 0,
        marginBottom: "var(--space-lg)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-body)",
        fontWeight: "var(--weight-regular)",
        lineHeight: "var(--leading-body)",
        color: "var(--muted)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </p>
  );
}
