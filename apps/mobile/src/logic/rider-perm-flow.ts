/**
 * The ONE place R3 "Go online" reaches the rider permission flow (First Run v2 P1…P13, ledger D-80 §2 #5:
 * "R3's Go online now starts the rider permission flow; P13's Go online is what goes online").
 *
 * The phase that builds P1–P16 exports its own `startRiderPermFlow`; swapping this module's body for a
 * re-export of it is the whole merge. Until then the flow is the existing priming screen
 * (`app/permissions.tsx`), which forwards straight back to the board on a phone that already primed — so a
 * rider who has granted everything goes straight online.
 *
 * `replace`, not `push`: the permission screen hands over with `router.replace("/rider")`, and a pushed
 * permission screen would put a SECOND board on top of this one (two heartbeats, two `me` pollers — R-2).
 */
export interface RiderPermFlowRouter {
  replace: (href: "/permissions?next=/rider") => void;
}

export function startRiderPermFlow(router: RiderPermFlowRouter): void {
  router.replace("/permissions?next=/rider");
}
