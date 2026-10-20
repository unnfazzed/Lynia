// The lyniago.com site Worker. Cloudflare runs it ONLY for /download, a biker's referral link /r/<code> and an
// Own bikers invite link /j/<code> (`run_worker_first` in wrangler.jsonc); every other request is served from
// site/ without reaching this script. The entry file may export nothing but the handler, so the logic and its
// constants are in download.js, referral.js and invite.js.
import { downloadRedirect } from "./download.js";
import { inviteRedirect, isInvitePath } from "./invite.js";
import { isReferralPath, referralRedirect } from "./referral.js";

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/download" || pathname === "/download/") return downloadRedirect(request);
    if (isReferralPath(pathname)) return referralRedirect(request);
    if (isInvitePath(pathname)) return inviteRedirect();
    return env.ASSETS.fetch(request);
  },
};
