// The lyniago.com site Worker. Cloudflare runs it ONLY for /download (`run_worker_first` in
// wrangler.jsonc); every other request is served from site/ without reaching this script. The entry file
// may export nothing but the handler, so the logic and its constants are in download.js.
import { downloadRedirect } from "./download.js";

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/download" || pathname === "/download/") return downloadRedirect(request);
    return env.ASSETS.fetch(request);
  },
};
