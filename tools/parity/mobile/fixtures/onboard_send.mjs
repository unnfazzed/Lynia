// LJ.onboard_send — slide 2 of the joint-launch carousel ("Name your price to send", banknote glyph,
// second dot elongated, primary still "Next"). Same screen as LJ.onboard; the slide index is the
// screen's own state, staged through its `initialSlide` prop. The default /app/feature-flags route
// answers restaurantsEnabled:true, so the three-slide joint-launch set is the one on screen.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([]);

export default { wrap: withQuery(), props: { initialSlide: 1 } };
