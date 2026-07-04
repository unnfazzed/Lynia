/**
 * Design tokens — the single source consumed by mobile + admin so the UI can't drift from the
 * design system. Mirrors the LyniaGo design system (`packages/design/`, the CSS-variable source of
 * truth) — see `packages/design/tokens/*.css` and `docs/DESIGN.md`.
 *
 * VERIFIED IN SYNC with this project's tokens/*.css as of 2026-07-04. This is the exact contents
 * of `packages/shared/src/design-tokens.ts` — drop it in if you want certainty it matches.
 *
 * Accent has three roles — do not conflate them:
 *   - `accent`     (#00B14F) bright brand green — FILLS, graphics, map pins ONLY (≈2.9:1 on white).
 *   - `cta`        (#00812F) the primary-button FILL — white label clears ≈4.7:1 (WCAG AA large).
 *   - `accentText` (#006630) green TEXT and small icons (≈7:1 on white).
 */
export const color = {
  ink: "#14181B",
  muted: "#5B6670",
  bg: "#FFFFFF",
  surface: "#F6F7F8",
  line: "#E2E6EA",

  accent: "#00B14F",
  accentPressed: "#009D3B",
  /** @deprecated alias kept for back-compat — use `accentPressed`. */
  accent700: "#009D3B",
  accentText: "#006630",
  accentWash: "#E9F8EF",

  cta: "#00812F",
  ctaPressed: "#006B27",

  highlight: "#F2B705",
  highlightWash: "#FFFCF2",
  highlightInk: "#6B5600",
  highlightBorder: "#F2B70566",

  danger: "#C0392B",
  success: "#00B14F",
  onAccent: "#FFFFFF",
} as const;

/** 8pt spacing scale. `screen` is the 16px edge padding (320px-first — NOT 24px). */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  screen: 16,
} as const;

export const radius = {
  input: 12,
  card: 16,
  button: 999,
  pill: 999,
} as const;

export const font = {
  family: "Inter",
  wordmark: "Fredoka",
  weight: { regular: 400, medium: 400, semibold: 600, bold: 700, extrabold: 700 },
  size: {
    display: 28,
    h1: 24,
    h2: 20,
    title: 18,
    price: 20,
    bodyLg: 16,
    body: 14,
    caption: 12,
    label: 12,
    micro: 10,
  },
  tabularNumerals: true,
} as const;

export const shadow = {
  card: {
    shadowColor: "#14181B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  sheet: {
    shadowColor: "#14181B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  menu: {
    shadowColor: "#14181B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export const leading = {
  tight: 1.15,
  snug: 1.35,
  body: 1.45,
} as const;

export const touchTargetMin = 44;
export const touchTargetPrimary = 52;

export type Color = keyof typeof color;
