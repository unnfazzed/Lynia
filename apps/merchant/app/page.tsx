import { redirect } from "next/navigation";

/**
 * Root route. The fail-closed middleware (middleware.ts, E1) already redirected an unauthenticated
 * request to /login before this ever renders — an authenticated request just needs to land on the
 * dashboard's home section. See docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md Lane E,
 * E1: this replaces the P0 scaffold placeholder now that the first authenticated surface exists.
 */
export default function RootPage() {
  redirect("/queue");
}
