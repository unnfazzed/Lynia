import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { type BootstrapResponse, fetchBootstrap } from "../api/bootstrap";
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
  else qc.setQueryData(["activeCustomerOrder"], b.activeOrder);
}

/**
 * Fire the boot aggregate once per signed-in identity, as early as the session is known (mounted at
 * the app root, before any screen's queries mount). Failure is always safe: seed nothing and let
 * every screen fetch individually exactly as before — the aggregate is an accelerant, never a
 * dependency. On failure the once-guard resets so a later identity change retries.
 */
export function useBootstrap(session: Session | null): void {
  const qc = useQueryClient();
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    const profileId = session?.profileId ?? null;
    if (!profileId || seededFor.current === profileId) return;
    seededFor.current = profileId;
    let cancelled = false;
    fetchBootstrap()
      .then((b) => {
        if (!cancelled && b) seedQueryCacheFromBootstrap(qc, b);
      })
      .catch(() => {
        if (!cancelled) seededFor.current = null; // let a future session change retry
      });
    return () => {
      cancelled = true;
    };
  }, [session?.profileId, qc]);
}
