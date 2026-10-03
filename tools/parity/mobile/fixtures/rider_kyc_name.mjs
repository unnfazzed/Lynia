// Become a rider (app/rider/become.tsx), D-75: the one step left before the ID check — the NAME, asked
// only of a legacy account without one, in Calm Mint v2 C5's grammar (the title, First name · Surname
// side by side, the verified phone), then on to the check. `/auth/me` answers a nameless customer with
// no national ID on file (none is asked any more: the check supplies it). The screen opens on R1; the
// screenshot lane taps "Start ID check" to reach the step. Everything else answers the inert `{}`.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([
  {
    match: "/auth/me",
    json: {
      profileId: "0a1b2c3d-0000-4000-8000-0000000000c5",
      role: "customer",
      firstName: "",
      lastName: "",
      phone: "+263772451180",
      email: null,
      photoUrl: null,
      ordersCount: 0,
      idNumber: null,
      kycIdNumber: null,
      onHold: false,
      rider: null,
    },
  },
]);

export default { wrap: withQuery() };
