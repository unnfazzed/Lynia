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

// Own bikers invite links (D-117): lyniago.com/j/<code>.
test("an Own bikers invite link sends every device to the plain Play listing, with no referrer", async () => {
  for (const ua of [UA.androidWhatsApp, UA.android, UA.iphone, UA.windows, undefined]) {
    const res = await get("/j/K7P3QX", ua);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://play.google.com/store/apps/details?id=zw.co.lynia", String(ua));
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  }
});

test("only /j/<one segment> runs the invite redirect", async () => {
  for (const path of ["/j", "/j/", "/j/a/b", "/jj/K7P3QX"]) {
    const res = await get(path, UA.android);
    assert.equal(await res.text(), "asset", path);
  }
});

// Shop share links (D-129): lyniago.com/s/<name>-<CODE>.
import { COPY, hasNoPlay, intentUrl, landingHtml, shopCodeOf, shopPlayUrl } from "./shop.js";

const CARD = {
  name: "Chicken Inn Avondale",
  service: "restaurants",
  shopKind: null,
  logoThumbUrl: "https://storage.example/logo.jpg?sig=1",
  coverThumbUrl: null,
  link: "https://lyniago.com/s/chicken-inn-avondale-7KQ2MX",
};

/** Runs `fn` with global fetch answering the API: `routes` maps a path suffix to a Response factory (or throws). */
async function withApi(routes, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    for (const [suffix, make] of Object.entries(routes)) if (url.endsWith(suffix)) return make();
    return new Response("not found", { status: 404 });
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
}
const live = { "/share/7KQ2MX/card": () => Response.json(CARD) };
const shopEnv = { ASSETS: { fetch: () => new Response("png-bytes", { status: 200 }) }, API_ORIGIN: "https://api.test" };
const getShop = (path, ua) =>
  worker.fetch(new Request(`https://lyniago.com${path}`, { headers: ua ? { "user-agent": ua } : {} }), shopEnv);

test("shopCodeOf reads the code after the last dash, any case, encoded or not (same examples as shop-link.test.ts)", () => {
  assert.equal(shopCodeOf("chicken-inn-avondale-7KQ2MX"), "7KQ2MX");
  assert.equal(shopCodeOf("7kq2mx"), "7KQ2MX");
  assert.equal(shopCodeOf("chicken%2Dinn-7KQ2MX"), "7KQ2MX");
  assert.equal(shopCodeOf("kfc-7KQ2MX"), "7KQ2MX");
  assert.equal(shopCodeOf("chicken-inn-avondale"), null);
  assert.equal(shopCodeOf("7KQ2M0"), null);
  assert.equal(shopCodeOf("%E0%A4%A"), null);
});

