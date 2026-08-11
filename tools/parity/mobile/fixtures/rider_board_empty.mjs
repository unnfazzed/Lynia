// RJM.board_empty — the rider is verified + online, but nothing is in range: GET /orders/open answers
// []. The board renders its "Nothing in range yet" empty state (the flag-ON copy that names where
// parcels vs food each show up). Same me/online seed as rider_board, only the open feed differs.
//
// NOTE (blocker): this screen (app/rider/(tabs)/index.tsx) transitively imports src/push/push.ts,
// which runs `Notifications.setNotificationHandler(...)` at module top level via a namespace import
// `import * as Notifications from "expo-notifications"`. The shared empty.js shim exposes only a
// `default` export, so that namespace member is undefined and the bundle throws before mount. Renders
// only once the shared shim provides expo-notifications' named exports — see the report.
import { installRouter, withQuery } from "./_harness.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1600;

const me = {
  profileId: "0a1b2c3d-0000-4000-8000-00000000me01",
  role: "rider",
  firstName: "Tanaka",
  lastName: "Moyo",
  phone: "+263771234567",
  email: null,
  photoUrl: null,
  ordersCount: 42,
  rider: {
    bikeReg: "ABZ 4417",
    kycStatus: "verified",
    kycDeclineReason: null,
    kycAttempts: 1,
    cancelStrikes: 0,
    ratingAvg: 4.9,
    ratingCount: 128,
    tripsCount: 132,
    isOnline: true,
    kycMode: "auto",
  },
};

installRouter([
  { match: "/auth/me", json: me },
  { match: "/orders/mine/active", json: null },
  { match: "/orders/open", json: [] },
]);

export default { wrap: withQuery() };
