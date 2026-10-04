"use client";

import { useCallback, useEffect, useState } from "react";
import type { MerchantBookingResponse } from "@lynia/shared";
import { ApiError } from "./api-client";
import { pollIntervalMs } from "./booking";
import { listBookings } from "./bookings-api";

/** How often to re-read the bookings: the fastest any live booking needs, else every 30 s. */
export function bookingsPollMs(bookings: readonly MerchantBookingResponse[]): number {
  return bookings
    .filter((b) => !b.rebroadcastedToId)
    .map((b) => pollIntervalMs(b.state))
    .reduce<number>((min, ms) => (ms == null ? min : Math.min(min, ms)), 30_000);
}

/**
 * A shop's own rider bookings, polled for the Orders board (Merchant v2 S1, ledger D-77): BOOKED cards
 * sit in the same list as the shop's customer orders.
 */
export function useBookings(enabled: boolean): { bookings: MerchantBookingResponse[]; loaded: boolean; error: ApiError | null; reload: () => Promise<void> } {
  const [bookings, setBookings] = useState<MerchantBookingResponse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const reload = useCallback(async () => {
    try {
      setBookings(await listBookings());
      setLoaded(true);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "Couldn't load your deliveries."));
    }
  }, []);
  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);
  const interval = bookingsPollMs(bookings);
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => void reload(), interval);
    return () => clearInterval(id);
  }, [enabled, interval, reload]);
  return { bookings, loaded, error, reload };
}
