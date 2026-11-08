// The lyniago.com site Worker. Cloudflare runs it ONLY for /download, a biker's referral link /r/<code> and an
// Own bikers invite link /j/<code> and a shop's share link /s/<name>-<CODE> (shop.js, D-129) (`run_worker_first` in wrangler.jsonc); every other request is served from
// site/ without reaching this script. The entry file may export nothing but the handler, so the logic and its
// constants are in download.js, referral.js, invite.js and shop.js.
import { downloadRedirect } from "./download.js";
import { inviteRedirect, isInvitePath } from "./invite.js";
import { isReferralPath, referralRedirect } from "./referral.js";
import { isShopPath, shopResponse } from "./shop.js";

export default {
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/download" || pathname === "/download/") return downloadRedirect(request);
    if (isReferralPath(pathname)) return referralRedirect(request);
    if (isInvitePath(pathname)) return inviteRedirect();
    if (isShopPath(pathname)) return shopResponse(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
