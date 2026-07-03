import React from "react";

// Spinner keyframes — injected once into <head>, never inside the button (keeps textContent clean).
if (typeof document !== "undefined" && !document.getElementById("lynia-btn-kf")) {
  const kf = document.createElement("style");
  kf.id = "lynia-btn-kf";
  kf.textContent = "@keyframes lynia-spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(kf);
}

/**
 * Lynia action — Grab shape language: full-pill buttons. One primary CTA per screen (52px, bright
 * Grab-green fill, presses to the darker green); ghost is the 44px pill outline with green text.
 * Full-width block by default — the shape it takes in every Lynia screen.
 */
export function Button({
  label,
  children,
  onClick,
  variant = "primary",
  disabled = false,
  loading = false,
  block = true,
  style,
  ...rest
}) {
  const primary = variant === "primary";
  const isDisabled = disabled || loading;
  return (
    <button
      type="button"
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className="lynia-btn"
      data-variant={variant}
      style={{
        display: block ? "flex" : "inline-flex",
        width: block ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-sm)",
        minHeight: primary ? "var(--target-primary)" : "var(--target-min)",
        padding: "14px 22px",
        marginTop: "var(--space-sm)",
        borderRadius: "var(--radius-button)",
        border: primary ? "none" : "1px solid var(--line)",
        background: primary ? "var(--cta-fill)" : "transparent",
        color: primary ? "var(--on-accent)" : "var(--accent-text)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-body-lg)",
        fontWeight: "var(--weight-semibold)",
        lineHeight: 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        WebkitTapHighlightColor: "transparent",
        ...style,
      }}
      onMouseDown={(e) => {
        if (isDisabled) return;
        if (primary) e.currentTarget.style.background = "var(--cta-fill-pressed)";
        else e.currentTarget.style.background = "var(--surface)";
      }}
      onMouseUp={(e) => {
        if (isDisabled) return;
        e.currentTarget.style.background = primary ? "var(--cta-fill)" : "transparent";
      }}
      onMouseLeave={(e) => {
        if (isDisabled) return;
        e.currentTarget.style.background = primary ? "var(--cta-fill)" : "transparent";
      }}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="lynia-btn-spinner"
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: `2px solid ${primary ? "rgba(255,255,255,0.4)" : "var(--line)"}`,
            borderTopColor: primary ? "var(--on-accent)" : "var(--accent-text)",
            animation: "lynia-spin 700ms linear infinite",
          }}
        />
      ) : (
        label ?? children
      )}
    </button>
  );
}
