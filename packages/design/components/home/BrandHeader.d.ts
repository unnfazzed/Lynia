import * as React from "react";

export interface BrandHeaderProps {
  /** The delivery address shown bold in white. */
  address: string;
  /** Overline above the address. Default "DELIVER TO". */
  label?: string;
  /** Placeholder copy in the floating search bar. */
  searchPlaceholder?: string;
  /** Render the floating search bar over the seam (default true). */
  showSearch?: boolean;
  onAddress?: () => void;
  onSearch?: () => void;
  onBell?: () => void;
  onProfile?: () => void;
  style?: React.CSSProperties;
}

/**
 * Green brand header — the one accent-filled surface, root home only. Draw a light-on-green
 * status bar above it and a white body below; the search bar floats across the seam.
 * @dsCard group="Components"
 */
export declare function BrandHeader(props: BrandHeaderProps): React.ReactElement;
