import React from "react";

const TONE = {
  neutral: { color: "var(--accent-text)", bg: "var(--surface)", dot: "var(--accent)" },
  online: { color: "var(--accent-text)", bg: "var(--accent-wash)", dot: "var(--accent)" },
  offline: { color: "var(--muted)", bg: "var(--surface)", dot: "var(--muted)" },
  reconnecting: { color: "var(--muted)", bg: "var(--surface)", dot: "var(--muted)" }, // transient, never red
  // A positive order OUTCOME (delivered/completed) reads as a clear, quiet win on the mint wash — the
  // same calm "good" language as `online`. Negative outcomes (cancelled/undelivered) reuse `offline`
  // (muted), not a red tone — this pill stays a calm status label; a strong red accent belongs on the
  // surrounding icon/headline instead (see CancelledHandback/UndeliveredDone in rider terminals.tsx).
  success: { color: "var(--accent-text)", bg: "var(--accent-wash)", dot: "var(--success)" },
};

/**
 * Lynia status chip — pill with 12px/600 text in the tone colour. Green text uses the dark
 * text-green (sunlight-legible); the online tone sits on the mint wash, Grab-style. Renders an
 * order status (neutral) or the rider connection chip (online/offline/reconnecting + dot).
 * Underscored statuses render spaced ("en_route_pickup" → "en route pickup").
 */
export function StatusPill({ status, tone = "neutral", dot = false, style, ...rest }) {
  const t = TONE[tone] ?? TONE.neutral;
  return (
    <span
      role="text"
      className="lynia-status-pill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: t.bg,
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-pill)",
        padding: "4px 10px",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-label)",
        fontWeight: "var(--weight-semibold)",
        color: t.color,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {dot ? (
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: "50%", background: t.dot, flexShrink: 0 }}
        />
      ) : null}
      {String(status).replace(/_/g, " ")}
    </span>
  );
}
