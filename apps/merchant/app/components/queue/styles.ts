import type { CSSProperties } from "react";

// Buttons follow the design system's shape language: full pills (--radius-button), the primary is the
// cta-fill green with a white 16/600 label, the ghost is the outline pill with green (accent-text)
// text — matching the kit's Button, not the rounded-rect 14/800 these had drifted to.
//
// The drawn 16/600 · 16×22 is the MAXIMUM of each clamp, so at the merchant's canonical 1024px
// viewport every one of these resolves to the kit's exact value (3.6vw of 1024 = 36.9px, far past
// the 16px cap) and the RM mocks are untouched. Below ~440px the middle term takes over and the
// pills shrink with the screen instead of forcing a horizontal scroll. clamp() is used rather than a
// media query because these are inline styles, which cannot carry one.
//
// The VERTICAL bound is what holds the phone tap target, and it is 14px, not 12px: a <button> does
// NOT inherit body's line-height — the UA stylesheet gives form controls `normal` (~1.2 for Inter) —
// so at the 14px label the box is 14 × 1.2 + 2 × 14 = 44.8px. At 12px padding it would have been
// 40.8px, under the 44px target. (An earlier revision of this comment did the arithmetic with a 1.5
// line-height these buttons never had; CodeRabbit caught it on PR #823.)
//
// Deliberately NOT a blanket `minHeight: 44`: many call sites re-declare `padding` to draw a compact
// button (`padding: "8px 14px"` and friends), and a shared floor would inflate every one of those at
// tablet width too — exactly the "44px floor overrides drawn geometry" that CLAUDE.md rules out
// ("Strict mock sizes … the mock wins", owner decision 2026-08-10). Raising the clamp's own minimum
// reaches only the phone end, where nothing is drawn.
export const primaryButtonStyle: CSSProperties = {
  fontSize: "clamp(14px, 3.6vw, 16px)",
  fontWeight: 600,
  color: "#fff",
  background: "var(--cta-fill)",
  border: "none",
  borderRadius: "var(--radius-button)",
  padding: "clamp(14px, 3.2vw, 16px) clamp(16px, 4.5vw, 22px)",
  cursor: "pointer",
};

export const ghostButtonStyle: CSSProperties = {
  fontSize: "clamp(14px, 3.6vw, 16px)",
  fontWeight: 600,
  color: "var(--accent-text)",
  background: "#fff",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-button)",
  padding: "14px clamp(16px, 4.5vw, 22px)",
  cursor: "pointer",
};

// The kit's one filled-danger button: M2·2's reject confirm is the primary shape with the danger fill
// swapped in (`<Button label="Reject LG-4471" style={{ background: "var(--danger)" }} />`,
// packages/design/explorations/restaurants/r-merchant.jsx:420). White on --danger is ~5.4:1.
export const dangerButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "var(--danger)",
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
