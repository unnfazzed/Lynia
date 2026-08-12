// LJ.onboard_flag_off — the carousel with the Food vertical dark (screens-shipped.jsx
// `OnboardFlagOff`): the parcels-only set, opening on the banknote "Name your price to send" slide,
// with TWO dots. Overrides the harness default so /app/feature-flags reports restaurantsEnabled:false
// — the flag is the only input that selects this slide set.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([
  {
    match: "/app/feature-flags",
    json: { restaurantsEnabled: false, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false },
  },
]);

export default { wrap: withQuery() };
