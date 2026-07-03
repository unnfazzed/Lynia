import * as React from "react";

export interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: React.CSSProperties;
}

/**
 * A single content-shaped pulse placeholder in the line colour.
 * @dsCard group="Components"
 */
export declare function Skeleton(props: SkeletonProps): React.ReactElement;
