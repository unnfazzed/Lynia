import { setOnline } from "../api/riders";
import { saveRolePreference } from "../auth/session";

/**
 * The rider → customer switch (Rider v2 C4 / C5), shared by the Account toggle and the Notifications
 * sheet so both do the same thing (MA-H3): the side is saved, so the next cold start opens on it (R-5),
 * and — with no job running (C4) — the rider goes offline, which is what stops new jobs reaching them.
 * With a job running (C5) they stay online for it. Resolves false when going offline failed, so the
 * caller can say so; the save never throws.
 */
export async function switchToCustomer(hasActiveJob: boolean): Promise<boolean> {
  await saveRolePreference("customer");
  if (hasActiveJob) return true;
  try {
    await setOnline(false);
    return true;
  } catch {
    return false;
  }
}