test("the Play fallback carries the code in the install referrer shop-link.ts reads back", () => {
  const referrer = new URL(shopPlayUrl("7KQ2MX")).searchParams.get("referrer");
  assert.equal(referrer, "utm_source=lyniago.com&utm_medium=shop_share&utm_campaign=shop_share&utm_content=7KQ2MX");
  const intent = intentUrl("7KQ2MX");
  assert.match(intent, /^intent:\/\/s\/7KQ2MX#Intent;scheme=lynia;package=zw\.co\.lynia;S\.browser_fallback_url=/);
  assert.match(intent, /;end$/);
  assert.equal(decodeURIComponent(intent.split("S.browser_fallback_url=")[1].replace(/;end$/, "")), shopPlayUrl("7KQ2MX"));
});

test("the canonical link renders the shop's landing with its preview tags", async () => {
  await withApi(live, async (calls) => {
    const res = await getShop("/s/chicken-inn-avondale-7KQ2MX", UA.android);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.equal(res.headers.get("x-robots-tag"), "noindex");
    const html = await res.text();
    assert.match(html, /<title>From Chicken Inn Avondale to your door<\/title>/);
    assert.match(html, /<meta property="og:image" content="https:\/\/lyniago.com\/s\/7KQ2MX\/card.jpg\?v=[a-z0-9]+">/);
    assert.match(html, /og:description" content="See what’s on, order in a tap. From Chicken Inn Avondale to your door."/);
    assert.match(html, /og:url" content="https:\/\/lyniago.com\/s\/chicken-inn-avondale-7KQ2MX"/);
    assert.equal(calls[0], "https://api.test/share/7KQ2MX/card");
  });
});

test("a bare code, an old name or a made-up name 301s to the current link, keeping the query", async () => {
  await withApi(live, async () => {
    for (const path of ["/s/7KQ2MX", "/s/7kq2mx", "/s/chicken-inn-7KQ2MX", "/s/kfc-7KQ2MX", "/s/chicken-inn-avondale-7KQ2MX/"]) {
      const res = await getShop(`${path}?utm_source=wa`, UA.iphone);
      assert.equal(res.status, 301, path);
      assert.equal(res.headers.get("location"), "https://lyniago.com/s/chicken-inn-avondale-7KQ2MX?utm_source=wa", path);
    }
  });
});

test("Android fires the app intent (W1a) with Order on the web; without Play it doesn't (W2)", async () => {
  await withApi(live, async () => {
    const a = await (await getShop("/s/chicken-inn-avondale-7KQ2MX", UA.androidWhatsApp)).text();
    assert.ok(a.includes(COPY.web.opening));
    assert.ok(a.includes(COPY.web.openApp));
    assert.ok(a.includes('href="https://app.lyniago.com/s/7KQ2MX"'));
    assert.ok(a.includes("location.href=u"));
    assert.ok(a.includes(COPY.web.stalled));

    const huawei = "Mozilla/5.0 (Linux; Android 10; ELS-NX9; HMSCore 6.11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99 HuaweiBrowser/14.0 Mobile Safari/537.36";
    assert.equal(hasNoPlay(huawei), true);
    const b = await (await getShop("/s/chicken-inn-avondale-7KQ2MX", huawei)).text();
    assert.ok(b.includes(COPY.web.havePlay));
    assert.ok(!b.includes("location.href=u"));
  });
});

test("iPhone gets Order on the web and Help on WhatsApp (W3); desktop the QR and Copy link (W4)", async () => {
  await withApi(live, async () => {
    const ios = await (await getShop("/s/chicken-inn-avondale-7KQ2MX", UA.iphone)).text();
    assert.ok(ios.includes('href="https://app.lyniago.com/s/7KQ2MX"'));
    assert.ok(ios.includes('href="https://wa.me/263778831938"'));
    assert.ok(!ios.includes("intent://"));
    const desk = await (await getShop("/s/chicken-inn-avondale-7KQ2MX", UA.windows)).text();
    assert.ok(desk.includes('src="/s/7KQ2MX/qr.svg"'));
    assert.ok(desk.includes(COPY.web.scan));
    assert.ok(desk.includes('data-link="https://lyniago.com/s/chicken-inn-avondale-7KQ2MX"'));
  });
});

test("a dead code, a bad code or an unreachable API renders the generic page, never a 5xx (W5)", async () => {
  const down = { "/card": () => { throw new TypeError("network"); } };
  for (const routes of [{}, down]) {
    await withApi(routes, async () => {
      for (const path of ["/s/9XWT4P", "/s/not-a-code"]) {
        const res = await getShop(path, UA.android);
        assert.equal(res.status, 200, path);
        const html = await res.text();
        assert.ok(html.includes(COPY.web.deadT), path);
        assert.ok(html.includes(COPY.web.deadApp), path);
        assert.match(html, /<title>LyniaGo<\/title>/);
        assert.ok(!html.includes("Chicken Inn"), path);
        assert.ok(html.includes("intent://#Intent;"), path); // opens the app with no shop
      }
    });
  }
});

test("the page escapes the shop's name", async () => {
  const html = landingHtml({ shop: { ...CARD, name: '<img src=x onerror="alert(1)">' }, code: "7KQ2MX", platform: "ios", nonce: "n" });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
});

test("a page script runs only with the response's nonce (CSP)", async () => {
  await withApi(live, async () => {
    const res = await getShop("/s/chicken-inn-avondale-7KQ2MX", UA.android);
    const csp = res.headers.get("content-security-policy");
    const nonce = /script-src 'nonce-([a-f0-9]+)'/.exec(csp)[1];
    assert.ok((await res.text()).includes(`<script nonce="${nonce}">`));
    assert.match(csp, /default-src 'none'/);
  });
});

test("card.jpg proxies the API's image, edge-cached; falls back to the site's preview when the API is down", async () => {
  await withApi({ "/share/7KQ2MX/card.jpg": () => new Response("jpeg-bytes", { headers: { "content-type": "image/jpeg" } }) }, async (calls) => {
    const res = await getShop("/s/7KQ2MX/card.jpg");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/jpeg");
    assert.equal(res.headers.get("cache-control"), "public, max-age=86400");
    assert.equal(await res.text(), "jpeg-bytes");
    assert.equal(calls[0], "https://api.test/share/7KQ2MX/card.jpg");
  });
  await withApi({ "card.jpg": () => new Response("boom", { status: 502 }) }, async () => {
    const res = await getShop("/s/chicken-inn-avondale-7KQ2MX/card.jpg");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.equal(await res.text(), "png-bytes");
  });
});

test("qr.svg proxies the API's QR; a failure is a quiet 404", async () => {
  await withApi({ "/share/7KQ2MX/qr.svg": () => new Response("<svg/>") }, async () => {
    const res = await getShop("/s/7KQ2MX/qr.svg");
    assert.equal(res.headers.get("content-type"), "image/svg+xml");
    assert.equal(await res.text(), "<svg/>");
  });
  await withApi({}, async () => assert.equal((await getShop("/s/7KQ2MX/qr.svg")).status, 404));
});

test("only /s/<one segment>[/card.jpg|/qr.svg] runs the shop route", async () => {
  for (const path of ["/s", "/s/", "/s/a/b", "/ss/7KQ2MX", "/s/7KQ2MX/other.png"]) {
    const res = await get(path, UA.android);
    assert.equal(await res.text(), "asset", path);
  }
});

test("cardVersion: a new photo or name gives the WhatsApp image a new URL; a re-signed URL does not", async () => {
  const { cardVersion } = await import("./shop.js");
  const base = { name: "Shell'd", logoThumbUrl: "https://b/x/logo.jpg?sig=1", coverThumbUrl: null };
  assert.equal(cardVersion(base), cardVersion({ ...base, logoThumbUrl: "https://b/x/logo.jpg?sig=2" }));
  assert.notEqual(cardVersion(base), cardVersion({ ...base, coverThumbUrl: "https://b/x/cover.jpg?sig=1" }));
  assert.notEqual(cardVersion(base), cardVersion({ ...base, name: "Shelld" }));
  assert.match(cardVersion(base), /^[a-z0-9]{1,13}$/);
});
