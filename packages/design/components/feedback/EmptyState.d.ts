import * as React from "react";

export interface EmptyStateProps {
  /** A Lucide icon name, e.g. "bike", "inbox", "wifi-off" (shown in a round mint tile). */
  icon?: string;
  title: string;
  message?: string;
  /** The primary recovery action (usually a <Button>). */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Calm empty / error / dead-end state with a Lucide icon, title, message and one recovery action.
 * @dsCard group="Components"
 */
export declare function EmptyState(props: EmptyStateProps): React.ReactElement;
