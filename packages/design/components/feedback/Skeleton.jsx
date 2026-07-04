import React from "react";

/**
 * Lynia skeleton — a calm opacity-pulse placeholder in the line colour, shown over spinners while
 * list/board/stepper screens load (data-light: the layout doesn't jump when data lands).
 * Under prefers-reduced-motion the pulse is disabled — the skeleton renders static at 65% opacity.
 */
export function Skeleton({ width = "100%", height = 14, radius = 6, style, ...rest }) {
  return (
    <div
      aria-hidden="true"
      className="lynia-skeleton"
      style={{
        width,
        height,
        borderRadius: radius,
        background: "var(--line)",
        animation: "lynia-pulse 1400ms ease-in-out infinite",
        ...style,
      }}
      {...rest}
    >
      <style>{`@keyframes lynia-pulse { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .lynia-skeleton { animation: none !important; opacity: .65; } }`}</style>
    </div>
  );
}
