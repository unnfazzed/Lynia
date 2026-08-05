import type { CSSProperties } from "react";

// Buttons follow the design system's shape language: full pills (--radius-button), the primary is the
// cta-fill green with a white 16/600 label, the ghost is the outline pill with green (accent-text)
// text — matching the kit's Button, not the rounded-rect 14/800 these had drifted to.
export const primaryButtonStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "#fff",
  background: "var(--cta-fill)",
  border: "none",
  borderRadius: "var(--radius-button)",
  padding: "16px 22px",
  cursor: "pointer",
};

export const ghostButtonStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "var(--accent-text)",
  background: "#fff",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-button)",
  padding: "14px 22px",
  cursor: "pointer",
};

export const dangerGhostButtonStyle: CSSProperties = {
  ...ghostButtonStyle,
  color: "var(--danger-ink)",
  borderColor: "var(--danger-ink)",
};

export const cardStyle: CSSProperties = {
  background: "var(--bg)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
  padding: 16,
};

export function disabledStyle(disabled: boolean): CSSProperties {
  return disabled ? { opacity: 0.5, cursor: "not-allowed", pointerEvents: "none" } : {};
}
