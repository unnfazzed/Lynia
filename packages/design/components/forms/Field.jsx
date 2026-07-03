import React from "react";

/**
 * Lynia text field — a VISIBLE label above the field (never placeholder-as-label), 12px radius,
 * 16px input text. Has an inline error slot (honest, specific, right under the field) and an
 * optional hint line. `fromMap` appends the "• from map" auto-fill note to the label.
 * The label is associated with the input for screen readers.
 * `multiline` renders a resizable textarea (for paragraph notes/instructions); with `maxLength`
 * it shows a live character counter next to the hint.
 */
let lyniaFieldId = 0;
export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  maxLength,
  fromMap = false,
  disabled = false,
  error,
  hint,
  multiline = false,
  rows = 3,
  style,
  ...rest
}) {
  const idRef = React.useRef(null);
  if (idRef.current == null) idRef.current = `lynia-field-${++lyniaFieldId}`;
  const id = idRef.current;
  const hasError = error != null && error !== "";
  const showCount = multiline && maxLength != null;
  const controlStyle = {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${hasError ? "var(--danger)" : "var(--line)"}`,
    borderRadius: "var(--radius-input)",
    padding: "var(--space-md)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-body-lg)",
    color: "var(--ink)",
    background: "var(--bg)",
    outline: "none",
  };
  const focusOn = (e) => (e.currentTarget.style.borderColor = hasError ? "var(--danger)" : "var(--accent-700)");
  const focusOff = (e) => (e.currentTarget.style.borderColor = hasError ? "var(--danger)" : "var(--line)");
  const common = {
    id,
    value,
    onChange: onChange ? (e) => onChange(e.target.value) : undefined,
    placeholder,
    maxLength,
    disabled,
    "aria-invalid": hasError || undefined,
    "aria-describedby": hasError ? `${id}-err` : hint ? `${id}-hint` : undefined,
    onFocus: focusOn,
    onBlur: focusOff,
  };
  return (
    <div className="lynia-field" style={{ marginBottom: "var(--space-md)", ...style }}>
      {label != null ? (
        <label
          htmlFor={id}
          style={{
            display: "block",
            marginBottom: 4,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-label)",
            fontWeight: "var(--weight-semibold)",
            color: "var(--muted)",
          }}
        >
          {label}
          {fromMap ? <span style={{ fontWeight: "var(--weight-regular)" }}>{"  • from map"}</span> : null}
        </label>
      ) : null}
      {multiline ? (
        <textarea
          {...common}
          rows={rows}
          style={{ ...controlStyle, resize: "vertical", minHeight: 44, lineHeight: "var(--leading-body)" }}
          {...rest}
        />
      ) : (
        <input
          {...common}
          type={type}
          inputMode={inputMode}
          style={controlStyle}
          {...rest}
        />
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 4 }}>
        <div style={{ flex: 1 }}>
          {hasError ? (
            <div
              id={`${id}-err`}
              role="alert"
              style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", color: "var(--danger)" }}
            >
              {error}
            </div>
          ) : hint ? (
            <div
              id={`${id}-hint`}
              style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", color: "var(--muted)" }}
            >
              {hint}
            </div>
          ) : null}
        </div>
        {showCount ? (
          <div style={{ flexShrink: 0, fontFamily: "var(--font-sans)", fontSize: "var(--text-caption)", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
            {String(value ?? "").length}/{maxLength}
          </div>
        ) : null}
      </div>
    </div>
  );
}
