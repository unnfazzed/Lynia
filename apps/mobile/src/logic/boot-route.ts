import type { StartRole } from "../auth/session";

/**
 * Pure cold-start routing decision (index.tsx), extracted so it's unit-testable without rendering.
 *
 * BH-15: `needsProfile` is checked BEFORE the role fork/home so an interrupted /profile/setup (app
 * kill, dropped PATCH response) re-prompts on every relaunch instead of silently landing a still-
 * unnamed account on /home or /rider forever — the account's session carries `needsProfile` durably
 * (captured at sign-in, cleared only once the PATCH actually lands) precisely so this check survives
 * a killed app.
 */
export function bootDestination(params: {
  session: { needsProfile?: boolean } | null;
  onboardingSeen: boolean;
  rolePref: StartRole | null;
}): "/onboarding" | "/phone" | "/profile/setup" | "/rider" | "/home" {
  const { session, onboardingSeen, rolePref } = params;
  if (!session && !onboardingSeen) return "/onboarding";
  if (!session) return "/phone";
  if (session.needsProfile) return "/profile/setup";
  return rolePref === "rider" ? "/rider" : "/home";
}
