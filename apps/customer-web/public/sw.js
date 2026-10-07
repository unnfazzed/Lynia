// Offline shell for app.lyniago.com (docs/CUSTOMER-WEB.md § Offline). finish-build.mjs stamps BUILD and
// PRECACHE for each export, so every deploy installs a new worker that caches that deploy's page and bundle.
//
// - The page (any navigation): network first, so a deploy reaches everyone on their next visit. On a slow
//   link it waits NAV_TIMEOUT_MS before falling back to the saved page; offline it falls back at once.
//   Without this a reload with no signal showed the browser's own "no internet" page.
// - Hashed bundles and assets (/_expo/static/*, /assets/*): cache first. Their names change when their
//   bytes do, so a saved copy is never stale.
// - Other files of ours (manifest, icons, the small scripts): saved copy at once, refreshed behind.
// - Anything on another origin (the API, Google Maps) is never touched: live data stays live.
//
// Kill switch: deploy a sw.js whose install handler calls self.registration.unregister().
const BUILD = "__LYNIA_BUILD__";
const PRECACHE = ["__LYNIA_PRECACHE__"];
const SHELL = `lynia-shell-${BUILD}`;
const STATIC = "lynia-static";
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await shell.add(new Request("/", { cache: "reload" }));
      const stat = await caches.open(STATIC);
      // One failed file must not fail the install: the worker still serves what it has.
      await Promise.all(PRECACHE.map((url) => stat.add(new Request(url, { cache: "reload" })).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("lynia-shell-") && name !== SHELL) await caches.delete(name);
      }
      // Old deploys' JS bundles are megabytes each and no page will ask for them again; fonts and
      // images under /assets keep their names across deploys, so they stay.
      const keep = new Set(PRECACHE);
      const stat = await caches.open(STATIC);
      for (const req of await stat.keys()) {
        const path = new URL(req.url).pathname;
        if (path.startsWith("/_expo/static/js/") && !keep.has(path)) await stat.delete(req);
      }
      await self.clients.claim();
    })(),
  );
});

function isHashed(path) {
  return path.startsWith("/_expo/static/") || path.startsWith("/assets/");
}

async function fromNetworkThenShell(request) {
  const shell = await caches.open(SHELL);
  const network = fetch(request).then((res) => {
    if (res.ok) void shell.put("/", res.clone());
    return res;
  });
  network.catch(() => undefined); // a late failure after the saved page was served is not an error
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS, null));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    const saved = await shell.match("/");
    return saved || (await network);
  } catch {
    const saved = await shell.match("/");
    if (saved) return saved;
    throw new Error("offline and no saved page");
  }
}

async function cacheFirst(request) {
  const stat = await caches.open(STATIC);
  const saved = await stat.match(request);
  if (saved) return saved;
  const res = await fetch(request);
  if (res.ok) void stat.put(request, res.clone());
  return res;
}

async function savedThenRefresh(event) {
  const stat = await caches.open(STATIC);
  const saved = await stat.match(event.request);
  const network = fetch(event.request).then((res) => {
    if (res.ok) void stat.put(event.request, res.clone());
    return res;
  });
  if (saved) {
    event.waitUntil(network.catch(() => undefined));
    return saved;
  }
  return network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fromNetworkThenShell(request));
    return;
  }
  // The worker itself is fetched by the browser's update check, never through here.
  if (url.pathname === "/sw.js") return;
  event.respondWith(isHashed(url.pathname) ? cacheFirst(request) : savedThenRefresh(event));
});
