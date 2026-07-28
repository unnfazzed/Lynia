import React from "react";

/**
 * Lynia photo-led venue card (restaurants today; any vertical tomorrow). White card, soft shadow,
 * photo (or the tinted-initial fallback — photos are an upgrade, never a dependency), ETA pill
 * floating bottom-right on the image, then name and a ★-rating / delivery-fee row.
 */
export function RestaurantCard({
  name,
  rating,
  ratingCount,
  eta,
  fee,
  photo,
  closed = false,
  note,
  width = 172,
  onClick,
  style,
  ...rest
}) {
  const tab = { fontVariantNumeric: "tabular-nums" };
  return (
    <div className="lynia-restcard" role={onClick ? "button" : undefined} onClick={onClick} style={{ width, borderRadius: "var(--radius-card)", background: "var(--bg)", boxShadow: "var(--shadow-card)", overflow: "hidden", flexShrink: 0, opacity: closed ? 0.65 : 1, cursor: onClick ? "pointer" : "default", fontFamily: "var(--font-sans)", ...style }} {...rest}>
      <div style={{ position: "relative" }}>
        {photo ?? (
          <div style={{ height: 84, background: "var(--accent-wash)", display: "grid", placeItems: "center" }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: "var(--accent-text)", opacity: 0.5, lineHeight: 1 }}>{(name || "•")[0].toUpperCase()}</span>
          </div>
        )}
        {closed && note ? (
          <span style={{ position: "absolute", left: 8, top: 8, background: "var(--bg)", borderRadius: 999, padding: "3px 8px", fontSize: 10.5, fontWeight: 700, color: "var(--ink)", boxShadow: "var(--shadow-card)" }}>{note}</span>
        ) : null}
        {!closed && eta ? (
          <span style={{ position: "absolute", right: 8, bottom: 8, background: "var(--bg)", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 800, color: "var(--ink)", boxShadow: "var(--shadow-card)", ...tab }}>{eta} min</span>
        ) : null}
      </div>
      <div style={{ padding: "7px 10px 9px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, fontSize: 11.5, whiteSpace: "nowrap", ...tab }}>
          {rating != null ? (
            <span style={{ fontWeight: 700, color: "var(--ink)" }}>
              <span style={{ color: "var(--highlight)" }}>★</span> {rating}
              {ratingCount ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> ({ratingCount})</span> : null}
            </span>
          ) : null}
          <span style={{ flex: 1 }} />
          {closed ? (
            <span style={{ color: "var(--muted)", fontWeight: 600 }}>Closed</span>
          ) : fee != null ? (
            <span style={{ fontWeight: 700, color: "var(--accent-text)" }}>${fee} delivery</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
