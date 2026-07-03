import * as React from "react";

export interface StepperEvent {
  status: string;
  createdAt: string;
}

export interface StepperProps {
  /** Append-only order events; the first timestamp per status stamps that step. */
  events?: StepperEvent[];
  /** The order's current status — drives which step is done / now / todo. */
  currentStatus: string;
  /** Which side's paired labels to render. */
  view?: "customer" | "rider";
  style?: React.CSSProperties;
}

/**
 * The §5c 7-step delivery journey timeline (customer or rider view).
 * @dsCard group="Components"
 */
export declare function Stepper(props: StepperProps): React.ReactElement;
