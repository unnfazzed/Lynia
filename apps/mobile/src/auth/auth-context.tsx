import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { logout } from "../api/auth";
import { configureApi } from "../api/client";
import { queryClient } from "../query/client";
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
      },
    });
    void loadSession().then((s) => {
      ref.current = s;
      setSession(s);
      setLoading(false);
    });
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
    // doesn't inherit them or skip the liability disclaimer (S1).
    await clearDeviceState();
    queryClient.clear();
  };

  return <AuthContext.Provider value={{ session, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
