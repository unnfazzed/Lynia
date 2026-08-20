/**
 * The three shapes a rider's *pending* KYC check can take on screen (P0-1 / D6).
 *
 * `kycStatus === "pending"` is one server state but three different user situations, and collapsing
 * them is what let a rider who backed out of the check at step one sit on a screen that said "your ID
 * check is with Didit" — false, nothing was submitted — with no way to resume.
 *
 *   in_flight  — the check is genuinely with the vendor; the rider owes nothing and the board polls.
 *   unfinished — the rider still owes an action: never opened the check, or opened and backed out.
 *   failed     — the SDK could not be opened at all (camera, permission, network, SDK crash).
 *
 * `failed` is CLIENT-ONLY and never returned by this server. A launch failure means the SDK never
 * reached the vendor, so the session still reads "not started" — the server genuinely cannot see it.
 * The phone holds that state in memory for the current screen and degrades to `unfinished` on
 * relaunch, which is correct: after a restart we no longer know the camera is still broken.
 */
export type KycPendingState = "in_flight" | "unfinished" | "failed";

/** What the server can observe. `failed` is excluded by construction — see the note above. */
export type ServerKycPendingState = Exclude<KycPendingState, "failed">;
