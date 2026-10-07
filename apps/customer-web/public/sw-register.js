// Registers the offline shell (sw.js). A file, not an inline script, because the CSP allows only our own
// scripts. Registered after load so it never competes with the app's first paint for a slow link.
if ("serviceWorker" in navigator) {
  addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {
      /* no offline shell this visit; the app runs the same */
    });
  });
}
