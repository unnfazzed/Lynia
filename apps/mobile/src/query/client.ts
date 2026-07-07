import { QueryClient } from "@tanstack/react-query";
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
  if (error instanceof ApiError && error.status !== 0 && error.status < 500) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
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

export const orderKey = (id: string): readonly ["order", string] => ["order", id];
export const offersKey = (id: string): readonly ["offers", string] => ["offers", id];
