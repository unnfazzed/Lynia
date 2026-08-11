// LJ.onboard — the first-install intro carousel, joint-launch (Food) slide set. The slides chosen by
// `restaurantsEnabled`; installRouter's default /app/feature-flags route answers all-ON, so
// useFeatureFlags resolves true ~250ms after mount and the SEND_FOOD_SLIDES set paints. The carousel's
// slide index is internal state that starts at 0, so this renders the first slide ("Food from kitchens
// near you") — the two later slides (LJ.onboard_send / LJ.onboard_shared) are internal carousel steps
// with no param/prop to seed, so they're not reachable from a fixture.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([]);

export default { wrap: withQuery() };
