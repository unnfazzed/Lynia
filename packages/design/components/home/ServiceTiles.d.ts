import * as React from "react";

export interface Service {
  id: string;
  /** Icon name from the Lynia icon set. */
  icon: string;
  label: string;
  /** Small caption under the label, e.g. "Parcel" or "Soon". */
  sub?: string;
  /** Tile background. Defaults to var(--accent). */
  bg?: string;
  /** Not launched yet — renders grey and non-interactive. */
  soon?: boolean;
}

export interface ServiceTilesProps {
  /** Defaults to Send · Food · Pharmacy (soon). */
  services?: Service[];
  /** Grid columns. Defaults to the service count, capped at 4. */
  columns?: number;
  onService?: (id: string) => void;
  /** Dim the grid (used behind overlays). */
  dim?: boolean;
  style?: React.CSSProperties;
}

/**
 * Launcher grid on the root home — every service is a tile, so shipping a vertical never
 * moves navigation.
 * @dsCard group="Components"
 */
export declare function ServiceTiles(props: ServiceTilesProps): React.ReactElement;
