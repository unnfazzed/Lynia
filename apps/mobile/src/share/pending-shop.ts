import { normalizeShopCode } from "@lynia/shared";
import * as SecureStore from "expo-secure-store";
import { installShopCode } from "../auth/install-referral";

/**
 * The shop a share link is taking this person to (plan docs/plans/2026-11-07-shop-share-links.md E3, handoff
 * shop-share-v1 README §2 "Signed out", ledger D-129).
 *
 * A link opened while signed out (`lynia://s/<CODE>`, `app.lyniago.com/s/<CODE>`) or an install that came from one
 * (Play's referrer, `utm_medium=shop_share`) saves the code here. Sign-up then shows the "Taking you to" chip, and
 * Home hands over to `/s/<CODE>` once the account exists. It lives 7 days, is cleared on sign-out
 * (`clearDeviceState`) and once the link has opened. A Play-referrer code is taken once per install.
 */

/** SecureStore slot. Exported so sign-out (`clearDeviceState`) clears it. */
export const PENDING_SHOP_KEY = "lynia.pendingShop";
/** Once per install, never cleared on sign-out: the next person on a shared phone didn't come from that link. */
export const REFERRER_SHOP_USED_KEY = "lynia.referrerShopUsed";
export const PENDING_SHOP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingShop {
  code: string;
  savedAt: number;
}

/** Keep `raw` as the shop to open after sign-in. Ignores anything that isn't a code. Never throws. */
export async function savePendingShop(raw: unknown, now: number = Date.now()): Promise<string | null> {
  const code = normalizeShopCode(raw);
  if (!code) return null;
  try {
    await SecureStore.setItemAsync(PENDING_SHOP_KEY, JSON.stringify({ code, savedAt: now }));
  } catch {
    /* best-effort: the link still opens once signed in, just without the chip */
  }
  return code;
}

/** The saved shop, or null (none, expired, unreadable). An expired one is removed. Never throws. */
export async function loadPendingShop(now: number = Date.now()): Promise<PendingShop | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_SHOP_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { code?: unknown; savedAt?: unknown };
    const code = normalizeShopCode(v.code);
    const savedAt = typeof v.savedAt === "number" ? v.savedAt : NaN;
    if (!code || !Number.isFinite(savedAt) || now - savedAt > PENDING_SHOP_TTL_MS || savedAt > now + 60_000) {
      await clearPendingShop();
      return null;
    }
    return { code, savedAt };
  } catch {
    return null;
  }
}

export async function clearPendingShop(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_SHOP_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * At a signed-out cold start: the shop this person is on the way to, taking the Play referrer's code the first
 * time (once per install). Returns the code or null. Never throws.
 */
export async function pendingShopAtBoot(now: number = Date.now()): Promise<string | null> {
  const saved = await loadPendingShop(now);
  if (saved) return saved.code;
  try {
    if (await SecureStore.getItemAsync(REFERRER_SHOP_USED_KEY)) return null;
    const fromPlay = await installShopCode();
    // Marked whether or not there was a code: the referrer never changes for an install.
    await SecureStore.setItemAsync(REFERRER_SHOP_USED_KEY, "1");
    return fromPlay ? savePendingShop(fromPlay, now) : null;
  } catch {
    return null;
  }
}

/**
 * The shop a link last opened, for attribution (D-129, `Order.shareCode`): checkout sends the code with an order at
 * that shop. Kept a day, cleared on sign-out and once an order goes through. The server keeps a code only when it is
 * the shop's own, so this can never misattribute an order.
 */
export const SHOP_ARRIVAL_KEY = "lynia.shopArrival";
export const SHOP_ARRIVAL_TTL_MS = 24 * 60 * 60 * 1000;

export async function saveShopArrival(merchantId: string, code: string, now: number = Date.now()): Promise<void> {
  try {
    await SecureStore.setItemAsync(SHOP_ARRIVAL_KEY, JSON.stringify({ merchantId, code, at: now }));
  } catch {
    /* best-effort */
  }
}

/** The link code to send with an order at `merchantId`, or undefined. Never throws. */
export async function shareCodeForOrder(merchantId: string, now: number = Date.now()): Promise<string | undefined> {
  try {
    const raw = await SecureStore.getItemAsync(SHOP_ARRIVAL_KEY);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as { merchantId?: unknown; code?: unknown; at?: unknown };
    const code = normalizeShopCode(v.code);
    if (!code || v.merchantId !== merchantId || typeof v.at !== "number" || now - v.at > SHOP_ARRIVAL_TTL_MS) return undefined;
    return code;
  } catch {
    return undefined;
  }
}

export async function clearShopArrival(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SHOP_ARRIVAL_KEY);
  } catch {
    /* best-effort */
  }
}
