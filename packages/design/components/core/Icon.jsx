import React from "react";

/**
 * Lynia icon — renders a Lucide icon (open-source, rounded 2px line icons matching Grab's in-app
 * icon style). Requires the SELF-HOSTED icon subset on the page (~5KB, data-light):
 *   <script src="assets/lynia-icons.js"></script>  (adjust the relative path)
 * Icons are ALWAYS paired with a visible text label elsewhere in the UI (low-literacy + SR rule).
 * Falls back to a neutral dot if the library or icon name is missing.
 */
export function Icon({ name, size, color = "currentColor", strokeWidth = 2, fill = "none", style, ...rest }) {
  const px = size ?? 20;
  const lib = typeof window !== "undefined" ? window.lucide : null;
  const pascal = String(name || "")
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join("");
  let node = null;
  if (lib && lib.icons) node = lib.icons[pascal] || lib.icons[name] || null;
  // iconNode formats seen across lucide versions: [[tag, attrs], …] or [tag, attrs, children]
  let children = null;
  if (Array.isArray(node)) {
    const pairs = Array.isArray(node[0]) ? node : node[2] || [];
    children = pairs.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }));
  }
  return (
    <svg
      aria-hidden="true"
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
      {...rest}
    >
      {children || <circle cx="12" cy="12" r="3" fill={color} stroke="none" />}
    </svg>
  );
}
