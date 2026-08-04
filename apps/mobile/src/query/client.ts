import { focusManager, QueryClient } from "@tanstack/react-query";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { ApiError } from "../api/client";

/**
 * Decide whether a failed query is worth retrying. Network failures (ApiError status 0: the constrained
 * link dropped) and transient server 5xx are; a 4xx is a deterministic answer (auth, validation, a
 * domain conflict) that a retry would only repeat, wasting the very bandwidth we're short on. An
 * unexpected non-ApiError is treated as transient. Capped at 2 attempts — with `onlineManager` wired to
 * reachability, a real outage PAUSES the query and auto-resumes on reconnect, so retries only need to
 * cover a brief blip, not the whole outage. Exported for unit testing.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  // A non-retryable ApiError (a 4xx deterministic answer) is never retried. An unexpected non-ApiError
  // throw is treated as transient — for a READ, re-issuing a GET is safe. Writes do not come through
  // here (see the `mutations` policy below). Delegates the per-error classification to ApiError.retryable.
  if (error instanceof ApiError && !error.retryable) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      // Retry ownership (docs/ARCHITECTURE.md §Retry ownership): writes are NON-RETRYABLE by default —
      // a money-moving or state-changing POST that fails ambiguously must not be silently re-sent from
      // the client (Airbnb's "default non-retryable"). This is TanStack's default too; pinning it here
      // makes the safe choice explicit so a future `retry:` on an individual mutation is a deliberate,
      // reviewed act (and must carry an idempotency key — see the wallet/top-up flows).
      retry: false,
    },
    queries: {
      retry: shouldRetry,
      refetchOnWindowFocus: false,
      // Serve cached data instantly on back-navigation (History → Order → back) and revalidate
      // quietly, instead of a skeleton on every remount. Live screens stay fresh via their own
      // refetchInterval + the WS pushes, which fire regardless of staleTime.
      staleTime: 30_000,
      // networkMode "online" (the default) means: while reachability reports offline, queries don't
      // fire into the dead link — they park as "paused" and auto-run the moment we reconnect. Refetch
      // when the app regains connectivity so a screen left open through a tunnel/dead-zone refreshes
      // itself without a manual pull.
      refetchOnReconnect: true,
    },
  },
});

/**
 * ALR-09: mutations keep the default `networkMode:"online"` (deliberately — a global flip would touch
 * every rollback path at once, see docs/KNOWN_BUGS.md). That means a mutation fired while offline
 * PAUSES instead of sending: `isPending` stays true for the whole outage, indistinguishable from a
 * request genuinely in flight. A Button driven straight off `isPending` therefore spins forever with
 * no hint that nothing is actually happening on the wire. This derives the Button-facing tri-state —
 * "queued" while paused (not lying that it's in flight), `true` while genuinely pending, else `false` —
 * for one mutation or several sharing a single control (e.g. an accept/dispute pair).
 */
export function pendingOrQueued(...mutations: readonly { isPending: boolean; isPaused: boolean }[]): boolean | "queued" {
  if (mutations.some((m) => m.isPaused)) return "queued";
  return mutations.some((m) => m.isPending);
}

export const orderKey = (id: string): readonly ["order", string] => ["order", id];
export const offersKey = (id: string): readonly ["offers", string] => ["offers", id];

/**
 * Without this, React Query's default `isFocused()` never goes false, so every screen's
 * `refetchInterval` (order/offers polling, board polling, active-job polling) keeps firing on
 * schedule while the app is backgrounded — burning data and battery on the exact cheap-Android,
 * expensive-data profile this app targets. Call once at the app root.
 */
export function wireFocusManager(): () => void {
  const onChange = (status: AppStateStatus): void => {
    if (Platform.OS !== "web") focusManager.setFocused(status === "active");
  };
  const sub = AppState.addEventListener("change", onChange);
  return () => sub.remove();
}
