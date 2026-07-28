import * as React from "react";

export interface SystemStateProps {
  /** "white" (default) or "green" for the brand-filled variant (splash, force-update). */
  tone?: "white" | "green";
  /** Icon name for the disc treatment. */
  icon?: string;
  /** Brand mark node — replaces the icon disc (e.g. the dove). */
  mark?: React.ReactNode;
  title: string;
  message?: string;
  primary?: string;
  secondary?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  style?: React.CSSProperties;
}

/**
 * Full-screen blocking state — permission priming, offline, suspended, force-update, hard error.
 * Use EmptyState for an empty list inside an otherwise working screen.
 * @dsCard group="Components"
 */
export declare function SystemState(props: SystemStateProps): React.ReactElement;
