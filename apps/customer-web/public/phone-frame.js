// On a wide screen app.lyniago.com keeps its phone layout: the app is a 480px column centred on the surface grey,
// the same frame as the merchant app (apps/merchant/app/mobile.css `.m-app`). The CSS in index.html narrows the page;
// this file narrows what the app MEASURES. react-native-web's Dimensions (and so useWindowDimensions, which ~20
// screens size their cards, sheets and maps from) reads window.visualViewport, so the app is handed a viewport whose
// width never exceeds the column. On a phone (≤ 480px) every value is the browser's own and nothing changes.
// A file, not inline, because the CSP allows no inline script. Loaded in <head>, before the app's bundle reads it.
(function () {
  var MAX = 480;
  var vv = window.visualViewport;
  if (!vv) return;
  var frame = {
    addEventListener: vv.addEventListener.bind(vv),
    removeEventListener: vv.removeEventListener.bind(vv),
  };
  ["height", "scale", "offsetLeft", "offsetTop", "pageLeft", "pageTop", "onresize", "onscroll"].forEach(function (k) {
    Object.defineProperty(frame, k, {
      enumerable: true,
      get: function () {
        return vv[k];
      },
      set: function (v) {
        vv[k] = v;
      },
    });
  });
  // react-native-web multiplies by scale (pinch zoom), so cap width × scale at the column.
  Object.defineProperty(frame, "width", {
    enumerable: true,
    get: function () {
      return Math.min(vv.width, MAX / (vv.scale || 1));
    },
  });
  try {
    Object.defineProperty(window, "visualViewport", { configurable: true, get: function () { return frame; } });
  } catch (e) {
    // The browser won't let it be replaced: the page is still framed by the CSS, only measured at full width.
  }
})();
