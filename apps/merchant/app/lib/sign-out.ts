import { endMerchantSession } from "./api-client";
import { clearBranchesCache } from "./branches";
import { clearBusinessCache } from "./business";

/**
 * Every sign-out, wherever it starts (the shell, the sign-up, Join): the session ends (MJ-L13: revoked on
 * the server, best effort) and the caches that belong to it go with it, so the next person on this phone
 * never sees the last one's business or branches (MJ-RL16). Lives here, not in `api-client`, because the
 * caches read through it.
 */
export function signOutSession(): void {
  endMerchantSession();
  clearBusinessCache();
  clearBranchesCache();
}
