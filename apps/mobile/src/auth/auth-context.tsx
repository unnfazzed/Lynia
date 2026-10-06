import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { logout } from "../api/auth";
import { clearConditionalCache, configureApi } from "../api/client";
import { queryClient } from "../query/client";
import { clearPersistedQueries } from "../query/persist";
import { prewarmBootReads } from "../boot/prewarm";
import { boundPushToken } from "../push/bound-token";
import { captureException } from "../telemetry/sentry";
import { clearDeviceState, clearSession, saveSession, type Session } from "./session";

interface AuthState {
  session: Session | null;
  loading: boolean;
  signIn: (s: Session) => Promise<void>;
  /**
   * Merge `patch` into the session the auth layer holds NOW — including tokens a refresh rotated a moment
   * ago — and persist it. Use this, never `signIn({ ...session, ...patch })`: a `session` captured by a
   * render goes stale the moment a request in the same handler refreshes the tokens, and writing it back
   * restores the rotated-away refresh token (the sign-up → back-to-OTP bug profile/setup.tsx had).
   */
  updateSession: (patch: Partial<Session>) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * The session this PROCESS holds — module state, not per-mount state. AuthProvider can remount without
 * the process restarting (the root ErrorBoundary's "Reload" remounts the whole tree), and a remount must
 * carry on with the session the process last held. It used to re-apply the keychain read made at launch
 * (prewarm memoizes it), whose tokens may have rotated twice since — the server rejects those, and the
 * user was signed out and sent back to OTP by a crash-recovery tap. `undefined` until the launch read
 * settles. The one source the API client, the write queue and every action read; React state mirrors it
 * for rendering.
 */
let live: Session | null | undefined;

// Keychain writes of the session, serialized. Each one persists whatever `live` holds WHEN IT RUNS (null ⇒
// delete), not the value it was queued with, so a burst (a refresh rotating the tokens, then a profile
// patch) lands as the latest state, writes can't land out of order, and a sign-out's delete can't be
// undone by a save still in flight. A failed write never fails the sign-in or request that caused it —
// the in-memory session is already correct, and for a refresh the server has already rotated — it stays
// dirty and is retried by the next write and when the app leaves the foreground, the moment before the OS
// may kill the process. Module state for the same reason as `live`: a remount must not drop a dirty write.
let writes: Promise<void> = Promise.resolve();
let dirty = false;

function persist(): Promise<void> {
  dirty = true;
  const run = writes.then(async () => {
    if (!dirty) return; // an earlier queued write already persisted the latest state
    // Never touch the keychain before the launch read has settled — "nothing to save" must not become a
    // delete of the session that read is about to return.
    if (live === undefined) return;
    dirty = false;
    try {
      if (live) await saveSession(live);
      else await clearSession();
    } catch (err) {
      dirty = true;
      captureException(err, { tags: { area: "session-persist" } });
    }
  });
  writes = run;
  return run;
}

/** Test seam: forget the process session and its write queue, as a fresh launch would. Mirrors
 *  `__resetBootReads` in src/boot/prewarm.ts. Never called by app code. */
export function __resetAuthSession(): void {
  live = undefined;
  writes = Promise.resolve();
  dirty = false;
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [session, setSession] = useState<Session | null>(live ?? null);
  const [loading, setLoading] = useState(live === undefined);

  const apply = useCallback((next: Session | null): void => {
    live = next;
    setSession(next);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && dirty) void persist();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    configureApi({
      getSession: () => live ?? null,
      onTokens: async (s) => {
        apply(s);
        await persist(); // awaited so the rotated refresh token is written before the request retries
      },
      onSignOut: () => {
        apply(null);
        void persist(); // `live` is null ⇒ deletes the stored session
        // A token-expiry sign-out must scrub the previous user's device state too (S1).
        void clearDeviceState();
        queryClient.clear();
        // …including the persisted query cache on disk — don't wait for the throttled persister to
        // flush the cleared state. (The in-memory ETag store is scrubbed at the throw site in
        // src/api/client.ts, before this callback runs.)
        void clearPersistedQueries();
      },
    });
  }, [apply]);

  useEffect(() => {
    // A remount: this process already holds the session (see `live`) — the launch read is stale.
    if (live !== undefined) return;
    // The keychain read was STARTED at module evaluation (src/boot/prewarm.ts), not here — by the time
    // this effect runs it is usually already settled, where it used to begin only after the font gate
    // released the first render. Same read, same failure semantics (prewarm resolves null rather than
    // rejecting, so a keychain that can't decrypt means "no session" and the user re-authenticates
    // instead of the app hanging on the splash); only the moment it starts moved.
    void prewarmBootReads()
      .session.then((s) => {
        if (live === undefined) apply(s);
      })
      // Defensive: prewarm already swallows keychain errors, but this guarantees `loading` is released
      // even if the promise rejects unexpectedly — the splash must never be able to stick.
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apply]);

  const signIn = useCallback(
    async (s: Session): Promise<void> => {
      apply(s);
      await persist();
    },
    [apply],
  );
  const updateSession = useCallback(
    async (patch: Partial<Session>): Promise<void> => {
      if (!live) return; // signed out meanwhile — there is no session to patch
      apply({ ...live, ...patch });
      await persist();
    },
    [apply],
  );
  const signOut = useCallback(async (): Promise<void> => {
    // Revoke the session server-side FIRST, while the token is still live (the endpoint is authed), so a
    // deliberate sign-out actually kills the refresh token instead of leaving it valid for REFRESH_TTL
    // (a year). Best-effort: an offline/failed revoke must never trap the local sign-out below. It also
    // names this device's push token, so the next person on a shared phone doesn't get this account's
    // pushes (E2E 2026-10-05 FS-8).
    const current = live;
    if (current?.refreshToken) {
      try {
        await logout(current.refreshToken, boundPushToken());
      } catch {
        /* best-effort — proceed with the local sign-out regardless */
      }
    }
    apply(null);
    await persist(); // `live` is null ⇒ deletes the stored session
    // Shared devices are common in the target market: also clear the previous user's cached queries
    // and per-device state (draft addresses, disclaimer flag, role, delivery codes) so the next user
    // doesn't inherit them or skip the liability disclaimer (S1). The conditional-GET (ETag) store
    // and the persisted on-disk query cache hold the same user's data, so they go too.
    await clearDeviceState();
    queryClient.clear();
    clearConditionalCache();
    await clearPersistedQueries();
  }, [apply]);

  // Memoised, and the actions with it. This provider wraps the ENTIRE app, so a fresh object
  // literal here invalidates the context for every `useAuth()` consumer on each provider render —
  // and the actions re-created inline would defeat the memo anyway. Not a hot path today
  // (the provider only re-renders when `session` or `loading` changes), which is exactly why it is
  // worth pinning now: it is a latent hazard the moment any other state joins this provider.
  // docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §2.6.
  const value = useMemo<AuthState>(
    () => ({ session, loading, signIn, updateSession, signOut }),
    [session, loading, signIn, updateSession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * The auth state, or null outside an AuthProvider. For a screen that also renders where there is no
 * provider (the parity lane mounts some screens bare) and treats "unknown" differently from "signed out".
 */
export function useOptionalAuth(): AuthState | null {
  return useContext(AuthContext);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
