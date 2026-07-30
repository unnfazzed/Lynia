import type { CSSProperties } from "react";

export const primaryButtonStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: "#fff",
  background: "var(--cta-fill)",
  border: "none",
  borderRadius: 14,
  padding: "16px 22px",
  cursor: "pointer",
};

export const ghostButtonStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "var(--ink)",
  background: "#fff",
  border: "1px solid var(--line)",
  borderRadius: 14,
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
