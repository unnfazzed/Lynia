import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { configureApi } from "../api/client";
import { clearSession, loadSession, saveSession, type Session } from "./session";

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
    ref.current = null;
    setSession(null);
    await clearSession();
  };

  return <AuthContext.Provider value={{ session, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
