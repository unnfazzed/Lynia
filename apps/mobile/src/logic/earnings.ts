// Pure helper for the Earnings screen's list-vs-total reconciliation — no React, unit-testable in
// isolation. See WD-027: `tripCount`/`total` come from the server's unbounded rider-only aggregate
// (earningsSummary), while the itemized list below is filtered from the capped 50-row, both-roles
// shared history feed — the two can legitimately disagree (a rider who orders often as a customer can
// have their older rider trips pushed off the shared page), and the screen must say so rather than
// render a blank or short list under a non-zero total.
export function earningsCoverageNote(tripCount: number, shownTripCount: number): string | null {
  if (shownTripCount >= tripCount) return null;
  if (shownTripCount === 0) {
    return "None of your most recent activity is a delivered trip — older delivered trips aren't shown here. Check Trip history for your full record.";
  }
  return `Showing your ${shownTripCount} most recent delivered ${shownTripCount === 1 ? "trip" : "trips"} of ${tripCount} total.`;
}
