/**
 * The customer web app's Add to Home Screen tip (handoff download-qr-install-tip-2026-10 §2) for
 * tools/parity/shoot-install-tip.mjs: Home staged exactly as `food_home` stages it, plus the web-build
 * flag. The shoot script supplies the rest per state: an iPhone Safari user agent, the `?install=1`
 * capture (sessionStorage) and the dismissals (localStorage), before the bundle runs.
 */
import Home from "./food_home.mjs";
export * from "./food_home.mjs";
export default Home;

// src/web-build.ts reads this at call time; the parity bundle has no Expo inlining.
process.env.EXPO_PUBLIC_LYNIA_WEB = "1";
