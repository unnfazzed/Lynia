import * as React from "react";
import type { Service } from "./ServiceTiles";

export interface LiveJob {
  id?: string;
  /** Bold status line, e.g. "Sadza Republic · 6 min away" or "Parcel to Msasa · rider 4 min away". */
  title: string;
  /** Muted money / code line. */
  meta?: string;
  /** 0-based progress step. */
  step?: number;
  steps?: number;
  icon?: string;
  onClick?: () => void;
}

export interface HomeVenue {
  id?: string;
  name: string;
  rating?: string | number;
  ratingCount?: number;
  eta?: string;
  fee?: string;
  /** Photo node (an <img>, a drop-slot) — omit for the tinted-initial fallback. */
  photo?: React.ReactNode;
  closed?: boolean;
  note?: string;
  onClick?: () => void;
}

export interface AppHomeProps {
  address: string;
  /** One card per running job — rides and food alike, newest first. Empty = clean home. */
  live?: LiveJob[];
  restaurants?: HomeVenue[];
  /** Override the launcher tiles. Defaults to Send · Food · Pharmacy (soon). */
  services?: Service[];
  venuesTitle?: string;
  seeAllLabel?: string;
  /** Right-aligned slot under the header (demo/role switches only — never ships). */
  aside?: React.ReactNode;
  /** Scroll the body. Off for static mockup frames, on in the running app. */
  scroll?: boolean;
  onAddress?: () => void;
  onSearch?: () => void;
  onBell?: () => void;
  onProfile?: () => void;
  onService?: (id: string) => void;
  onSeeAll?: () => void;
  style?: React.CSSProperties;
}

/**
 * The one root home for every vertical — brand header, service tiles, a live-order card per
 * running job, then venues. Use this instead of rebuilding a per-product home.
 * @dsCard group="Components"
 */
export declare function AppHome(props: AppHomeProps): React.ReactElement;
