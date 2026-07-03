import * as React from "react";

export interface CardProps {
  children?: React.ReactNode;
  /** Draw the accent-green border for emphasis (active job, delivery code). */
  accent?: boolean;
  style?: React.CSSProperties;
}

/**
 * The single Lynia card shape — white surface, hairline border, 12px radius.
 * @dsCard group="Components"
 */
export declare function Card(props: CardProps): React.ReactElement;
