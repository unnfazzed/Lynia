"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isLiveBooking } from "../../lib/booking";
import { listBookings } from "../../lib/bookings-api";
import { Icon } from "../icons";
import { ghostButtonStyle } from "../queue/styles";

const POLL_MS = 15_000;

/**
 * A restaurant's way into Book a rider, on Orders (merchant web upgrade L2, design doc "Where it lives"):
 * a "Book a rider" button for phone orders and, while any booking is live, "2 bookings live · View". The
 * pick screen, states and Try again all live on Deliveries. Self-contained, like SetupBanner: its own
 * fetch, silent on failure, so it can never push the kitchen board around. Ledgered as D-44 (on the
 * drawn `RM.queue`).
 */
export function BookingsStrip() {
  const [live, setLive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const read = () =>
      listBookings()
        .then((bookings) => {
          if (!cancelled) setLive(bookings.filter((b) => !b.rebroadcastedToId && isLiveBooking(b.state)).length);
        })
        .catch(() => {});
    void read();
    const id = setInterval(read, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "8px 12px",
        borderRadius: 14,
        background: "var(--bg)",
        border: "1px solid var(--line)",
        marginBottom: 14,
      }}
    >
      <Icon name="navigation" size={17} color="var(--accent-text)" />
      {live > 0 ? (
        <Link href="/deliveries" style={{ flex: 1, minWidth: 160, fontSize: 13.5, fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}>
          {live} booking{live === 1 ? "" : "s"} live · <span style={{ color: "var(--accent-text)" }}>View</span>
        </Link>
      ) : (
        <span style={{ flex: 1, minWidth: 160, fontSize: 13.5, color: "var(--muted)" }}>A phone order to deliver? Book a LyniaGo rider.</span>
      )}
      <Link href="/deliveries/new" style={{ ...ghostButtonStyle, padding: "8px 14px", fontSize: 13.5, textDecoration: "none", whiteSpace: "nowrap" }}>
        Book a rider
      </Link>
    </div>
  );
}
