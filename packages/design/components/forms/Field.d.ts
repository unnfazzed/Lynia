import * as React from "react";

export interface FieldProps {
  /** Visible label rendered ABOVE the field — never placeholder-as-label. SR-associated. */
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel";
  maxLength?: number;
  /** Appends a "• from map" hint to the label (reverse-geocoded landmark auto-fill). */
  fromMap?: boolean;
  disabled?: boolean;
  /** Inline error — red border + specific message right under the field (role=alert). */
  error?: string;
  /** Muted helper line under the field (suppressed while an error shows). */
  hint?: string;
  /** Render a resizable textarea instead of an input — for paragraph notes/instructions. */
  multiline?: boolean;
  /** Textarea rows when multiline (default 3). */
  rows?: number;
  style?: React.CSSProperties;
}

/**
 * Labelled text input with inline validation — the one Lynia form field.
 * @dsCard group="Components"
 */
export declare function Field(props: FieldProps): React.ReactElement;
