import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { logout } from "../api/auth";
import { clearConditionalCache, configureApi } from "../api/client";
import { queryClient } from "../query/client";
import { clearPersistedQueries } from "../query/persist";
import { clearDeviceState, clearSession, loadSession, saveSession, type Session } from "./session";

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
    void loadSession()
      .then((s) => {
        ref.current = s;
        setSession(s);
      })
      // loadSession already swallows keychain errors, but a defensive .catch guarantees the splash is
      // released even if the read rejects unexpectedly — a failed read is treated as "no session".
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (s: Session): Promise<void> => {
    ref.current = s;
    setSession(s);
    await saveSession(s);
  };
  const signOut = async (): Promise<void> => {
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
  };

  return <AuthContext.Provider value={{ session, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
