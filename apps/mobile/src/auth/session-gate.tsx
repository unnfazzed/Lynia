import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuth } from "./auth-context";
import type { Session } from "./session";

/**
 * True on a LOGOUT transition: the session went from present to null. This is the one case the
 * cold-boot router (app/index.tsx) can never handle — index is the "/" route, evaluated only at
 * launch; once it redirects away it unmounts and never re-runs, so a session that becomes null
 * mid-run (a deliberate "Sign out", or a server-forced 401 sign-out on a revoked/expired refresh
 * token, suspension, or KYC expiry) would otherwise strand the user on a now-authless protected
 * screen with failing queries and no route out. A brand-new user who is legitimately logged out
 * (prev null → still null) must NOT trip this — that is the normal onboarding/verify flow, which
 * renders fine without a session. Exported pure for unit testing.
 */
export function isLogoutTransition(prev: Session | null, next: Session | null): boolean {
  return prev != null && next == null;
}

/**
 * Watches the auth session and, the moment it drops from present to null after boot, redirects to
 * the login screen. Renders nothing. Mounted under AuthProvider, alongside the navigator. Without
 * it, sign-out appears to do nothing (the user sits on Settings/Profile) and a forced logout breaks
 * whatever protected screen they were on — recoverable only by force-killing the app, which is a
 * non-obvious ask for the low-end-phone target users and a hard trust hit on a shared device (the
 * next user cannot reach the login screen at all).
 */
export function SessionGate(): null {
  const { session, loading } = useAuth();
  const router = useRouter();
  // Baseline the previous session only once loading settles, so the initial null→(session|null)
  // hydration on cold boot is never mistaken for a logout.
  const prev = useRef<Session | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (loading) return;
    // replace (not push) so the authless screen they were on is left behind and Back can't return to it.
    if (settled.current && isLogoutTransition(prev.current, session)) router.replace("/phone");
    settled.current = true;
    prev.current = session;
  }, [session, loading, router]);

  return null;
}
