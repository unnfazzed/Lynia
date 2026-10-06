import { COMMISSION } from "@lynia/shared";

/**
 * The free-jobs top-up reminder (ledger D-79, owner 2026-10-06). Calm Mint v2 R3 promises "After these,
 * commission comes off a prepaid balance. We'll remind you before you need to top up." — so a rider is
 * told twice: when one commission-free job is left, and when none are.
 *
 * `freeJobsLeft` is derived from `Rider.tripsCount` (D-70), which only ever grows, one per completed job.
 * So each milestone is a single exact count: the job that takes the rider to `freeFirstJobs - 1` completed
 * jobs leaves one free job, the one that takes them to `freeFirstJobs` leaves none. A later job never
 * re-fires either, and a rider who passed both before this shipped is never told late.
 */
export type FreeJobsMilestone = "one_left" | "used_up";

/** The milestone the job that brought the rider to `tripsCountAfter` completed jobs crosses, if any. */
export function freeJobsMilestoneAt(tripsCountAfter: number | null | undefined): FreeJobsMilestone | null {
  if (typeof tripsCountAfter !== "number" || !Number.isFinite(tripsCountAfter)) return null;
  const total = COMMISSION.freeFirstJobs;
  if (total <= 0) return null;
  if (tripsCountAfter === total) return "used_up";
  if (total > 1 && tripsCountAfter === total - 1) return "one_left";
  return null;
}

/**
 * The audit action each milestone writes. The row is the reminder's idempotency key (one per rider per
 * milestone) and the source of its in-app Notifications row (ACCOUNT_FEED_COPY). Reserved in
 * admin-audit.service so the free-text audit route can't forge one.
 */
export const FREE_JOBS_ACTION: Record<FreeJobsMilestone, string> = {
  one_left: "rider.free_jobs_one_left",
  used_up: "rider.free_jobs_used_up",
};

/** The push and the feed row, word for word (owner 2026-10-06; ledger D-79). */
export const FREE_JOBS_COPY: Record<FreeJobsMilestone, { title: string; body: string }> = {
  one_left: {
    title: "One commission-free job left",
    body: "After your next job, commission comes off your prepaid balance. Top up in Money so you can keep going online.",
  },
  used_up: {
    title: "Your free jobs are used up",
    body: "Commission now comes off your prepaid balance. Top up in Money to keep going online.",
  },
};

/** The push's `kind`. The app routes it to the rider's Money tab (`pushDestination`). */
export const FREE_JOBS_PUSH_KIND = "free_jobs";
