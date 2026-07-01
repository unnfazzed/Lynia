import * as Notifications from "expo-notifications";
import { useRootNavigationState, useRouter } from "expo-router";
import { useEffect, useRef } from "react";

/**
 * The `data` payload the backend attaches to every push (see `apps/api/.../notifications.service.ts`).
 * Everything is optional and string-typed — FCM data values are always strings, and a malformed or
 * partial payload must never crash the tap handler.
 */
interface PushData {
  orderId?: string;
  status?: string;
  kind?: "offer" | "broadcast";
}

/**
 * Order statuses whose push is aimed at the *rider* (see `STATUS_NOTICES` server-side): being hired
 * and being freed. Tapping either drops the rider into their active-job screen. Every other lifecycle
 * status targets the customer watching the trip, so it routes to the order/tracking screen instead.
 */
const RIDER_STATUSES = new Set(["assigned", "completed"]);

/**
 * Decide where a tapped notification should land from its `data` payload. Returns `null` when there's
 * nothing sensible to open (unknown / empty payload) so the caller can no-op rather than navigate.
 *
 * - `kind: "broadcast"` → the rider board (a nearby order is up for grabs)
 * - `kind: "offer"`     → the customer's order screen (compare the rider's offer)
 * - a rider-facing `status` (assigned/completed) → the rider's active job
 * - any other lifecycle `status`, or a bare `orderId` → the customer's order/tracking screen
 */
function routeFor(data: PushData): string | null {
  if (data.kind === "broadcast") return "/rider";
  if (data.kind === "offer" && data.orderId) return `/order/${data.orderId}`;
  if (data.status && RIDER_STATUSES.has(data.status)) return "/rider/job";
  if (data.orderId) return `/order/${data.orderId}`;
  return null;
}

/**
 * Deep-link on notification taps. Handles both **warm** taps (app already running — the response
 * listener) and **cold-start** taps (a killed app launched by the tap — the last-response query on
 * mount). Fully best-effort and defensive: an unrecognised or missing payload is ignored, and nothing
 * here ever throws. Renders nothing; mount it once under the router (root layout) alongside PushSync.
 */
export function usePushNotificationRouter(): void {
  const router = useRouter();
  // `undefined` until the root navigator has mounted. Navigating before that is a no-op-or-warn in
  // expo-router ("navigate before mounting the Root Layout"), which would silently drop a cold-start
  // deep link. We gate the cold-start push on this becoming defined; warm taps can't race it.
  const navReady = useRootNavigationState()?.key != null;
  // Path a cold-start tap wants to open, held until the navigator is ready.
  const pendingPath = useRef<string | null>(null);
  // Live readiness, read by the once-only mount effect's async callback (its closure captures the
  // initial `navReady`, so it needs the ref to see the current value).
  const navReadyRef = useRef(navReady);

  useEffect(() => {
    const navigate = (response: Notifications.NotificationResponse | null): void => {
      const data = response?.notification.request.content.data as PushData | undefined;
      if (!data) return;
      const path = routeFor(data);
      if (path) router.push(path);
    };

    // Cold start: the tap that launched the app is surfaced here, once, on mount. If the navigator
    // isn't mounted yet, stash the path and let the readiness effect below flush it.
    let cancelled = false;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (cancelled) return;
      const data = response?.notification.request.content.data as PushData | undefined;
      const path = data ? routeFor(data) : null;
      if (!path) return;
      if (navReadyRef.current) router.push(path);
      else pendingPath.current = path;
    });

    // Warm taps: fires for every tap while the app is alive (foreground or background). The navigator
    // is already mounted for these, so they navigate immediately.
    const subscription = Notifications.addNotificationResponseReceivedListener(navigate);

    return () => {
      cancelled = true;
      subscription.remove();
    };
    // `router` is stable for the app's lifetime; run this wiring exactly once.
  }, [router]);

  // Keep the readiness ref in sync and flush any cold-start path that arrived before the navigator.
  useEffect(() => {
    navReadyRef.current = navReady;
    // Flush a cold-start path that arrived before the navigator was ready.
    if (navReady && pendingPath.current) {
      const path = pendingPath.current;
      pendingPath.current = null;
      router.push(path);
    }
  }, [navReady, router]);
}
