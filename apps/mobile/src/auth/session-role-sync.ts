import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Me } from "../api/auth";
import { useAuth } from "./auth-context";
import { saveRiderVerifiedHint } from "./device-state";
import type { Session } from "./session";

/**
 * Keeps the stored session's `role` in step with the server's (`/auth/me`), and the device's last-known
 * "verified biker" flag with it.
 *
 * `session.role` is captured once, at sign-in, and only C5 ever patched it — so a customer who became a
 * biker kept `role: "customer"` in the session for good. Everything that reads it then guessed wrong: the
 * boot aggregate's role hint (use-bootstrap.ts), push routing for a biker (use-push-registration.ts) and
 * the cold-start fallback when no side is saved (boot-route.ts). Become a rider patches it itself; this is
 * the backstop for every other way the role changes (another device, an admin, a reinstall), applied
 * whenever any screen's `["me"]` read lands. Reads the shared cache only — it never fetches.
 */
export interface MeSyncDeps {
  session: Pick<Session, "profileId" | "role"> | null;
  updateSession: (patch: Partial<Session>) => Promise<void>;
  saveVerified: (verified: boolean) => Promise<void>;
}

/** What one `me` read changes — exported for the unit test. */
export function reconcileMe(me: Pick<Me, "profileId" | "role" | "rider"> | undefined, deps: MeSyncDeps, last: { verified: boolean | null }): void {
  if (!me || !deps.session || me.profileId !== deps.session.profileId) return;
  if (me.role && me.role !== deps.session.role) void deps.updateSession({ role: me.role });
  const verified = me.rider?.kycStatus === "verified";
  if (last.verified !== verified) {
    last.verified = verified;
    void deps.saveVerified(verified);
  }
}

/** Subscribes to the `["me"]` cache entry and reconciles each landed read. Returns an unsubscribe. */
export function watchMe(client: QueryClient, deps: () => MeSyncDeps): () => void {
  const last = { verified: null as boolean | null };
  const check = (): void => reconcileMe(client.getQueryData<Me>(["me"]), deps(), last);
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.query.queryKey.length === 1 && event.query.queryKey[0] === "me") check();
  });
  check();
  return unsubscribe;
}

export function useSessionRoleSync(): void {
  const client = useQueryClient();
  const { session, updateSession } = useAuth();
  const profileId = session?.profileId ?? null;
  const role = session?.role ?? null;
  useEffect(() => {
    if (!profileId) return;
    return watchMe(client, () => ({ session: { profileId, role: role ?? "" }, updateSession, saveVerified: saveRiderVerifiedHint }));
  }, [client, profileId, role, updateSession]);
}
