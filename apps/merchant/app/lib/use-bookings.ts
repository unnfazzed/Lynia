"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MerchantBookingResponse } from "@lynia/shared";
import { ApiError } from "./api-client";
import { isLiveBooking, pollIntervalMs } from "./booking";
import { listBookings } from "./bookings-api";
import { createCoalescedFetch } from "./coalesced-fetch";

/** How often to re-read the bookings: the fastest any live booking needs, else every 30 s (MJ-RM6: a
 *  quiet list still hears about a teammate's new booking, its rider and its cash). */
export function bookingsPollMs(bookings: readonly MerchantBookingResponse[]): number {
  return bookings
    .filter((b) => !b.rebroadcastedToId)
    .map((b) => pollIntervalMs(b.state))
    .reduce<number>((min, ms) => (ms == null ? min : Math.min(min, ms)), 30_000);
}

/** MJ-RL26: a booking the board draws — live, or delivered with its cash still due. The client's copy of
 *  the API's `?status=live` filter (`LIVE_BOOKING_WHERE`). */
export function isBoardBooking(b: Pick<MerchantBookingResponse, "state" | "cashOnDelivery">): boolean {
  return isLiveBooking(b.state) || (b.state === "delivered" && b.cashOnDelivery?.status === "due");
}

/**
 * MJ-RL26: fold a live-only read into the last full list — or null when the live set itself changed (one
 * started, ended, or a teammate booked one), which only a full read can show: an ended booking keeps its
 * place in the day's list, and a re-sent one marks the booking it replaced.
 */
export function mergeLiveBookings(full: readonly MerchantBookingResponse[], liveRead: readonly MerchantBookingResponse[]): MerchantBookingResponse[] | null {
  // An API from before `?status=live` sends the whole history: only its live rows count here.
  const live = liveRead.filter(isBoardBooking);
  const before = full.filter(isBoardBooking);
  const byId = new Map(live.map((b) => [b.id, b]));
  if (before.length !== live.length || before.some((b) => !byId.has(b.id))) return null;
  return full.map((b) => byId.get(b.id) ?? b);
}

/**
 * A shop's own rider bookings, polled for its board (Merchant v2 S1, ledger D-77: BOOKED cards sit in the
 * same list as its customer orders) — on Orders and on the Deliveries home.
 *
 * MJ-RL26 / MJ-RM6 (2026-10-07): the board used to re-read the whole 50-booking history every 3 s. Now:
 *  - one full read to start, on `reload()`, when the tab comes back to the front, and whenever the live set
 *    changes; every other tick reads only the live bookings (`?status=live`) and folds them in;
 *  - the fastest cadence a live booking needs (3 s finding, 15 s on its way), else a 30 s idle poll, so a
 *    quiet screen still sees a teammate's booking, its rider and the cash card it ends on;
 *  - one read at a time (`createCoalescedFetch`, the queue poll's rules).
 */
export function useBookings(enabled: boolean): { bookings: MerchantBookingResponse[]; loaded: boolean; error: ApiError | null; reload: () => Promise<void> } {
  const [bookings, setBookings] = useState<MerchantBookingResponse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const fullRef = useRef<MerchantBookingResponse[] | null>(null);
  const wantFullRef = useRef(true);

  const read = useMemo(
    () =>
      createCoalescedFetch(async (isLatest) => {
        const full = wantFullRef.current ? null : fullRef.current;
        wantFullRef.current = false;
        try {
          const next = full ? (mergeLiveBookings(full, await listBookings({ live: true })) ?? (await listBookings())) : await listBookings();
          if (!isLatest()) return;
          fullRef.current = next;
          setBookings(next);
          setLoaded(true);
          setError(null);
        } catch (err) {
          if (!full) wantFullRef.current = true;
          if (isLatest()) setError(err instanceof ApiError ? err : new ApiError(0, "Couldn't load your deliveries."));
        }
      }),
    [],
  );
  const reload = useMemo(
    () => () => {
      wantFullRef.current = true;
      return read();
    },
    [read],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    void reload();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, reload]);

  const interval = bookingsPollMs(bookings);
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => void read(), interval);
    return () => clearInterval(id);
  }, [enabled, interval, read]);
  return { bookings, loaded, error, reload };
}
