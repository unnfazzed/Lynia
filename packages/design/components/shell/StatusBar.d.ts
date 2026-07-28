import * as React from "react";

export interface StatusBarProps {
  /** Light-on-accent treatment, for screens whose top is the green brand header. */
  dark?: boolean;
  time?: string;
  network?: string;
  battery?: string;
  style?: React.CSSProperties;
}

/**
 * Faux phone status bar for mockups and prototypes — keeps screens reading as real captures.
 * @dsCard group="Components"
 */
export declare function StatusBar(props: StatusBarProps): React.ReactElement;
