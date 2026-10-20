// lyniago.com/j/<CODE>: a business's Own bikers invite link (owner 2026-10-20, ledger D-117). The owner shares it
// from the merchant app (WhatsApp or a copied link) to the biker's number.
//
// Every visitor goes straight to the Google Play listing, as a referral link does. The link needs to carry nothing:
// the invite is bound to the biker's phone number, so once they open LyniaGo with that number the Join card is on
// their board. So it's the plain listing, with no install referrer (a fleet code must never read as a referral code).

const PATH = /^\/j\/[^/]+\/?$/;
export const PLAY = "https://play.google.com/store/apps/details?id=zw.co.lynia";

export function isInvitePath(pathname) {
  return PATH.test(pathname);
}

export function inviteRedirect() {
  return new Response(null, {
    status: 302,
    headers: {
      location: PLAY,
      // Never cached, so a fix to the redirect reaches every shared link at once.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}
