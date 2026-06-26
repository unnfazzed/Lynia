/**
 * Design tokens — the single source for docs/DESIGN.md, consumed by mobile + admin so the
 * UI can't drift from the design system. Direction: clean utility + warm accent, light theme.
 */
export const color = {
  ink: "#14181B",
  muted: "#5B6670",
  bg: "#FFFFFF",
  surface: "#F6F7F8",
  line: "#E2E6EA",
  accent: "#1E7A46",
  accent700: "#16633A",
  highlight: "#F2B705",
  danger: "#C0392B",
} as const;

/** 8pt spacing scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  input: 8,
  card: 12,
  pill: 999,
} as const;

export const font = {
  family: "Manrope",
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
  /** Fares, ETAs and ratings render with tabular numerals. */
  tabularNumerals: true,
} as const;

/** Minimum touch target (px). Primary actions use 52. */
export const touchTargetMin = 44;

export type Color = keyof typeof color;
