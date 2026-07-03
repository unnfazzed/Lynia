import * as React from "react";

export interface SkeletonListProps {
  /** Item count (cards/rows) or step count (stepper). Defaults: card 3, row 4, stepper 7. */
  count?: number;
  /** card = list/board cards; row = row-with-value; stepper = §5c timeline shape; summary = accent total block. */
  variant?: "card" | "row" | "stepper" | "summary";
}

/**
 * Content-shaped skeletons that mirror the real layout — card, row, stepper, summary.
 * @dsCard group="Components"
 */
export declare function SkeletonList(props: SkeletonListProps): React.ReactElement;
export declare function SkeletonCard(): React.ReactElement;
