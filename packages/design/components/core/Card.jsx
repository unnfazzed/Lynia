import React from "react";

/**
 * Lynia container — Grab-style card: white surface, soft 16px radius, floating on a soft ambient
 * shadow (no visible border). The one card shape across the whole system (offers, tracking, rows,
 * disclaimers). Pass `accent` to draw a green border for emphasis (active job / delivery code).
 */
export function Card({ children, accent = false, style, ...rest }) {
  return (
    <div
      className="lynia-card"
      style={{
        background: "var(--bg)",
        border: accent ? "1.5px solid var(--accent)" : "1px solid transparent",
        boxShadow: "var(--shadow-card)",
        borderRadius: "var(--radius-card)",
        padding: "var(--space-lg)",
        marginBottom: "var(--space-md)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
