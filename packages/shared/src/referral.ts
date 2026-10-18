/**
 * Biker referrals (owner 2026-10-18, ledger D-112). A verified biker shares a personal link,
 * `lyniago.com/r/<CODE>`. On Android the website sends the friend to the Play listing with the code inside
 * Play's install referrer; when the friend becomes a biker, the app reads that referrer and sends the code
 * with `POST /riders/become`. Ops see the numbers in the admin console and pay the referrer in cash.
 * There are no app screens: nothing the biker sees changes.
 *
 * This module is the one shape of a code, shared by the API (minting, attaching) and the app (reading the
 * referrer). The website Worker (apps/website/referral.js) can't import it and keeps its own copy of the
 * alphabet and the referrer it writes; `referralInstallReferrer` below is that string, and both sides'
 * tests pin it.
 */

/** No 0/O, 1/I/L: a code read out loud or copied by hand stays unambiguous. */
export const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REFERRAL_CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`);

/** The link a biker shares. */
export const REFERRAL_LINK_BASE = "https://lyniago.com/r/";

/** The Play referrer's `utm_medium` that marks a biker referral (any other install is not one). */
export const REFERRAL_UTM_MEDIUM = "biker_referral";

/** A code as typed or carried in a link (any case, stray spaces or dashes) → its canonical form, or null. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  return CODE_RE.test(code) ? code : null;
}

export function referralLink(code: string): string {
  return `${REFERRAL_LINK_BASE}${code}`;
}

/** The install-referrer string the website puts in the Play link for a code (decoded form). */
export function referralInstallReferrer(code: string): string {
  return `utm_source=lyniago.com&utm_medium=${REFERRAL_UTM_MEDIUM}&utm_campaign=${REFERRAL_UTM_MEDIUM}&utm_content=${code}`;
}

/**
 * The code inside a Play install referrer, or null when this install didn't come from a biker's link
 * (organic, the website's own /download, an ad). Play may hand the referrer back URL-encoded or not.
 */
export function referralCodeFromInstallReferrer(referrer: unknown): string | null {
  if (typeof referrer !== "string" || !referrer) return null;
  let text = referrer.trim();
  if (!text.includes("=") && text.includes("%3D")) {
    try {
      text = decodeURIComponent(text);
    } catch {
      return null;
    }
  }
  // A hand-rolled query parse: this package targets no DOM or Node lib, so URLSearchParams isn't typed here.
  const params = new Map<string, string>();
  for (const pair of (text.startsWith("?") ? text.slice(1) : text).split("&")) {
    const at = pair.indexOf("=");
    if (at > 0) params.set(pair.slice(0, at), pair.slice(at + 1));
  }
  if (params.get("utm_medium") !== REFERRAL_UTM_MEDIUM) return null;
  return normalizeReferralCode(params.get("utm_content"));
}
