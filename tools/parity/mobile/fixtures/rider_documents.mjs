// RJ.bike_docs — the Bike & documents screen (documents.tsx), populated. GET /auth/me answers a
// verified rider, so each row (National ID, Bike registration, Rider photo) shows its "Verified" pill
// and the footer reads the verified-and-stored copy.
import { installRouter, withQuery } from "./_harness.mjs";

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
    isOnline: false,
    kycMode: "auto",
  },
};

installRouter([{ match: "/auth/me", json: me }]);

export default { wrap: withQuery() };
