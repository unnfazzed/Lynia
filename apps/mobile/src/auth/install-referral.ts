import { referralCodeFromInstallReferrer, shopCodeFromInstallReferrer } from "@lynia/shared";
import * as Application from "expo-application";
import { Platform } from "react-native";

/** Play's referrer service normally answers in well under this; a slow one must not hold up sign-up. */
export const INSTALL_REFERRER_TIMEOUT_MS = 1500;

let pending: Promise<string | undefined> | null = null;

/**
 * Play's install referrer for this install, read once per launch and kept (it doesn't change for an install).
 * Android only; never throws; undefined when there's none or Play didn't answer in time.
 */
export function installReferrer(): Promise<string | undefined> {
  if (Platform.OS !== "android") return Promise.resolve(undefined);
  pending ??= read();
  return pending;
}

/**
 * Biker referrals (owner 2026-10-18, ledger D-112): the referral code this install came with, when the app was
 * installed from a biker's `lyniago.com/r/<code>` link (the website puts the code in Play's install referrer).
 * `POST /riders/become` sends it so ops can see who brought the new biker in. No screen: nothing the biker sees
 * changes. Android only (there is no iPhone app); never throws; undefined when there's no code.
 *
 * Read once per launch and kept: Play's referrer doesn't change for an install.
 */
export async function installReferralCode(): Promise<string | undefined> {
  return referralCodeFromInstallReferrer(await installReferrer()) ?? undefined;
}

/**
 * Shop share links (ledger D-129, plan E3): the shop code this install came with, when it was installed from a
 * shop's `lyniago.com/s/<name>-<CODE>` link (the website's Play fallback carries `utm_medium=shop_share`). The
 * caller uses it once per install (src/share/pending-shop.ts).
 */
export async function installShopCode(): Promise<string | undefined> {
  return shopCodeFromInstallReferrer(await installReferrer()) ?? undefined;
}

async function read(): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const referrer = await Promise.race([
      Application.getInstallReferrerAsync(),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), INSTALL_REFERRER_TIMEOUT_MS);
      }),
    ]);
    return typeof referrer === "string" && referrer ? referrer : undefined;
  } catch {
    // No Play services, an emulator, a sideloaded build: not a referral.
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Tests only: forget the read so the next call asks again. */
export function resetInstallReferralForTests(): void {
  pending = null;
}
