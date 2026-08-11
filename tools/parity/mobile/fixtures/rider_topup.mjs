// RJ.topup_amount — the top-up amount-entry screen. In a real release build app/wallet/top-up.tsx
// renders the honest "call support to top up" screen; the kit's amount → wait → approved/declined
// walkthrough (TopUpSimulator) is gated behind isTestBuild(), which reads Constants.expoConfig.extra
// .testBuild. The shared expo-constants shim exports a single settings object, so we flip that flag on
// its live singleton here (no shim edit) to render the amount-entry step the RJ.topup_amount mock
// draws. GET /wallet + /wallet/config back the shown balance and the min/max top-up bounds.
import Constants from "expo-constants";
import { installRouter, withQuery } from "./_harness.mjs";

// Flip the QA-test-build flag on the shim's shared Constants object so isTestBuild() → true and the
// TopUpSimulator (amount entry) renders instead of the release "call support" screen.
if (Constants?.expoConfig?.extra) Constants.expoConfig.extra.testBuild = true;

const config = { enabled: true, ratePct: 10, floor: 2, graceCredit: 3, minTopUp: 5, maxTopUp: 100 };
const wallet = { balance: 8.4, currency: "USD", updatedAt: new Date(Date.now() - 120_000).toISOString() };

installRouter([
  { match: "/wallet/config", json: config },
  { match: "/wallet", method: "GET", json: wallet },
]);

export default { wrap: withQuery() };
