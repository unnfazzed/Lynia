import type { ScheduleSlotsResponse } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { getCustomerBalance, getScheduleSlots } from "../api/order-flow";
import { carriedBalance } from "../logic/review";

/** Rounded so a pin nudged a few metres doesn't refetch the slots (≈110 m at 3 decimals). */
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export const scheduleSlotsKey = (merchantId: string, at: { lat: number; lng: number } | null): readonly unknown[] => [
  "orderflow",
  "slots",
  merchantId,
  at ? r3(at.lat) : null,
  at ? r3(at.lng) : null,
];

/**
 * Order flow v2 R5a–c (BRIEF §12): the venue's schedule slots for this drop-off. Slots move with the clock
 * (a slot closes once the venue can't meet it), so the answer is kept for a minute, not forever.
 */
export function useScheduleSlots(
  merchantId: string | null | undefined,
  at: { lat: number; lng: number } | null,
  enabled: boolean,
): { slots: ScheduleSlotsResponse | undefined; isLoading: boolean; isError: boolean } {
  const point = at ? { lat: r3(at.lat), lng: r3(at.lng) } : null;
  const q = useQuery({
    queryKey: scheduleSlotsKey(merchantId ?? "", point),
    queryFn: () => getScheduleSlots(merchantId as string, point),
    enabled: enabled && !!merchantId,
    staleTime: 60_000,
  });
  // A malformed 200 reads as no slots, never as a half-object every consumer would crash on (CF-04).
  const ok = q.data != null && Array.isArray(q.data.today?.slots) && Array.isArray(q.data.tomorrow?.slots);
  return { slots: ok ? q.data : undefined, isLoading: q.isLoading, isError: q.isError || (q.data != null && !ok) };
}

/**
 * BRIEF D3f: the owed balance a new order will carry (`previousBalanceUsd`) — every line not already
 * carried by a live order. 0 until the read lands or when it fails: the server adds the real figure to the
 * order's total either way, so this only decides whether Review can SHOW it before placing.
 */
export function useCarriedBalance(enabled: boolean): number {
  const q = useQuery({ queryKey: ["orderflow", "balance"], queryFn: getCustomerBalance, enabled, staleTime: 0 });
  return q.data && Array.isArray(q.data.lines) ? carriedBalance(q.data) : 0;
}
