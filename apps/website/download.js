// The /download logic for the site Worker (worker.js). It lives in its own module because the Workers
// runtime treats every named export of the entry file as an entrypoint and refuses constants there.
//
// lyniago.com/download: one link for every "Download the app" button (owner, 2026-10-15; ledger D-42 §3,
// docs/WEBSITE.md § Smart download link). The Worker runs ONLY for /download (`run_worker_first` in
// wrangler.jsonc); every other path is still a free static-asset request that never reaches this script.
//
//   Android         → the Play listing, tagged so Play Console counts installs that came from the website
//   iPhone, iPod    → the customer web app, opened on its Add to Home Screen tip (there is no iPhone app)
//   anything else   → the home page's app section, where desktop visitors get the QR code
//
// iPadOS 13+ Safari sends a Mac user agent, so an iPad lands with the desktop visitors. The QR code
// serves it too.

export const PLAY_URL =
  "https://play.google.com/store/apps/details?id=zw.co.lynia" +
  "&referrer=utm_source%3Dlyniago.com%26utm_medium%3Dwebsite%26utm_campaign%3Ddownload";
export const IOS_URL = "https://app.lyniago.com/?install=1";
export const DESKTOP_PATH = "/#app";

/** Where /download sends a visitor with this User-Agent: "android", "ios" or "desktop". */
export function platformOf(userAgent) {
  const ua = userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipod|ipad/i.test(ua)) return "ios";
  return "desktop";
}

export function downloadRedirect(request) {
  const platform = platformOf(request.headers.get("user-agent"));
  const location =
    platform === "android" ? PLAY_URL : platform === "ios" ? IOS_URL : new URL(DESKTOP_PATH, request.url).toString();
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
