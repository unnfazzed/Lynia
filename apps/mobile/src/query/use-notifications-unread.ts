import { useQuery } from "@tanstack/react-query";
import { getNotificationsUnreadCount } from "../api/notifications";
import { useBootPhase } from "../boot/boot-phase";

export const NOTIFICATIONS_UNREAD_COUNT_KEY = ["notifications-unread-count"] as const;

/**
 * STREAMLINE-01: the caller's unread notification count, for the Account rows' "N new" hint.
 *
 * Unread used to be invisible until you were already INSIDE the notifications centre — the per-row dot
 * was the only affordance, so the one screen that could tell you there was something to read was the
 * screen you had to guess to open. This is the count that fixes that.
 *
 * Read-only and cheap by construction: the feed behind it is bounded to seven days of activity, and the
 * notifications screen invalidates this key when it stamps the read watermark, so the hint clears in the
 * same beat as the dots rather than lagging a screen behind. Failure is silent (0) — a missing hint is a
 * strictly better outcome than an error on the Account screen for a non-core surface.
 *
 * Not read during the cold start: Home, the tab bar and the rider board all mount under the splash, and
 * a dot is not worth a connection slot while the splash waits on Home's own reads (Android runs ~5
 * requests per host at once). It is asked for the moment the boot ends, before anyone can see a bell.
 */
export function useNotificationsUnreadCount(): number {
  const { booting } = useBootPhase();
  const q = useQuery({
    queryKey: NOTIFICATIONS_UNREAD_COUNT_KEY,
    queryFn: getNotificationsUnreadCount,
    // The Account screen is a common landing spot after a push tap, so a short staleness beats a
    // per-mount refetch storm while still reflecting a dismissal made moments ago on the other screen.
    staleTime: 30_000,
    enabled: !booting,
  });
  return q.data?.count ?? 0;
}

