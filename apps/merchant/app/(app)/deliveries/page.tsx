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
import { bookingsAvailable, pollIntervalMs } from "../../lib/booking";
import { trackedBookings } from "../../lib/booking-view";
import { buildBoard } from "../../lib/board";
import { vocabulary } from "../../lib/vocabulary";
import { Board } from "../../components/queue/Board";
import { listBookings } from "../../lib/bookings-api";
import { primeBusiness } from "../../lib/business";
import { getMerchantProfile } from "../../lib/menu-api";
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

/**
 * D1 · Shop Orders home (packages/design/handoff/merchant-mobile, ledger D-48), on Merchant v2's top
 * card (S1, ledger D-77): the business, "● Open · until 18:00", the open pill and the "Book a rider"
 * card (closed by hand: T4's body); then "Riders you booked" as mint pill trackers ("Car battery · 3 offers / Pick a
 * rider · 1:02" while finding; "Brake pads · Blessing M." with a progress bar once a rider has it).
 * Shops take no customer orders yet (owner decision), so the New · Packing · Ready segments and the
 * new-order card aren't shown. Polls while anything is live.
 */
export default function DeliveriesPage() {
  const { signOut, actionsDisabled } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const business = state.status === "ready" || state.status === "unavailable" ? state.business : null;
  const open = useOpenSwitch(business, (b) => setState((s) => (s.status === "ready" || s.status === "unavailable" ? { ...s, business: b } : s)));

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setState({ status: "loading" });
      try {
        const b = await getMerchantProfile();
        primeBusiness(b);
        if (!bookingsAvailable(b)) {
          setState({ status: "unavailable", business: b });
          return;
        }
        setState({
          status: "ready",
          business: b,
          bookings: await listBookings(),
        });
      } catch (err) {
        if (redirectIfSessionExpired(err, signOut)) return;
        if (!quiet)
          setState({
            status: "error",
            message: err instanceof ApiError ? err.message : "Couldn't load your deliveries.",
          });
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
          {state.status === "error" && <RetryableError message={state.message} onRetry={() => void load()} />}
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
