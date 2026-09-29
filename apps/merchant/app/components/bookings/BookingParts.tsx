"use client";

import Link from "next/link";
import type { MerchantBookingResponse, MerchantBookingState } from "@lynia/shared";
import { type BookingTone, isFinding, STATE_LABEL, STATE_TONE } from "../../lib/booking";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { useNow } from "../../lib/use-now";
import { Icon } from "../icons";
import { cardStyle } from "../queue/styles";

/**
 * Book a rider's shared pieces (merchant web upgrade L2): the state pill and the list row. Undrawn in
 * the RM mocks, so built from the order card's own parts (the card, the tag shape, the countdown
 * grammar) and ledgered as D-44. Status never rides on colour alone: every pill carries its words.
 */

const TONE: Record<BookingTone, { bg: string; fg: string; border: string }> = {
  live: { bg: "var(--accent-wash)", fg: "var(--accent-text)", border: "#bfe7cf" },
  good: { bg: "var(--surface)", fg: "var(--accent-text)", border: "var(--line)" },
  warn: { bg: "var(--highlight-wash)", fg: "var(--highlight-ink)", border: "var(--highlight-border)" },
  muted: { bg: "var(--surface)", fg: "var(--muted)", border: "var(--line)" },
};

export function StatePill({ state }: { state: MerchantBookingState }) {
  const t = TONE[STATE_TONE[state]];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 8,
        padding: "4px 9px",
        fontSize: 12,
        fontWeight: 800,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {state === "delivered" && <Icon name="circle-check" size={13} color={t.fg} />}
      {STATE_LABEL[state]}
    </span>
  );
}

export function money(amount: string | null | undefined): string {
  const n = Number(amount);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** One booking in the Deliveries list. */
export function BookingRow({ booking }: { booking: MerchantBookingResponse }) {
  const finding = isFinding(booking.state);
  const now = useNow(1000, finding);
  const left = finding ? msUntil(booking.expiresAt, now) : 0;
  return (
    <Link
      href={`/deliveries/${booking.id}`}
      style={{ ...cardStyle, display: "block", color: "var(--ink)", textDecoration: "none" }}
      aria-label={`${STATE_LABEL[booking.state]}: ${booking.itemsSummary} to ${booking.dropoff.landmark}`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <StatePill state={booking.state} />
        {finding && booking.expiresAt && (
          <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: left < 20_000 ? "var(--danger-ink)" : "var(--ink)" }}>
            {formatCountdown(left)}
          </span>
        )}
        {finding && booking.offerCount > 0 && (
          <span style={{ fontSize: 12.5, color: "var(--accent-text)", fontWeight: 700 }}>
            {booking.offerCount} offer{booking.offerCount === 1 ? "" : "s"}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 15, fontWeight: 800 }}>{money(booking.agreedFare ?? booking.proposedFare)}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{booking.itemsSummary}</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="map-pin" size={14} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{booking.dropoff.landmark}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
        {booking.rider ? `${booking.rider.name}${booking.rider.bikeReg ? ` · ${booking.rider.bikeReg}` : ""} · ` : ""}
        {booking.bookedBy ? `Booked by ${booking.bookedBy} · ` : ""}
        {timeOf(booking.createdAt)}
      </div>
    </Link>
  );
}
