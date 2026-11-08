/**
 * Google Play's install referrer as key/value pairs. Shared by the two links that ride it: biker referrals
 * (`referral.ts`, `utm_medium=biker_referral`) and shop share links (`shop-link.ts`, `utm_medium=shop_share`).
 * Each caller checks its own `utm_medium`, so a code from one link can never be read as the other.
 *
 * Play may hand the referrer back URL-encoded or not. Returns an empty map for anything unreadable.
 */
export function installReferrerParams(referrer: unknown): Map<string, string> {
  const params = new Map<string, string>();
  if (typeof referrer !== "string" || !referrer) return params;
  let text = referrer.trim();
  if (!text.includes("=") && text.includes("%3D")) {
    try {
      text = decodeURIComponent(text);
    } catch {
      return params;
    }
  }
  // A hand-rolled query parse: this package targets no DOM or Node lib, so URLSearchParams isn't typed here.
  for (const pair of (text.startsWith("?") ? text.slice(1) : text).split("&")) {
    const at = pair.indexOf("=");
    if (at > 0) params.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return params;
}
