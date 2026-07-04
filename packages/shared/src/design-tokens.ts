/**
 * Design tokens — the single source consumed by mobile + admin so the UI can't drift from the
 * design system. Mirrors the LyniaGo design system (`packages/design/`, the CSS-variable source of
 * truth) — see `packages/design/tokens/*.css` and `docs/DESIGN.md`.
 *
 * Direction: Grab-style clean utility, light theme, tuned for a low-trust cash market on cheap
 * Android phones in bright sunlight. Bright Grab-green fills with a dark text-green for legibility,
 * a mint wash for selected states, one sparing gold marker.
 *
 * Accent has three roles — do not conflate them:
 *   - `accent`     (#00B14F) bright brand green — FILLS, graphics, map pins ONLY (≈2.9:1 on white,
 *                  never legible as text).
 *   - `cta`        (#00812F) the primary-button FILL — white label clears ≈4.7:1 (WCAG AA large)
 *                  so it stays readable in sunlight. Kept separate from `accent` so the brand green
 *                  stays vibrant on non-text fills; re-tune here without touching the brand accent.
 *   - `accentText` (#006630) green TEXT and small icons (≈7:1 on white). Never set green text in
 *                  `accent` — that's what this is for.
 */
export const color = {
  ink: "#14181B",
  muted: "#5B6670",
  bg: "#FFFFFF",
  surface: "#F6F7F8",
  line: "#E2E6EA",

  /** Bright Grab green — fills, CTA backgrounds, big graphics ONLY. Never as text (fails contrast). */
  accent: "#00B14F",
  /** Pressed/hover-deep fill for the brand green. */
  accentPressed: "#009D3B",
  /** @deprecated alias kept for back-compat — use `accentPressed`. */
  accent700: "#009D3B",
  /** Green TEXT & small icons (≈7:1 on white). Use this anywhere green needs to read. */
  accentText: "#006630",
  /** Light mint wash — selected states, chips, highlighted rows. */
  accentWash: "#E9F8EF",

  /**
   * Primary-CTA FILL — sunlight-contrast decision applied. White CTA labels clear ≈4.7:1 (WCAG AA
   * large). To re-tune, change only `cta`/`ctaPressed`:
   *   #00B14F brand-true (≈2.9:1, too low for sunlight) · #009D3B one shade down (≈3.4:1)
   *   #00812F white-on-green ≈4.7:1 (AA large) — CURRENT · #006B27 ≈6.3:1 for a darker press
   */
  cta: "#00812F",
  ctaPressed: "#006B27",

  /** 'Recommended' offer marker only (gold, sparing) — borders/stars, never text (use highlightInk). */
  highlight: "#F2B705",
  /** Tints for the earnings-disclaimer / highlight card. Text on the wash uses highlightInk. */
  highlightWash: "#FFFCF2",
  highlightInk: "#6B5600",
  /** 40%-alpha gold border for highlight cards (mirrors --highlight-border). */
  highlightBorder: "#F2B70566",

  danger: "#C0392B",
  /** Danger tint (mirrors --danger-wash) — 'bad' status pills, warn bars, danger hover states. */
  dangerWash: "#FAEDEB",
  /** Confirmation fills (== accent); use `accentText` for success TEXT. */
  success: "#00B14F",
  /** Text/icon colour on an accent (or danger) fill. The one inverse in the palette. */
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
  /** Screen edge padding — 16px so designs work on 320px-wide entry Androids. */
  screen: 16,
} as const;

/** Grab shape language: buttons are full pills, cards soft 16px, inputs 12px. */
export const radius = {
  input: 12,
  card: 16,
  button: 999,
  pill: 999,
} as const;

export const font = {
  /** Inter — the same typeface Grab uses in-product (self-hosted, SIL OFL). See packages/design/assets/fonts. */
  family: "Inter",
  /** Brand wordmark face (LyniaGo lockup only, never body/UI). */
  wordmark: "Fredoka",
  /** Only 400/600/700 webfont files ship; 500 maps to 400, 800 is aliased to 700. */
  weight: { regular: 400, medium: 400, semibold: 600, bold: 700, extrabold: 700 },
  /** Grab-dense type scale (px). */
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
  /** Fares, ETAs and ratings render with tabular numerals. */
  tabularNumerals: true,
} as const;

/**
 * Elevation — Grab-style: cards float on a soft ambient shadow instead of a visible border.
 * Split into the React-Native shadow props so mobile primitives can spread them directly; the web
 * equivalent lives in `packages/design/tokens/spacing.css` (`--shadow-card`).
 */
export const shadow = {
  card: {
    shadowColor: "#14181B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    /** Android elevation. */
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

/** Line heights (unitless multipliers, ≈4px grid at the scale sizes) — mirrors --leading-*. */
export const leading = {
  tight: 1.15,
  snug: 1.35,
  body: 1.45,
} as const;

/** Minimum touch target (px). The one primary CTA per screen uses `touchTargetPrimary` (52). */
export const touchTargetMin = 44;
export const touchTargetPrimary = 52;

export type Color = keyof typeof color;
