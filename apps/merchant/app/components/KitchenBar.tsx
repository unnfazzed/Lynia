"use client";

import { Icon } from "./icons";
import { useKitchenConnection } from "./KitchenConnectionProvider";
import { PersonMenu } from "./PersonMenu";
import { useBusiness } from "../lib/business";
import { rightNowStatus } from "../lib/hours";
import { useNow } from "../lib/use-now";

/**
 * Top bar shown on every authenticated screen (mirrors the gallery's `KitchenBar`,
 * packages/design/explorations/restaurants/r-parts.jsx). The wake-lock flashing fallback (§3: "If the
 * wake lock is refused, the queue falls back to a full-brightness flashing header") is applied here
 * as the one header every authenticated screen shares.
 *
 * **No alarm control** (owner instruction 2026-08-19: "the alarm must always be on no need for
 * manual switching on or off"). The kit draws a mute/unmute pill here; the alarm now has no off
 * state to show, and dropping the pill is also what lets the bar fit a 320px phone without
 * truncating the connection status — the one piece of state a merchant genuinely has to see.
 * Ledgered as docs/DESIGN-DEVIATIONS.md D-32.
 *
 * Sizing lives in globals.css (`.kitchen-bar*`) rather than inline, because it has to change at the
 * phone breakpoint and inline styles cannot carry a media query. The brand block is the only
 * flexible child, so a long status ("Offline (attempt 12)") shortens the wordmark instead of pushing
 * itself off-screen.
 *
 * Merchant web upgrade L4: the bar ends with who is signed in ("Tendai · Staff"), which opens "Switch
 * person" and, for Staff, "Leave this business" (PersonMenu, D-46).
 *
 * L5: the drawn label beside the lockup is the business's name ("Sadza Republic · Fife Ave" in the kit;
 * there is no area field, so the name alone, D-47), and a restaurant gets the drawn "Open for orders" /
 * "Closed" pill: open when it is live and inside today's hours. A shop takes no customer orders, so it
 * gets neither the pill nor the alarm's flashing fallback.
 */
export function KitchenBar() {
  const { reachability, alarm, wakeLock, signOut } = useKitchenConnection();
  const business = useBusiness();
  const now = useNow(60_000);
  const restaurant = business?.businessType === "restaurant";
  const showFlashFallback = business?.businessType !== "shop" && alarm.armed && wakeLock.supported && !wakeLock.active;
  const open = restaurant && business.pilotEnabled && rightNowStatus(business.hours, new Date(now)).open;

  return (
    <div
      className={`kitchen-bar${showFlashFallback ? " kitchen-bar-flashing" : ""}`}
      data-offline={!reachability.reachable}
      data-person={business ? true : undefined}
    >
      {/* Dove + wordmark lockup, then the muted second line — the gallery's own KitchenBar
       *  (r-parts.jsx:596). eslint-disable: a static brand SVG from /public, not a content image. */}
      <span className="kitchen-bar-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lyniago-mark.svg" alt="" width={24} height={24} className="kitchen-bar-mark" />
        <span className="kitchen-bar-wordmark">LyniaGo</span>
        <span className="kitchen-bar-role">{business?.name ?? ""}</span>
      </span>
      {reachability.reachable ? (
        <span className="kitchen-bar-status">
          <span className="kitchen-bar-dot" />
          Connected
        </span>
      ) : (
        <span className="kitchen-bar-status kitchen-bar-status-offline">Offline (attempt {reachability.attempt})</span>
      )}
      {restaurant && (
        <span className="kitchen-bar-open" data-open={open}>
          <Icon name="power" size={14} />
          {open ? "Open for orders" : "Closed"}
        </span>
      )}
      {business && <PersonMenu business={business} onSwitchPerson={signOut} />}
    </div>
  );
}
