import * as React from "react";

export interface StatusPillProps {
  /** The status text. Underscores render as spaces. */
  status: string;
  /** neutral/online/success → accent · offline/reconnecting → muted. */
  tone?: "neutral" | "online" | "offline" | "reconnecting" | "success";
  /** Show a leading tone-coloured dot (used on the rider connection chip). */
  dot?: boolean;
  style?: React.CSSProperties;
}

/**
 * Pill for order status and the rider online/offline connection chip.
 * @dsCard group="Components"
 */
export declare function StatusPill(props: StatusPillProps): React.ReactElement;
