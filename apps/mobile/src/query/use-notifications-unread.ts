import { useQuery } from "@tanstack/react-query";
import { getNotificationsUnreadCount } from "../api/notifications";

export const NOTIFICATIONS_UNREAD_COUNT_KEY = ["notifications-unread-count"] as const;

/**
 * STREAMLINE-01: the caller's unread notification count, for the Account rows' "N new" hint.
 *
 * Unread used to be invisible until you were already INSIDE the notifications centre — the per-row dot
 * was the only affordance, so the one screen that could tell you there was something to read was the
 * screen you had to guess to open. This is the count that fixes that.
 *
 * Read-only and cheap by construction: the feed behind it is bounded to one day of activity, and the
 * notifications screen invalidates this key when it stamps the read watermark, so the hint clears in the
 * same beat as the dots rather than lagging a screen behind. Failure is silent (0) — a missing hint is a
 * strictly better outcome than an error on the Account screen for a non-core surface.
 */
export function useNotificationsUnreadCount(): number {
  const q = useQuery({
    queryKey: NOTIFICATIONS_UNREAD_COUNT_KEY,
    queryFn: getNotificationsUnreadCount,
    // The Account screen is a common landing spot after a push tap, so a short staleness beats a
    // per-mount refetch storm while still reflecting a dismissal made moments ago on the other screen.
    staleTime: 30_000,
  });
  return q.data?.count ?? 0;
}

/**
 * The Notifications row's sub-line, with the unread count in front of it when there is one.
 *
 * The mock's string is preserved VERBATIM as the tail (`docs/DESIGN-DEVIATIONS.md` D-26 covers the
 * prefix) — the count is additive, and at zero unread the row reads exactly as the kit draws it. Shared
 * by both Account screens so the customer and rider tails cannot drift apart.
 */
export function notificationsRowSub(unreadCount: number): string {
  const base = "One inbox for both services";
  return unreadCount > 0 ? `${unreadCount} new · ${base}` : base;
}
