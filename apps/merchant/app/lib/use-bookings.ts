"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MerchantBookingResponse } from "@lynia/shared";
import { ApiError } from "./api-client";
import { isLiveBooking, pollIntervalMs } from "./booking";
import { listBookings } from "./bookings-api";
import { createCoalescedFetch } from "./coalesced-fetch";
import { readsGeneration } from "./read-cache";

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
 * MJ-RL26: fold a live-only read into the last full list. A live booking the list doesn't hold — a new
 * one, or one older than the history's newest 50 (a delivery whose cash is still due) — is added in its
 * place by time. Null when a booking the list had as live is no longer live: only a full read shows how
 * it ended (and a re-sent one marking the booking it replaced).
 */
export function mergeLiveBookings(full: readonly MerchantBookingResponse[], liveRead: readonly MerchantBookingResponse[]): MerchantBookingResponse[] | null {
  // An API from before `?status=live` sends the whole history: only its live rows count here.
  const live = liveRead.filter(isBoardBooking);
  const byId = new Map(live.map((b) => [b.id, b]));
  if (full.some((b) => isBoardBooking(b) && !byId.has(b.id))) return null;
  const known = new Set(full.map((b) => b.id));
  const added = live.filter((b) => !known.has(b.id));
  const merged = full.map((b) => byId.get(b.id) ?? b);
  if (added.length === 0) return merged;
  // Newest first, as the API lists them (a stable sort keeps the API's order among equal times).
  return [...merged, ...added].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** MJ-RM5 review: the last list any screen read, shared by every `useBookings` (the live bar on each tab,
 *  Orders, Deliveries). A tab hop starts from it and reads only the live bookings, instead of the whole
 *  50-booking history again. Dropped after a write, a branch switch or sign-out (`readsGeneration`). */
const SNAPSHOT_FRESH_MS = 60_000;
let snapshot: { list: MerchantBookingResponse[]; at: number; gen: number } | null = null;

function freshSnapshot(): MerchantBookingResponse[] | null {
  if (!snapshot || snapshot.gen !== readsGeneration() || Date.now() - snapshot.at > SNAPSHOT_FRESH_MS) return null;
  return snapshot.list;
}

/** For tests. */
export function clearBookingsSnapshot(): void {
  snapshot = null;
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
  const [seed] = useState(freshSnapshot);
  const [bookings, setBookings] = useState<MerchantBookingResponse[]>(seed ?? []);
  const [loaded, setLoaded] = useState(seed !== null);
  const [error, setError] = useState<ApiError | null>(null);
  const fullRef = useRef<MerchantBookingResponse[] | null>(seed);
  const wantFullRef = useRef(seed === null);

  const read = useMemo(
    () =>
      createCoalescedFetch(async (isLatest) => {
        const full = wantFullRef.current ? null : fullRef.current;
        wantFullRef.current = false;
        const gen = readsGeneration();
        try {
          const next = full ? (mergeLiveBookings(full, await listBookings({ live: true })) ?? (await listBookings())) : await listBookings();
          if (!isLatest()) return;
          fullRef.current = next;
          snapshot = { list: next, at: Date.now(), gen };
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
    // Seeded from another screen's fresh list: a live-only read brings it up to date.
    void (fullRef.current !== null && !wantFullRef.current ? read() : reload());
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, read, reload]);

  const interval = bookingsPollMs(bookings);
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => void read(), interval);
    return () => clearInterval(id);
  }, [enabled, interval, read]);
  return { bookings, loaded, error, reload };
}
