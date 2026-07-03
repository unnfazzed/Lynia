import * as React from "react";

export interface IconProps {
  /** Lucide icon name, kebab-case (e.g. "bike", "map-pin", "triangle-alert"). */
  name: string;
  /** Pixel size. Defaults to 20 (--icon-size). */
  size?: number;
  /** Stroke colour. Defaults to currentColor. */
  color?: string;
  strokeWidth?: number;
  fill?: string;
  style?: React.CSSProperties;
}

/**
 * Lucide line icon (Grab-style rounded outlines). Needs the Lucide UMD script on the page.
 * @dsCard group="Components"
 */
export declare function Icon(props: IconProps): React.ReactElement;
