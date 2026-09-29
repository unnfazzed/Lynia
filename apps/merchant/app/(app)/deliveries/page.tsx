"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { MerchantBookingResponse, MerchantProfileResponse } from "@lynia/shared";
import { BookingRow } from "../../components/bookings/BookingParts";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { Icon } from "../../components/icons";
import { RetryableError } from "../../components/RetryableError";
import { cardStyle, ghostButtonStyle, primaryButtonStyle } from "../../components/queue/styles";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { bookingsAvailable, isFinding, isLiveBooking, pollIntervalMs } from "../../lib/booking";
import { listBookings } from "../../lib/bookings-api";
import { primeBusiness } from "../../lib/business";
import { getMerchantProfile } from "../../lib/menu-api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; business: MerchantProfileResponse; bookings: MerchantBookingResponse[] }
  | { status: "unavailable"; business: MerchantProfileResponse }
  | { status: "error"; message: string };

/**
 * Deliveries (merchant web upgrade L2): the business's bookings, live ones first, and the way to book a
 * rider. A shop's home; a restaurant reaches it from the bookings strip on Orders. Business-wide: every
 * team member sees every booking. Polls while anything is live (every 3 s while a rider is being found,
 * 15 s after). Undrawn, ledgered as D-44.
 */
export default function DeliveriesPage() {
  const { signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setState({ status: "loading" });
      try {
        const business = await getMerchantProfile();
        primeBusiness(business);
        if (!bookingsAvailable(business)) {
          setState({ status: "unavailable", business });
          return;
        }
        setState({ status: "ready", business, bookings: await listBookings() });
      } catch (err) {
        if (redirectIfSessionExpired(err, signOut)) return;
        if (!quiet) setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your deliveries." });
      }
    },
    [signOut],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the list live while anything is moving: the fastest cadence any live booking needs.
  const interval =
    state.status === "ready"
      ? state.bookings
          .filter((b) => !b.rebroadcastedToId)
          .map((b) => pollIntervalMs(b.state))
          .reduce<number | null>((min, ms) => (ms == null ? min : min == null ? ms : Math.min(min, ms)), null)
      : null;
  useEffect(() => {
    if (!interval) return undefined;
    const id = setInterval(() => void load(true), interval);
    return () => clearInterval(id);
  }, [interval, load]);

  const shop = state.status === "ready" || state.status === "unavailable" ? state.business.businessType === "shop" : false;
  // A booking a rider cancelled lives on as Send's re-broadcast; show only the current one.
  const shown = state.status === "ready" ? state.bookings.filter((b) => !b.rebroadcastedToId) : [];
  const live = shown.filter((b) => isLiveBooking(b.state));
  const past = shown.filter((b) => !isLiveBooking(b.state));

  return (
    <Kitchen active={shop ? "deliveries" : "queue"}>
      <div className="kitchen-page" style={{ display: "flex", flexDirection: "column", gap: 14, overflow: "auto", height: "100%" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>Deliveries</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>A LyniaGo rider takes your order to your customer.</div>
          </div>
          {state.status === "ready" && (
            <Link href="/deliveries/new" style={{ ...primaryButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon name="plus" size={18} color="#fff" />
              Book a rider
            </Link>
          )}
        </div>

        {state.status === "loading" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading your deliveries…</div>}

        {state.status === "error" && <RetryableError message={state.message} onRetry={() => void load()} />}

        {state.status === "unavailable" && (
          <div style={{ ...cardStyle, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Icon name="navigation" size={20} color="var(--muted)" style={{ marginTop: 2 }} />
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              <b>Booking riders is on its way.</b> You'll book LyniaGo riders for your customers from here.
            </div>
          </div>
        )}

        {state.status === "ready" && shown.length === 0 && (
          <div style={{ ...cardStyle, textAlign: "center", padding: "28px 20px" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--accent-wash)", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
              <Icon name="navigation" size={22} color="var(--accent-text)" />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Book your first rider</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5, maxWidth: 380, marginInline: "auto" }}>
              Tell us where the order is going and what it's worth. Riders nearby offer a fare, and you pick one.
            </div>
            <Link
              href="/deliveries/new"
              style={{ ...primaryButtonStyle, textDecoration: "none", display: "inline-block", marginTop: 16 }}
            >
              Book a rider
            </Link>
          </div>
        )}

        {live.length > 0 && (
          <section aria-label="Live deliveries" style={{ display: "grid", gap: 10 }}>
            <div style={sectionTitle}>Live now</div>
            {live.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </section>
        )}

        {past.length > 0 && (
          <section aria-label="Earlier deliveries" style={{ display: "grid", gap: 10 }}>
            <div style={sectionTitle}>Earlier</div>
            {past.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </section>
        )}

        {live.some((b) => isFinding(b.state)) && (
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Open a booking to see riders' offers and pick one.</div>
        )}

        {/* A shop's home, so its way out lives here, as a restaurant's lives on Orders. */}
        {shop && (
          <div>
            <button type="button" onClick={signOut} style={ghostButtonStyle}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </Kitchen>
  );
}

const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" };
