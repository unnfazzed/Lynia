import * as React from "react";

export interface LiveOrderCardProps {
  /** Bold status line, e.g. "Sadza Republic · 6 min away". */
  title: string;
  /** Muted meta line, e.g. "Cash at the door · $15.50". */
  meta?: string;
  /** 0-based index of the current tracker step — segments 0..step render green. */
  step?: number;
  /** Total tracker steps (default 7, the Lynia grammar). */
  steps?: number;
  /** Lucide icon in the mint tile (default "bike"). */
  icon?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * Live-order home card — green-bordered, with a 7-segment progress strip mirroring the tracker.
 * @dsCard group="Components"
 */
export declare function LiveOrderCard(props: LiveOrderCardProps): React.ReactElement;
