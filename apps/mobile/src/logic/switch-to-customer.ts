import { getActiveOrder } from "../api/orders";
import { setOnline } from "../api/riders";
import { saveRolePreference } from "../auth/session";

/** JQ-R3-04: one quiet second try at going offline before the switch says it failed. */
const OFFLINE_RETRY_MS = 1_500;

/**
 * The rider → customer switch (Rider v2 C4 / C5), shared by the Account toggle and the Notifications
 * sheet so both do the same thing (MA-H3): the side is saved, so the next cold start opens on it (R-5),
 * and — with no job running (C4) — the rider goes offline, which is what stops new jobs reaching them.
 * With a job running (C5) they stay online for it. Resolves false when going offline failed, so the
 * caller can say so; the save never throws.
 *
 * `hasActiveJob` is null when the caller's active-job read hasn't settled (JQ-R3-04: on a slow link it
 * used to count as "no job" and take a rider offline mid-job) — the helper then asks the server itself.
 */
export async function switchToCustomer(hasActiveJob: boolean | null, wait: (ms: number) => Promise<void> = sleep): Promise<boolean> {
  await saveRolePreference("customer");
  const active = hasActiveJob ?? (await getActiveOrder().then((o) => o != null && o.status !== "cancelled", () => false));
  if (active) return true;
  for (let attempt = 0; ; attempt++) {
    try {
      await setOnline(false);
      return true;
    } catch {
      if (attempt >= 1) return false;
      await wait(OFFLINE_RETRY_MS);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
