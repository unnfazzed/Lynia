import { Platform } from "react-native";
import { isCustomerWebBuild } from "./web-build";

/**
 * Whether this build offers rider mode at all. **iOS ships customer-only** (owner decision 2026-09-27,
 * docs/APP-STORE-SUBMISSION.md, DESIGN-DEVIATIONS.md D-41): Zimbabwe's riders are on low-end Android
 * handsets, iPhone users are customers, and keeping rider mode out of the iPhone app keeps ID/KYC
 * capture, the commission wallet and background location out of App Store review.
 *
 * Every rider entry point asks this: the post-sign-in role fork, the Account tab's rider row, the
 * rider push destinations, the boot redirect, the sign-up national ID field, and the route gate that
 * sends /rider/* and /wallet/* home (src/rider-route-gate.tsx). A rider account signing in on an
 * iPhone therefore simply gets the customer app.
 *
 * The customer web build (docs/plans/2026-10-06-customer-web-app-plan.md) is customer-only for the same
 * reasons, so it is off there too ({@link isCustomerWebBuild}; the parity lane's react-native-web render
 * still sees rider mode).
 *
 * Never tell iPhone users to go and use another platform instead: App Review guideline 2.3.10 bans
 * naming other mobile platforms inside the app.
 *
 * A function, read at call time, so tests can flip it: jest.setup.js mocks this module to return
 * `true` (the suite exercises the Android launch product, while jest-expo reports Platform.OS "ios"),
 * and the iOS-gate tests override it per case.
 */
export function riderModeAvailable(): boolean {
  return Platform.OS !== "ios" && !isCustomerWebBuild();
}

/** True for a route that belongs to rider mode (the rider app, KYC, the commission wallet). */
export function isRiderOnlyRoute(path: string): boolean {
  return /^\/(rider|wallet)(\/|\?|$)/.test(path);
}
