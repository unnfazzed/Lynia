import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { logout } from "../api/auth";
import { clearConditionalCache, configureApi } from "../api/client";
import { queryClient } from "../query/client";
import { clearPersistedQueries } from "../query/persist";
import { prewarmBootReads } from "../boot/prewarm";
import { clearDeviceState, clearSession, saveSession, type Session } from "./session";

interface AuthState {
  session: Session | null;
  loading: boolean;
  signIn: (s: Session) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Ref so the API client always reads the latest token (no stale closure on refresh).
  const ref = useRef<Session | null>(null);
  ref.current = session;

  useEffect(() => {
    configureApi({
      getSession: () => ref.current,
      onTokens: async (s) => {
        ref.current = s;
        setSession(s);
        await saveSession(s); // awaited so the rotated refresh token is durable before any retry
      },
      onSignOut: () => {
        ref.current = null;
        setSession(null);
        void clearSession();
        // A token-expiry sign-out must scrub the previous user's device state too (S1).
        void clearDeviceState();
        queryClient.clear();
        // …including the persisted query cache on disk — don't wait for the throttled persister to
        // flush the cleared state. (The in-memory ETag store is scrubbed at the throw site in
        // src/api/client.ts, before this callback runs.)
        void clearPersistedQueries();
      },
    });
    // The keychain read was STARTED at module evaluation (src/boot/prewarm.ts), not here — by the time
    // this effect runs it is usually already settled, where it used to begin only after the font gate
    // released the first render. Same read, same failure semantics (prewarm resolves null rather than
    // rejecting, so a keychain that can't decrypt means "no session" and the user re-authenticates
    // instead of the app hanging on the splash); only the moment it starts moved.
    void prewarmBootReads()
      .session.then((s) => {
        ref.current = s;
        setSession(s);
      })
      // Defensive: prewarm already swallows keychain errors, but this guarantees `loading` is released
      // even if the promise rejects unexpectedly — the splash must never be able to stick.
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (s: Session): Promise<void> => {
    ref.current = s;
    setSession(s);
    await saveSession(s);
  }, []);
  const signOut = useCallback(async (): Promise<void> => {
    // Revoke the session server-side FIRST, while the token is still live (the endpoint is authed), so a
    // deliberate sign-out actually kills the refresh token instead of leaving it valid for REFRESH_TTL
    // (30 days). Best-effort: an offline/failed revoke must never trap the local sign-out below.
    const current = ref.current;
    if (current?.refreshToken) {
      try {
        await logout(current.refreshToken);
      } catch {
        /* best-effort — proceed with the local sign-out regardless */
      }
    }
    ref.current = null;
    setSession(null);
    await clearSession();
    // Shared devices are common in the target market: also clear the previous user's cached queries
    // and per-device state (draft addresses, disclaimer flag, role, delivery codes) so the next user
    // doesn't inherit them or skip the liability disclaimer (S1). The conditional-GET (ETag) store
    // and the persisted on-disk query cache hold the same user's data, so they go too.
    await clearDeviceState();
    queryClient.clear();
    clearConditionalCache();
    await clearPersistedQueries();
  }, []);

  // Memoised, and the two actions with it. This provider wraps the ENTIRE app, so a fresh object
  // literal here invalidates the context for every `useAuth()` consumer on each provider render —
  // and `signIn`/`signOut` re-created inline would defeat the memo anyway. Not a hot path today
  // (the provider only re-renders when `session` or `loading` changes), which is exactly why it is
  // worth pinning now: it is a latent hazard the moment any other state joins this provider.
  // docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §2.6.
  const value = useMemo<AuthState>(() => ({ session, loading, signIn, signOut }), [session, loading, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
