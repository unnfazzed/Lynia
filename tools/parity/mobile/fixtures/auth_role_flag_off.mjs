// LJ.role_select_flag_off — the post-OTP role fork with the Food vertical dark (screens-shipped.jsx
// `RoleSelectFlagOff`): the Dove+Wordmark brand mark, "How do you want to start?", and the
// parcels-only option copy ("Use LyniaGo" / "Earn as a rider"). app/role.tsx picks
// RoleSelectFlagOffView purely off `restaurantsEnabled`, so the flag route is the whole fixture.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([
  {
    match: "/app/feature-flags",
    json: { restaurantsEnabled: false, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false },
  },
]);

export default { wrap: withQuery() };
