import * as React from "react";

export interface OfflineBannerProps {
  /** online renders nothing; offline = calm ink bar; reconnecting = muted strip. */
  state?: "online" | "offline" | "reconnecting";
  style?: React.CSSProperties;
}

/**
 * Global connectivity banner — offline/reconnecting, calm, never red.
 * @dsCard group="Components"
 */
export declare function OfflineBanner(props: OfflineBannerProps): React.ReactElement | null;
