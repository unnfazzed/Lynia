import * as React from "react";

export interface RestaurantCardProps {
  name: string;
  /** "4.7" or "new" (shown as ★ new). Omit to hide the rating. */
  rating?: string;
  ratingCount?: number;
  /** ETA range in minutes, e.g. "25–35" — rendered as a floating pill on the photo. */
  eta?: string;
  /** Delivery fee, e.g. "1.50" — rendered as "$1.50 delivery" in dark green. */
  fee?: string;
  /** Photo node (an <image-slot> wrapper or <img>) sized ~84–104px tall. Omit for the tinted-initial fallback. */
  photo?: React.ReactNode;
  /** Dims the card and swaps the fee for "Closed". */
  closed?: boolean;
  /** Status pill on the photo when closed, e.g. "Opens 11:00". */
  note?: string;
  /** Card width in px (default 172, the home-rail size). */
  width?: number | string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * Photo-led venue card with ETA pill and tinted-initial fallback — the 2a home-rail card.
 * @dsCard group="Components"
 */
export declare function RestaurantCard(props: RestaurantCardProps): React.ReactElement;
