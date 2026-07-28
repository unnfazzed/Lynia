import React from "react";
import { BrandHeader } from "./BrandHeader.jsx";
import { ServiceTiles } from "./ServiceTiles.jsx";
import { LiveOrderCard } from "./LiveOrderCard.jsx";
import { RestaurantCard } from "./RestaurantCard.jsx";

/**
 * Lynia app home — the ONE root screen for every vertical, and the source of truth for its
 * dimensions. Green BrandHeader (floating search across the seam) → service tiles → one
 * LiveOrderCard per running job, rides and food alike, newest first → a "Restaurants near you"
 * rail. No order-again / send-again rails: the live cards are the only thing above the venues.
 */
export function AppHome({
  address,
  live = [],
  restaurants = [],
  services,
  venuesTitle = "Restaurants near you",
  seeAllLabel = "See all →",
  aside,
  scroll = false,
  onAddress,
  onSearch,
  onBell,
  onProfile,
  onService,
  onSeeAll,
  style,
  ...rest
}) {
  return (
    <div style={{ minHeight: "100%", overflowY: scroll ? "auto" : "visible", overflowX: "hidden", background: "var(--bg)", fontFamily: "var(--font-sans)", ...style }} {...rest}>
      <BrandHeader address={address} onAddress={onAddress} onSearch={onSearch} onBell={onBell} onProfile={onProfile} />
      {aside ? <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 16px 0" }}>{aside}</div> : null}
      <div style={{ padding: "8px 10px 0" }}>
        <ServiceTiles services={services} onService={onService} />
      </div>
      {live.length ? (
        <div style={{ display: "grid", gap: 8, padding: "8px 16px 0" }}>
          {live.map((o, i) => <LiveOrderCard key={o.id || i} title={o.title} meta={o.meta} step={o.step} steps={o.steps} icon={o.icon} onClick={o.onClick} />)}
        </div>
      ) : null}
      {restaurants.length ? (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", padding: "8px 16px 6px" }}>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{venuesTitle}</span>
            <span role={onSeeAll ? "button" : undefined} onClick={onSeeAll} style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", cursor: onSeeAll ? "pointer" : "default" }}>{seeAllLabel}</span>
          </div>
          <div style={{ display: "flex", gap: 10, padding: "0 16px 20px", overflow: "hidden" }}>
            {restaurants.map((r, i) => (
              <RestaurantCard key={r.id || i} name={r.name} rating={r.rating} ratingCount={r.ratingCount} eta={r.eta} fee={r.fee} photo={r.photo} closed={r.closed} note={r.note} onClick={r.onClick} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
