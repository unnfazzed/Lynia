/**
 * The single-screen mock harness — served (never written) at /explorations/journey/__parity_harness.html.
 *
 * It reproduces the EXACT head + script load order of `All Screens Gallery.html` (react, react-dom,
 * @babel/standalone, the DS bundle, icons, image-slot, leaflet, the kit parts, and every screen
 * registry) — everything up to but NOT including `gallery.jsx`. In place of the gallery it mounts ONE
 * screen, chosen by query string, into a container sized to the real app viewport (360×720 phone,
 * 320×640 entry-phone, 1024×680 merchant tablet) so the shot is pixel-comparable to the app.
 *
 * The registries expose each screen as a render function on a window global (window.LJ / RC / RJ / RR
 * / RJM / RM). The gallery calls that function during a component's render (`body = render()`), which
 * is what makes any hooks inside it bind to a live fiber — so we do the same: wrap the call in a
 * component and render <Screen/>.
 *
 * Query string: ?src=RC&id=home&mode=phone|phone320|tablet&full=0|1
 *
 * Libs (react/react-dom/@babel/standalone/leaflet) load from /__vendor__/ on our own loopback server
 * (see vendor.mjs) — NOT unpkg. Chromium can't TLS-handshake external hosts through the agent proxy,
 * and a hermetic local mirror is what the design EXPORT-README recommends anyway. Same pinned versions
 * the gallery uses, so React/Babel/Leaflet behave identically; SRI is dropped (not needed on loopback).
 */

// The gallery's accent-background screens: the frame supplies the green, the screen paints on top of
// it (its own body is transparent). We reproduce that so splash / force-update don't render on white.
const ACCENT_IDS = ["splash", "force_update"];

// Screens the gallery seeds as full-height (tall) — informational; our default clip is the mode's
// viewport height, and `full=1` overrides to capture the whole scroll.
export function harnessHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Lynia parity — single screen</title>
<link rel="stylesheet" href="../../styles.css" />
<link rel="stylesheet" href="/__vendor__/leaflet.css" />
<style>
  html, body { margin: 0; background: #ffffff; }
  body { font-family: var(--font-sans); color: var(--ink); }
  * { -webkit-tap-highlight-color: transparent; }
  /* The screen mount. width/height/background are set by the mount script from the mode. */
  #screen { position: relative; overflow: hidden; background: var(--surface); }
  #screen[data-full="1"] { overflow: visible; height: auto !important; }
</style>
<script src="/__vendor__/react.js"></script>
<script src="/__vendor__/react-dom.js"></script>
<script src="/__vendor__/babel.js"></script>
<script src="../../_ds_bundle.js"></script>
<script src="../../assets/lynia-icons.js"></script>
<script src="../../assets/image-slot.js"></script>
<script src="/__vendor__/leaflet.js"></script>
</head>
<body>
<div id="screen"></div>
<script>window.__LYNIA_KIT_PAGE = true;</script>
<script type="text/babel" src="../../ui_kits/mobile/kit-parts.js"></script>
<script type="text/babel" src="../../ui_kits/support/parts.js"></script>
<script type="text/babel" src="screens.jsx"></script>
<script type="text/babel" src="screens-safety.jsx"></script>
<script type="text/babel" src="screens-shipped.jsx"></script>
<script type="text/babel" src="rider-screens.jsx"></script>
<script type="text/babel" src="rider-screens-wallet.jsx"></script>
<script type="text/babel" src="rider-screens-safety.jsx"></script>
<script type="text/babel" src="rider-one-app.jsx"></script>
<script type="text/babel" src="rider-screens-shipped.jsx"></script>
<script src="../restaurants/r-gallery-data.js"></script>
<script src="gallery-map.js"></script>
<script type="text/babel" src="../restaurants/r-parts.jsx"></script>
<script type="text/babel" src="../restaurants/r-customer-a.jsx"></script>
<script type="text/babel" src="../restaurants/r-customer-b.jsx"></script>
<script type="text/babel" src="../restaurants/r-merchant.jsx"></script>
<script type="text/babel" src="../restaurants/r-merchant-shipped.jsx"></script>
<script type="text/babel" src="../restaurants/r-rider.jsx"></script>
<script type="text/babel" data-parity-mount>
  (function () {
    const ACCENT_IDS = ${JSON.stringify(ACCENT_IDS)};
    const MODES = {
      phone:    { w: 360, h: 720 },
      phone320: { w: 320, h: 640 },
      tablet:   { w: 1024, h: 680 },
    };
    function fail(msg) {
      window.__PARITY_ERROR = String(msg);
      const el = document.getElementById("screen");
      if (el) el.innerHTML = '<pre style="padding:16px;font:12px/1.5 monospace;color:#b00020;white-space:pre-wrap">' + String(msg) + '</pre>';
    }
    try {
      const q = new URLSearchParams(location.search);
      const src = q.get("src");
      const id = q.get("id");
      const mode = q.get("mode") || "phone";
      const full = q.get("full") === "1";
      const dims = MODES[mode] || MODES.phone;

      const registry = window[src];
      if (!registry) return fail("registry window." + src + " not found (loaded: " + ["LJ","RC","RJ","RR","RJM","RM"].filter(function(k){return window[k];}).join(",") + ")");
      const render = registry[id];
      if (typeof render !== "function") return fail('screen "' + src + "." + id + '" not found in registry (have: ' + Object.keys(registry).slice(0,40).join(", ") + " ...)");

      const host = document.getElementById("screen");
      host.style.width = dims.w + "px";
      host.style.height = full ? "auto" : dims.h + "px";
      if (full) host.setAttribute("data-full", "1");
      if (ACCENT_IDS.indexOf(id) !== -1) host.style.background = "var(--accent)";

      // Wrap the render fn in a component so hooks inside it bind to a real fiber (gallery parity).
      function Screen() {
        try { return render(); }
        catch (e) { fail('render "' + src + "." + id + '" threw: ' + (e && e.message || e)); return null; }
      }
      ReactDOM.createRoot(host).render(React.createElement(Screen));

      // Signal readiness once fonts are in and layout/paint has settled. networkidle (Playwright side)
      // covers leaflet tiles + food photos; this covers fonts + a couple of frames for measure passes.
      const done = function () {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { window.__PARITY_READY = true; });
        });
      };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(done, done);
      else done();
    } catch (e) {
      fail((e && e.stack) || e);
    }
  })();
</script>
</body>
</html>`;
}
