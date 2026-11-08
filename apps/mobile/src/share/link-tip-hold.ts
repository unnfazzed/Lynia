/**
 * DR12 (plan docs/plans/2026-11-07-shop-share-links.md, README §2 "Signed out"): on the customer web app, someone
 * who arrived through a shop share link isn't shown the Add to Home Screen tip until their first order has gone
 * through: the link is there to get them ordering, not installing. A localStorage flag, like the tip's own
 * dismissals; on the phones there's no tip and these do nothing.
 */
export const LINK_TIP_HOLD_KEY = "lynia.shopLinkTipHold";

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function holdInstallTipForLink(): void {
  try {
    storage()?.setItem(LINK_TIP_HOLD_KEY, "1");
  } catch {
    /* blocked storage: the tip shows as usual */
  }
}

export function installTipHeldForLink(): boolean {
  try {
    return storage()?.getItem(LINK_TIP_HOLD_KEY) === "1";
  } catch {
    return false;
  }
}

export function releaseInstallTipHold(): void {
  try {
    storage()?.removeItem(LINK_TIP_HOLD_KEY);
  } catch {
    /* best-effort */
  }
}
