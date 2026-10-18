// lyniago.com/r/<CODE>: a biker's personal referral link (owner 2026-10-18, ledger D-112, docs/WEBSITE.md
// § Biker referral links). Ops copy it from the biker's page in the admin console and the biker shares it.
//
//   Android         → the Play listing, with the code inside Play's install referrer. When the friend becomes
//                     a biker, the app reads the referrer and sends the code to the API (no screen involved).
//   anything else   → the home page's "For bikers" section (the biker app is Android-only).
//
// The code's shape and the referrer string are packages/shared/src/referral.ts's; this Worker can't import
// that package, so both are copied here and the tests on both sides pin the same string.

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE = new RegExp(`^[${CODE_ALPHABET}]{6}$`);
const PATH = /^\/r\/([^/]+)\/?$/;
export const OTHER_PATH = "/#riders";
const PLAY = "https://play.google.com/store/apps/details?id=zw.co.lynia";

export function isReferralPath(pathname) {
  return PATH.test(pathname);
}

/** The code in /r/<code>, canonical (upper case, no dashes), or null when it isn't one. */
export function codeOf(pathname) {
  const m = PATH.exec(pathname);
  if (!m) return null;
  let raw;
  try {
    raw = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  return CODE.test(code) ? code : null;
}

/** The Play link for a code. A bad code still gets the plain listing: the friend can install, just untracked. */
export function playUrlFor(code) {
  if (!code) return PLAY;
  const referrer = `utm_source=lyniago.com&utm_medium=biker_referral&utm_campaign=biker_referral&utm_content=${code}`;
  return `${PLAY}&referrer=${encodeURIComponent(referrer)}`;
}

export function referralRedirect(request) {
  const url = new URL(request.url);
  const android = /android/i.test(request.headers.get("user-agent") || "");
  const location = android ? playUrlFor(codeOf(url.pathname)) : new URL(OTHER_PATH, request.url).toString();
  return new Response(null, {
    status: 302,
    headers: {
      location,
      // The answer depends on the device, so no shared cache may keep one visitor's answer for another.
      "cache-control": "private, no-store",
      vary: "User-Agent",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}
