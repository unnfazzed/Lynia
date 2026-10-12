import { saveRolePreference } from "../auth/device-state";
import { replaceClearingStack } from "./nav";

/**
 * Opening a push or feed destination without stacking the two sides of the app on each other.
 *
 * A bare `router.push("/rider")` from a rider already in the rider tabs mounted a SECOND board over the
 * first (two sockets, two heartbeats, Back to the same board); from the customer side it put the board on
 * top of customer Home, so Back jumped sides and Home's queries kept running underneath. And a verified-
 * rider push opened the board without saving the rider side, so the next cold start opened customer Home.
 *
 * The rules, for a rider destination (`/rider…`):
 *  - the rider side is saved as the side the next cold start opens on;
 *  - a rider TAB (`/rider`, `/rider/money`, `/rider/account`) is never pushed: with the rider tabs already
 *    in the history the stack is dismissed back to them (`dismissTo`); otherwise the stack is cleared and
 *    replaced with them;
 *  - a rider screen above the tabs (a job, an offer) is pushed over the rider tabs — after clearing the
 *    customer stack and putting the rider tabs under it when the user was on the customer side.
 * A customer destination is pushed as before, except customer Home (`/home`) while the customer tabs are
 * in the history, which is dismissed back to rather than stacked a second time. Already on the target: no-op.
 */
export interface SideNav {
  push: (href: string) => void;
  replace: (href: string) => void;
  dismissAll: () => void;
  dismissTo: (href: string) => void;
  canDismiss?: () => boolean;
}

/** Where the user is: the focused pathname, and which tab shells are in the root stack's history. */
export interface SideNavContext {
  pathname: string;
  riderTabsBelow: boolean;
  customerTabsBelow?: boolean;
}

const RIDER_TABS = new Set(["/rider", "/rider/money", "/rider/account"]);

const pathOf = (href: string): string => href.split(/[?#]/)[0] ?? href;

/** True for a destination on the rider side of the app (the rider tabs and the screens above them). */
export function isRiderDestination(href: string): boolean {
  return /^\/rider(\/|\?|#|$)/.test(href);
}

export function openDestination(router: SideNav, ctx: SideNavContext, target: string): void {
  if (ctx.pathname === target) return;
  if (!isRiderDestination(target)) {
    if (pathOf(target) === "/home" && ctx.customerTabsBelow) router.dismissTo("/home");
    else router.push(target);
    return;
  }
  void saveRolePreference("rider");
  if (RIDER_TABS.has(pathOf(target))) {
    if (ctx.riderTabsBelow) router.dismissTo(target);
    else replaceClearingStack(router, target);
    return;
  }
  if (!ctx.riderTabsBelow) replaceClearingStack(router, "/rider");
  router.push(target);
}

/** The root stack's route names as React Navigation reports them (`rider/(tabs)`, `(tabs)`, `order/[id]`…). */
interface RootStateLike {
  routes?: ReadonlyArray<{ name?: string }>;
}

/** Which tab shells sit in the root stack right now — read from the navigation container's root state. */
export function tabsInHistory(state: RootStateLike | undefined | null): { riderTabsBelow: boolean; customerTabsBelow: boolean } {
  const names = (state?.routes ?? []).map((r) => r.name);
  return { riderTabsBelow: names.includes("rider/(tabs)"), customerTabsBelow: names.includes("(tabs)") };
}
