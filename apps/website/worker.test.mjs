// Tests for lyniago.com/download (apps/website/worker.js + download.js). Run: node --test apps/website/worker.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { DESKTOP_PATH, IOS_URL, PLAY_URL, platformOf } from "./download.js";
import { codeOf } from "./referral.js";
import worker from "./worker.js";

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  androidWhatsApp: "Mozilla/5.0 (Linux; Android 11; TECNO KF6) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 WhatsApp/2.24",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0",
  ipadOld: "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

const assets = { fetch: () => new Response("asset", { status: 200 }) };
const get = (path, ua) =>
  worker.fetch(new Request(`https://lyniago.com${path}`, { headers: ua ? { "user-agent": ua } : {} }), { ASSETS: assets });

test("platformOf sorts user agents", () => {
  assert.equal(platformOf(UA.android), "android");
  assert.equal(platformOf(UA.androidWhatsApp), "android");
  assert.equal(platformOf(UA.iphone), "ios");
  assert.equal(platformOf(UA.iphoneInstagram), "ios");
  assert.equal(platformOf(UA.ipadOld), "ios");
  assert.equal(platformOf(UA.mac), "desktop"); // iPadOS 13+ lands here too; the QR code serves it
  assert.equal(platformOf(UA.windows), "desktop");
  assert.equal(platformOf(""), "desktop");
  assert.equal(platformOf(null), "desktop");
});

test("Android goes to the Play listing, tagged for Play Console", async () => {
  const res = await get("/download", UA.android);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), PLAY_URL);
  assert.match(PLAY_URL, /^https:\/\/play\.google\.com\/store\/apps\/details\?id=zw\.co\.lynia&referrer=utm_source%3D/);
});

test("iPhone goes to the web app's Add to Home Screen tip", async () => {
  const res = await get("/download", UA.iphone);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), IOS_URL);
  assert.equal(IOS_URL, "https://app.lyniago.com/?install=1");
});

test("desktop goes to the home page's app section", async () => {
  for (const ua of [UA.windows, UA.mac, undefined]) {
    const res = await get("/download", ua);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), `https://lyniago.com${DESKTOP_PATH}`);
  }
});

test("the redirect is never cached across devices", async () => {
  const res = await get("/download/?utm=x", UA.android);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(res.headers.get("vary"), "User-Agent");
});

test("every other path is served from the static assets", async () => {
  for (const path of ["/", "/about", "/downloads", "/download.html", "/assets/x.webp"]) {
    const res = await get(path, UA.android);
    assert.equal(await res.text(), "asset", path);
  }
});

// Biker referral links (D-112): lyniago.com/r/<code>.
test("a referral link sends every device straight to Play with the code in the install referrer", async () => {
  const play =
    "https://play.google.com/store/apps/details?id=zw.co.lynia&referrer=" +
    "utm_source%3Dlyniago.com%26utm_medium%3Dbiker_referral%26utm_campaign%3Dbiker_referral%26utm_content%3DK7P3QX";
  for (const ua of [UA.androidWhatsApp, UA.android, UA.iphone, UA.windows, UA.mac, undefined]) {
    const res = await get("/r/k7p-3qx", ua);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), play, String(ua));
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  }
  // The same string packages/shared/src/referral.ts reads back (referralInstallReferrer).
  const referrer = new URL(play).searchParams.get("referrer");
  assert.equal(referrer, "utm_source=lyniago.com&utm_medium=biker_referral&utm_campaign=biker_referral&utm_content=K7P3QX");
});

test("a referral link with a bad code still reaches the plain Play listing", async () => {
  for (const path of ["/r/nope", "/r/K7P30X", "/r/%E0%A4%A"]) {
    const res = await get(path, UA.android);
    assert.equal(res.headers.get("location"), "https://play.google.com/store/apps/details?id=zw.co.lynia", path);
  }
  assert.equal(codeOf("/r/K7P3QX/"), "K7P3QX");
});

test("only /r/<one segment> runs the referral redirect", async () => {
  for (const path of ["/r", "/r/", "/r/a/b", "/rr/K7P3QX"]) {
    const res = await get(path, UA.android);
    assert.equal(await res.text(), "asset", path);
  }
});
