import * as React from "react";

export interface AppBarProps {
  title: string;
  /** Small line under the title (address, order id). */
  sub?: string;
  /** Show the back chevron. Default true. */
  back?: boolean;
  /** Right-aligned slot (search, overflow). */
  right?: React.ReactNode;
  onBack?: () => void;
  /** Render on the underlying surface instead of var(--bg). */
  transparent?: boolean;
  style?: React.CSSProperties;
}

/**
 * Header for pushed screens — back chevron + title (+ sub) + right slot. One header for every
 * journey; root screens use BrandHeader.
 * @dsCard group="Components"
 */
export declare function AppBar(props: AppBarProps): React.ReactElement;
