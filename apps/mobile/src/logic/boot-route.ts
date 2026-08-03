import type { StartRole } from "../auth/session";
import { pushDestination } from "../push/push";

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

/**
 * LC-D-T3: the actual cold-boot navigation target, combining {@link bootDestination} with a cold-start
 * push-tap deep link. index.tsx used to compute the deep link in a SEPARATE effect (usePushRegistration)
 * that called `router.push` independently of this screen's own `<Redirect>` — two uncoordinated
 * navigations racing on first mount, so whichever resolved second silently won, and a slow-resolving
 * boot redirect could clobber a tap that had already opened the order. Pulled into one function (and one
 * caller) so the deep link can only ever be considered together with, never after, the ordinary
 * destination — closing the race by construction rather than by timing luck.
 *
 * `coldStartData` is the data payload of the notification whose tap launched this process (`null` if
 * none). Only takes priority with a signed-in session — an unauthenticated cold start has nothing to
 * deep-link into, and `pushDestination` returns `null` for any payload shape it can't route, so both
 * cases fall through to the ordinary {@link bootDestination}.
 */
export function bootRedirectTarget(params: {
  session: { needsProfile?: boolean; role?: string } | null;
  onboardingSeen: boolean;
  rolePref: StartRole | null;
  coldStartData: unknown;
}): string {
  const { session, coldStartData } = params;
  const deepLink = session ? pushDestination(coldStartData, session.role === "rider") : null;
  return deepLink ?? bootDestination(params);
}
