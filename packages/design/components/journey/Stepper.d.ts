import * as React from "react";

export interface StepperEvent {
  status: string;
  createdAt: string;
}

export interface StepperProps {
  /** Event API: append-only order events (status + ISO createdAt). */
  events?: StepperEvent[];
  /** Event API: the order's current status. */
  currentStatus?: string;
  /** Event API: which side's labels to show. Default "customer". */
  view?: "customer" | "rider";
  /** Plain API: explicit step labels (e.g. RESTAURANT_STEPS). Switches off the paired labels. */
  steps?: string[];
  /** Plain API: 0-based index of the current step. */
  step?: number;
  /** Plain API: time stamp per step index, e.g. { 0: "09:41", 1: "just now" }. */
  times?: Record<number, string>;
  /** Mark a step index as failed — danger ring, "!" glyph, danger label. */
  failAt?: number;
  style?: React.CSSProperties;
}

/** The Food flavour of the shared 7-step grammar. */
export declare const RESTAURANT_STEPS: string[];

/**
 * The one delivery timeline for every vertical — 7 steps, ✓ + time behind, accent "now", muted
 * ahead. Use the event API for Send, the plain API (steps/step/times) for verticals with their own
 * step copy.
 * @dsCard group="Components"
 */
export declare function Stepper(props: StepperProps): React.ReactElement;
