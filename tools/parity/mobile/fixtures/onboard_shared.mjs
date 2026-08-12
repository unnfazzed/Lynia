// LJ.onboard_shared — slide 3 of the joint-launch carousel ("One app, one code", check glyph, third
// dot elongated, primary "Get started"). Same screen as LJ.onboard, staged at its last slide.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([]);

export default { wrap: withQuery(), props: { initialSlide: 2 } };
