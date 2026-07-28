import * as React from "react";

export interface ReorderItem {
  id?: string;
  name: string;
  /** e.g. "6.00" — rendered "$6.00" in dark green tabular numerals. */
  price?: string;
  /** Round photo node sized to `size`; omit for the tinted-initial circle. */
  photo?: React.ReactNode;
}

export interface ReorderRailProps {
  items: ReorderItem[];
  /** Section heading. Default "Order again"; pass "" to hide. */
  title?: string;
  /** Photo-circle diameter in px (default 58; 44 on dense screens). */
  size?: number;
  onItem?: (item: ReorderItem, index: number) => void;
  style?: React.CSSProperties;
}

/**
 * Order-again rail — accent-ringed dish circles, one tap back to a filled cart.
 * @dsCard group="Components"
 */
export declare function ReorderRail(props: ReorderRailProps): React.ReactElement;
