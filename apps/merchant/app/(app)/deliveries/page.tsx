"use client";

import { useCallback, useEffect, useState } from "react";
import type { MerchantBookingResponse, MerchantProfileResponse } from "@lynia/shared";
import { Icon } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { BookRiderCard, ClosedBody } from "../../components/m/ClosedBody";
import { OrdersHeader, useOpenSwitch } from "../../components/m/OrdersHeader";
import { RetryableError } from "../../components/RetryableError";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { bookingsAvailable } from "../../lib/booking";
import { trackedBookings } from "../../lib/booking-view";
import { buildBoard } from "../../lib/board";
import { vocabulary } from "../../lib/vocabulary";
import { Board } from "../../components/queue/Board";
import { primeBusiness } from "../../lib/business";
import { getMerchantProfile } from "../../lib/menu-api";
import { useBookings } from "../../lib/use-bookings";
import { useNow } from "../../lib/use-now";

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      business: MerchantProfileResponse;
      bookings: MerchantBookingResponse[];
    }
  | { status: "unavailable"; business: MerchantProfileResponse }
  | { status: "error"; message: string };

type ProfileState = { status: "loading" } | { status: "ready"; business: MerchantProfileResponse } | { status: "error"; message: string };

/**
 * D1 · Shop Orders home (packages/design/handoff/merchant-mobile, ledger D-48), on Merchant v2's top
 * card (S1, ledger D-77): the business, "● Open · until 18:00", the open pill and the "Book a rider"
 * card (closed by hand: T4's body); then "Riders you booked" as mint pill trackers ("Car battery · 3 offers / Pick a
 * rider · 1:02" while finding; "Brake pads · Blessing M." with a progress bar once a rider has it).
 * Shops take no customer orders yet (owner decision), so the New · Packing · Ready segments and the
 * new-order card aren't shown.
 *
 * MJ-RL25 / MJ-RM6 / MJ-RL26 (2026-10-07): the business is read once, and the bookings are the board's
 * own poll (`useBookings`): live-only reads at the cadence a live booking needs, a 30 s idle poll and a
 * read when the tab comes back, so a teammate's booking, its rider and its cash show without a reload.
 * The page used to re-read the profile before the full list on every 3 s tick, and stop altogether when
 * nothing was live.
 */
export default function DeliveriesPage() {
  const { signOut, actionsDisabled } = useKitchenConnection();
  const [profile, setProfile] = useState<ProfileState>({ status: "loading" });
  const available = profile.status === "ready" && bookingsAvailable(profile.business);
  const list = useBookings(available);

  const loadProfile = useCallback(async () => {
    setProfile({ status: "loading" });
    try {
      const b = await getMerchantProfile();
      primeBusiness(b);
      setProfile({ status: "ready", business: b });
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setProfile({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your deliveries." });
    }
  }, [signOut]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (list.error?.status === 401) signOut();
  }, [list.error, signOut]);

  // The screen's one state, as it always was: a failed poll after the first load keeps the list.
  const state: LoadState =
    profile.status !== "ready"
      ? profile
      : !available
        ? { status: "unavailable", business: profile.business }
        : list.loaded
          ? { status: "ready", business: profile.business, bookings: list.bookings }
          : list.error
            ? { status: "error", message: list.error.message }
            : { status: "loading" };
  const retry = () => void (profile.status === "error" ? loadProfile() : list.reload());
  // The header shows once the screen has loaded, as before.
  const business = state.status === "ready" || state.status === "unavailable" ? state.business : null;
  const open = useOpenSwitch(business, (b) => setProfile((s) => (s.status === "ready" ? { ...s, business: b } : s)));

  const shop = business?.businessType === "shop";
  const shown = state.status === "ready" ? trackedBookings(state.bookings, Date.now()) : [];
  const now = useNow(15_000);
  // S1 (Merchant v2, D-77): the same urgency board the kitchen has, with the shop's BOOKED riders.
  const board = buildBoard({ orders: [], bookings: shown, v: vocabulary("shop", business?.shopKind), shop: true, now });

  return (
    <Kitchen active={shop ? "deliveries" : "queue"}>
      {business ? (
        <OrdersHeader merchant={business} open={open} disabled={actionsDisabled} refreshKey={shown.length}>
          {state.status === "ready" && <BookRiderCard href="/deliveries/new" />}
        </OrdersHeader>
      ) : null}

      {business && open.status.closedByHand ? (
        <ClosedBody merchant={business} open={open} disabled={actionsDisabled}>
          {board.length > 0 && <Board sections={board} />}
        </ClosedBody>
      ) : (
        <div className="m-bd" style={{ paddingTop: 16 }}>
          {state.status === "loading" && <div className="m-hint">Loading your deliveries…</div>}
          {state.status === "error" && <RetryableError message={state.message} onRetry={retry} />}
          {state.status === "unavailable" && (
            <p className="m-sub">
              <b>Booking riders is on its way.</b> You&apos;ll book LyniaGo riders for your customers from here.
            </p>
          )}

          {state.status === "ready" && shown.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: 8,
                paddingTop: 32,
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "var(--surface)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon name="bike" size={30} color="var(--muted)" />
              </div>
              <b style={{ fontSize: 18 }}>No riders booked yet</b>
              <p className="m-sub">Tell us where it&apos;s going and what&apos;s in it. Riders nearby offer a fare, and you pick one.</p>
            </div>
          )}
        </div>
      )}
      {!(business && open.status.closedByHand) && board.length > 0 && <Board sections={board} />}
    </Kitchen>
  );
}
