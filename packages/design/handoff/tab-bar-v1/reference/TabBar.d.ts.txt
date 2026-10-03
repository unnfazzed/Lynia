import * as React from "react";

export type TabGlyphName = "home" | "orders" | "account" | "jobs" | "money";

export interface AppTab {
  id: string;
  glyph: TabGlyphName;
  label: string;
}

/** dot = attention (gold, Account/KYC) · count = new items (Jobs) · live = active order (Orders) · warn = action needed (Money). */
export type TabBadge =
  | { kind: "dot" }
  | { kind: "count"; n: number }
  | { kind: "live"; n?: number }
  | { kind: "warn" };

export interface TabBarProps {
  /** Id of the active tab. Defaults to the first tab. */
  active?: string;
  /** Picks the default tab set: customer = Home · Orders · Account, rider = Jobs · Money · Account. */
  role?: "customer" | "rider";
  /** Override the tab set (always three tabs). */
  tabs?: AppTab[];
  /** Badges keyed by tab id, e.g. { orders: { kind: "live" }, money: { kind: "warn" } }. Counts above 9 show "9+". */
  badges?: Partial<Record<string, TabBadge>>;
  /** @deprecated use badges — tab id that shows an attention dot. */
  dot?: string;
  onTab?: (id: string) => void;
  /** Fired when the ACTIVE tab is tapped again — scroll that tab to top. No haptic. */
  onReselect?: (id: string) => void;
  /** Bottom safe-area inset in px (gesture nav ≈ 24, 3-button nav 0). Bar floats 12px above it. */
  inset?: number;
  /** True while the soft keyboard is open — the bar is removed. */
  hidden?: boolean;
  /** Removes the indicator slide + colour fades. */
  reduceMotion?: boolean;
  /** "illustrated" (default, signed off) = faux-3D colour illustrations on a Home-tile-tinted pill. "solid" = single-colour vector glyphs on a --cta-fill pill (fallback). */
  glyphStyle?: "solid" | "illustrated";
  /** "glass" (default) = 72% --bg tint + 24px backdrop blur; auto-falls back to solid under prefers-reduced-transparency, prefers-contrast: more, forced-colors, or no backdrop-filter support. "solid" = opaque --bg. */
  material?: "glass" | "solid";
  /** Spec boards only: force the pressed look on a tab id. */
  previewPressed?: string;
  /** Spec boards only: force the keyboard focus ring on a tab id. */
  previewFocus?: string;
  style?: React.CSSProperties;
}

/**
 * Root bottom navigation — floating 60px pill, 12px from the edges, solid vector glyphs, solid
 * --cta-fill active pill. Reserve 72 + inset (+16) at the bottom of scroll content.
 * @dsCard group="Components"
 */
export declare function TabBar(props: TabBarProps): React.ReactElement | null;

export interface TabGlyphProps {
  name: TabGlyphName;
  /** Default 24. */
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

/** Solid single-colour vector glyph used by the tab bar (knockouts are transparent). */
export declare function TabGlyph(props: TabGlyphProps): React.ReactElement;

export interface TabIllusProps {
  name: TabGlyphName;
  /** Default 28. */
  size?: number;
  /** Neutral (idle) palette instead of full colour. */
  idle?: boolean;
  style?: React.CSSProperties;
}

/** Faux-3D tab illustration (three-face recipe of the service icons). Full colour active, neutral idle. */
export declare function TabIllus(props: TabIllusProps): React.ReactElement;
