import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getMe, type Me } from "../api/auth";
import { type BootstrapResponse, fetchBootstrap } from "../api/bootstrap";
import { getActiveCustomerOrders, getActiveOrder, type OrderSnapshot } from "../api/orders";
import type { Session } from "../auth/session";

/**
 * Seed the query cache from the boot aggregate — the client half of wave-2 W1. `setQueryData` marks
 * the entries fresh (dataUpdatedAt = now), so the home/rider screens mounting moments later render
 * this data immediately and, within the global 30s staleTime, skip their own initial fetches: the
 * whole signed-in boot becomes ONE compressed request instead of a per-screen fan-out. Only the
 * role-appropriate active key is seeded — the other role's key stays untouched so a dual-role user's
 * live state can't be cross-painted. Exported pure for unit tests.
 */
export function seedQueryCacheFromBootstrap(qc: QueryClient, b: BootstrapResponse): void {
  qc.setQueryData(["me"], b.me);
  if (b.me.role === "rider") qc.setQueryData(["activeJob"], b.activeOrder);
  else {
    qc.setQueryData(["activeCustomerOrder"], b.activeOrder);
    // RC.home multi-card: seed the full list too when the API ships it (older deploys don't —
    // the home screen then just fetches its own list, exactly like every other unseeded key).
    if (b.activeOrders) qc.setQueryData(["activeCustomerOrders"], b.activeOrders);
  }
}

/**
 * Start the boot aggregate for one identity and make it the ANSWER to the keys the first screens read.
 *
 * Seeding after the response (above) only helps a screen that mounts after it lands. On a cold start
 * Home mounts under the splash well before that, finds `["me"]` and `["activeCustomerOrders"]` empty,
 * and fetches both itself — two more requests on the splash's critical path ("Loading your saved
 * places"), racing the aggregate that carries the same data. So the aggregate is registered as the
 * in-flight fetch for those keys (`prefetchQuery`) the moment it starts: a screen's `useQuery` on the
 * same key joins that fetch instead of starting its own, and gets the aggregate's data when it lands.
 *
 * Every registered fetch still answers correctly without the aggregate: an older API (404 → null), a
 * failed aggregate, or a role the hint guessed wrong falls back to the key's own endpoint — the exact
 * request the screen would have made. `roleHint` (the session's role) picks the active key: the
 * customer list, or the rider's job; the other is left to its screen. Exported for unit tests.
 */
export function startBootstrap(qc: QueryClient, roleHint: string | undefined): Promise<BootstrapResponse | null> {
  const boot = fetchBootstrap();
  const answer = boot.catch(() => null);
  const retry = qc.getDefaultOptions().queries?.retry;
  void qc.prefetchQuery<Me>({
    queryKey: ["me"],
    queryFn: async () => (await answer)?.me ?? getMe(),
    retry,
  });
  if (roleHint === "rider") {
    void qc.prefetchQuery<OrderSnapshot | null>({
      queryKey: ["activeJob"],
      queryFn: async () => {
        const b = await answer;
        return b && b.me.role === "rider" ? b.activeOrder : getActiveOrder();
      },
      retry,
    });
  } else {
    void qc.prefetchQuery<OrderSnapshot[]>({
      queryKey: ["activeCustomerOrders"],
      queryFn: async () => {
        const b = await answer;
        return b && b.me.role !== "rider" && b.activeOrders ? b.activeOrders : getActiveCustomerOrders();
      },
      retry,
    });
  }
  return boot;
}

/** The launch's keychain read starts the aggregate once per process (see useBootstrap). */
let prewarmPathUsed = false;

/** Test seam: a fresh process. */
export function __resetBootstrapForTest(): void {
  prewarmPathUsed = false;
}

/**
 * Fire the boot aggregate once per signed-in identity, as early as the session is known (mounted at
 * the app root, before any screen's queries mount). Failure is always safe: seed nothing and let
 * every screen fetch individually exactly as before — the aggregate is an accelerant, never a
 * dependency. On failure the once-guard resets so a later identity change retries.
 *
 * AS EARLY AS THE SESSION IS KNOWN means the prewarmed keychain read (`launchSession`, the root layout
 * passes src/boot/prewarm.ts's), not the
 * AuthProvider re-render that follows it: that re-render commits the whole provider subtree before an
 * effect keyed on `session` can run. This mounts in the same commit as AuthProvider (it is AuthProvider's
 * child, so its effect subscribes FIRST); AuthProvider then subscribes `apply` to the same promise. The
 * start is deferred one microtask past this subscription's reaction, so AuthProvider's reaction — which
 * hands the session to the API client — has run by the time the request reads it. Even if that order
 * ever broke, the request would only go out unauthenticated, get a 401 with no refresh token to try,
 * and fail into the fallbacks above; it can never sign anyone out.
 */
export function useBootstrap(session: Session | null, launchSession?: () => Promise<Session | null>): void {
  const qc = useQueryClient();
  const seededFor = useRef<string | null>(null);
  const current = useRef<string | null>(session?.profileId ?? null);
  current.current = session?.profileId ?? null;

  const begin = useRef((profileId: string, roleHint: string | undefined): void => {
    if (seededFor.current === profileId) return;
    seededFor.current = profileId;
    startBootstrap(qc, roleHint)
      .then((b) => {
        // A sign-out or account switch meanwhile: the response belongs to a session that is gone.
        if (b && seededFor.current === profileId && current.current === profileId) seedQueryCacheFromBootstrap(qc, b);
      })
      .catch(() => {
        if (seededFor.current === profileId) seededFor.current = null; // let a future session change retry
      });
  }).current;

  useEffect(() => {
    if (!launchSession || prewarmPathUsed) return;
    prewarmPathUsed = true;
    let alive = true;
    void launchSession()
      .then((s) => Promise.resolve(s))
      .then((s) => {
        // Only while no identity has been applied that differs from the launch read (a remount after
        // a sign-in in this process reads `session` below instead).
        if (alive && s && (current.current == null || current.current === s.profileId)) begin(s.profileId, s.role);
      });
    return () => {
      alive = false;
    };
  }, [begin, launchSession]);

  useEffect(() => {
    if (session?.profileId) begin(session.profileId, session.role);
  }, [session?.profileId, session?.role, begin]);
}
