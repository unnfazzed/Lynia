import { tokens } from "@lynia/shared/tokens";
import { useWindowDimensions } from "react-native";

/**
 * First Run v2 (`packages/design/handoff/first-run-v2/`, ledger D-81) — the numbers every part shares.
 * Every value below is the handoff's `design/fr-kit.js` CSS block; colours are tokens only
 * (README §5), plus `dangerSun` which D-81 added for the danger hero's sun.
 */

export type FrTone = "mint" | "violet" | "danger" | "neutral" | "green";

export interface FrTonePalette {
  /** Hero panel fill. */
  hero: string;
  /** The 150 decor sun (top-right overhang). */
  sun: string;
  /** The 18 decor dot (bottom-left). */
  dot: string;
  dotOpacity: number;
  /** The 40 icon inside the white disc. */
  icon: string;
  /** The coloured second half of a split title. */
  accent: string;
}

/** README §1 "Tones". */
export const FR_TONES: Record<FrTone, FrTonePalette> = {
  mint: { hero: tokens.color.accentWash, sun: tokens.color.highlight, dot: tokens.color.coral, dotOpacity: 1, icon: tokens.color.accent, accent: tokens.color.accentText },
  violet: { hero: tokens.color.riderWash, sun: tokens.color.highlight, dot: tokens.color.coral, dotOpacity: 1, icon: tokens.color.riderAccent, accent: tokens.color.riderAccent },
  danger: { hero: tokens.color.dangerWash, sun: tokens.color.dangerSun, dot: tokens.color.danger, dotOpacity: 0.35, icon: tokens.color.danger, accent: tokens.color.dangerInk },
  neutral: { hero: tokens.color.surface, sun: tokens.color.line, dot: tokens.color.illusIdleMid, dotOpacity: 1, icon: tokens.color.muted, accent: tokens.color.accentText },
  green: { hero: tokens.color.accent, sun: tokens.color.highlight, dot: tokens.color.onAccent, dotOpacity: 0.5, icon: tokens.color.onAccent, accent: tokens.color.accentText },
};

/** Hero heights (README §1): 232 at 360×720, 160 at 320×640, 176 at font scale 1.3. */
export const HERO_H = { regular: 232, compact: 160, largeFont: 176 } as const;
/** Disc: 104, 84 at 320 and at font scale 1.3. */
export const DISC = { regular: 104, small: 84 } as const;
/** The halo ring sits 14 outside the disc. */
export const HALO_GAP = 14;
/** The pinned footer, the hero corner, the exit button. */
export const FR = {
  gutter: tokens.space.screen,
  heroRadius: 28,
  sun: 150,
  /** The sun's centre is at (right −56+75, top −56+75): it overhangs the corner by 56. */
  sunOverhang: 56,
  dot: 18,
  dotLeft: 36,
  dotBottom: 40,
  /** Content starts 12 below the status bar (6 at 320: `.sm .body{padding-top:30px}`). */
  topGap: 12,
  topGapCompact: 6,
  /** The ✕ sits 12 inside the hero's top-left corner (`.ex{left:28px;top:48px}`). */
  exitInset: 12,
  /** The bottom toast's distance from the bottom (above the safe-area inset). */
  toastBottom: 96,
} as const;

/** CSS `em` letter-spacing → RN points, rounded to 0.01 (−0.025em at 28 = −0.7). */
export function em(value: number, fontSize: number): number {
  return Math.round(value * fontSize * 100) / 100;
}

/** A width at or under this is the 320 entry phone (`.f.sm`). */
export const COMPACT_MAX_WIDTH = 340;
/** A font scale at or over this is the "font scale 1.3" frame set (`.f.fs13`). */
export const LARGE_FONT_SCALE = 1.2;

export interface FirstRunMetrics {
  compact: boolean;
  largeFont: boolean;
  heroH: number;
  disc: number;
  /** Split title size (28, or 24 at 320). Font scale is applied by the OS on top. */
  titleSize: number;
  /** Gap above the title (24, or 16 at 320). */
  titleGap: number;
  /** Status bar → content gap. */
  topGap: number;
}

/** Pure, so the breakpoints are unit-testable without rendering. */
export function firstRunMetrics(width: number, fontScale: number): FirstRunMetrics {
  const compact = width <= COMPACT_MAX_WIDTH;
  const largeFont = fontScale >= LARGE_FONT_SCALE;
  return {
    compact,
    largeFont,
    heroH: compact ? HERO_H.compact : largeFont ? HERO_H.largeFont : HERO_H.regular,
    disc: compact || largeFont ? DISC.small : DISC.regular,
    titleSize: compact ? 24 : 28,
    titleGap: compact ? 16 : 24,
    topGap: compact ? FR.topGapCompact : FR.topGap,
  };
}

/** The live metrics: `useWindowDimensions` re-renders on rotation and on a font-scale change. */
export function useFirstRunMetrics(): FirstRunMetrics {
  const { width, fontScale } = useWindowDimensions();
  return firstRunMetrics(width, fontScale);
}
