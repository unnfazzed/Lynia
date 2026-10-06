// iPhone Safari zooms in on any text field whose font is under 16px and leaves the page zoomed, so the app
// spills past the screen after typing. maximum-scale=1 stops that zoom on iOS, which still allows pinch-zoom
// (Safari ignores the limit for pinches since iOS 10). Android browsers don't zoom on focus but would honour
// the limit and lose pinch-zoom, so it's set on iOS only. A file, not inline, because the CSP allows no inline
// script. Loaded in <head> before the app so it applies before the first field is focused.
(function () {
  var ua = navigator.userAgent;
  var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return;
  var meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover");
})();
