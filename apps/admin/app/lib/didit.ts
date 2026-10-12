/**
 * Didit (the rider ID-check vendor) as the KYC review screen reads it. Lynia never receives the ID-card
 * scan or the liveness capture — Didit holds them — so the reviewer's evidence is Didit's own session
 * page, opened from the rider's `kycRef` (the Didit session id).
 */

/** Didit business console: one session's page is `${DIDIT_CONSOLE_SESSIONS_URL}/<session id>`. */
export const DIDIT_CONSOLE_SESSIONS_URL = "https://business.didit.me/sessions";

export function diditSessionUrl(kycRef: string): string {
  return `${DIDIT_CONSOLE_SESSIONS_URL}/${encodeURIComponent(kycRef)}`;
}

/** Didit statuses that mean the rider never finished the check: nothing at Didit has been judged yet. */
const UNFINISHED = new Set(["not started", "in progress", "abandoned", "expired"]);

/**
 * Whether the rider left the Didit check unfinished. `undefined` = an older API that doesn't report it,
 * so no claim either way. A held check (finished at Didit, waiting on a human) is always finished; a
 * null vendor status means no Didit result was ever recorded.
 */
export function diditUnfinished(held: boolean | undefined, vendorStatus: string | null | undefined): boolean {
  if (vendorStatus === undefined && held === undefined) return false;
  if (held) return false;
  if (vendorStatus == null) return true;
  return UNFINISHED.has(vendorStatus.trim().toLowerCase());
}

/** One plain line saying where the rider is in the Didit check, or null when the API doesn't report it. */
export function diditProgressLine(held: boolean | undefined, vendorStatus: string | null | undefined): string | null {
  if (vendorStatus === undefined && held === undefined) return null;
  const s = vendorStatus?.trim().toLowerCase() ?? null;
  if (held) return `Finished at Didit — held for a manual review${vendorStatus ? ` (Didit: ${vendorStatus})` : ""}.`;
  if (s === null) return "No ID check on record — the biker hasn't finished a Didit check.";
  if (s === "approved") return "Finished at Didit — Didit approved it.";
  if (s === "declined") return "Finished at Didit — Didit declined it.";
  if (s === "in review") return "Finished at Didit — waiting in Didit's review.";
  if (s === "not started") return "Not started — the biker hasn't begun the Didit check.";
  if (s === "in progress") return "In progress — the biker started the Didit check but hasn't finished it.";
  if (s === "abandoned") return "Abandoned — the biker left the Didit check unfinished.";
  if (s === "expired") return "Expired — the Didit session ran out before the biker finished.";
  return `Didit status: ${vendorStatus}.`;
}
