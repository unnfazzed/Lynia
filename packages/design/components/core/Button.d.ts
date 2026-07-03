import * as React from "react";

export interface ButtonProps {
  /** Button text. Alternatively pass children. */
  label?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  /** primary = the one accent-filled 52px CTA per screen; ghost = 44px outline secondary. */
  variant?: "primary" | "ghost";
  disabled?: boolean;
  /** Shows a spinner and blocks presses. */
  loading?: boolean;
  /** Full-width block (default true) — the shape Lynia uses in-screen. */
  block?: boolean;
  style?: React.CSSProperties;
}

/**
 * Lynia action button. One primary per screen; ghost for secondary actions.
 * @dsCard group="Components"
 */
export declare function Button(props: ButtonProps): React.ReactElement;
