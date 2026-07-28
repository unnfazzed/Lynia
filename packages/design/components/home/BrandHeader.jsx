import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * Lynia green brand header — the ONE sanctioned accent-filled surface, root home only.
 * Accent-green block carrying the delivery address and two round actions (bell, profile),
 * with the white search bar floating over the bottom seam (Grab-style). The parent screen
 * must draw the status bar in light-on-green above this and a white body below it.
 */
export function BrandHeader({
  address,
  label = "DELIVER TO",
  searchPlaceholder = "Search food, or send a parcel",
  showSearch = true,
  onAddress,
  onSearch,
  onBell,
  onProfile,
  style,
  ...rest
}) {
  const circ = (icon, onClick, aria) => (
    <button type="button" onClick={onClick} aria-label={aria} style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-700)", border: "none", display: "grid", placeItems: "center", flexShrink: 0, cursor: "pointer", padding: 0 }}>
      <Icon name={icon} size={17} color="#fff" />
    </button>
  );
  return (
    <div className="lynia-brandheader" style={{ fontFamily: "var(--font-sans)", ...style }} {...rest}>
      <div style={{ background: "var(--accent)", padding: "6px var(--space-screen) 30px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div onClick={onAddress} role={onAddress ? "button" : undefined} style={{ flex: 1, minWidth: 0, cursor: onAddress ? "pointer" : "default" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,.85)", letterSpacing: ".05em" }}>{label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--on-accent)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{address}</span>
              <Icon name="chevron-down" size={15} color="#fff" style={{ flexShrink: 0 }} />
            </div>
          </div>
          {circ("bell", onBell, "Notifications")}
          {circ("user", onProfile, "Profile")}
        </div>
      </div>
      {showSearch ? (
        <div onClick={onSearch} role={onSearch ? "button" : undefined} style={{ margin: "-22px var(--space-screen) 0", display: "flex", alignItems: "center", gap: 8, background: "var(--bg)", borderRadius: "var(--radius-input)", padding: "11px 13px", minHeight: "var(--target-min)", boxSizing: "border-box", boxShadow: "var(--shadow-card)", position: "relative", cursor: onSearch ? "pointer" : "default" }}>
          <Icon name="search" size={16} color="var(--muted)" />
          <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{searchPlaceholder}</span>
        </div>
      ) : null}
    </div>
  );
}
