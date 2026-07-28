import * as React from "react";

export interface MoneyProps {
  /** Amount as a string, already formatted to 2 decimals ("15.50"). */
  v: string | number;
  size?: number;
  weight?: number;
  color?: string;
  /** Default "$". */
  currency?: string;
  style?: React.CSSProperties;
}

/**
 * Every price renders through this — tabular numerals, leading currency mark, one weight vocabulary.
 * @dsCard group="Components"
 */
export declare function Money(props: MoneyProps): React.ReactElement;
