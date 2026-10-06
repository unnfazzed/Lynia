/**
 * Splash layout on real screens (ledger D-64 #7, S-5). The handoff fits 320×640 in a frame with no
 * system bars; with the bottom inset under the steps card and the offline panel the wordmark must still
 * never sit under either — the brand moves up instead — and where there is room the handoff's own
 * values are untouched.
 */
import { ANCHOR_RATIO, CARD_BOTTOM, CARD_H_ESTIMATE, MIN_CLEARANCE, OFFLINE_LIFT, PANEL_BOTTOM, PANEL_H_ESTIMATE, WORDMARK_H, WORDMARK_TOP, splashGeometry } from "../geometry";

const wordmarkBottom = (anchor: number): number => anchor + WORDMARK_TOP + WORDMARK_H;
const cardTop = (H: number, inset: number): number => H - inset - CARD_BOTTOM - CARD_H_ESTIMATE;
const panelTop = (H: number, inset: number): number => H - inset - PANEL_BOTTOM - PANEL_H_ESTIMATE;

describe("splashGeometry", () => {
  const at = (H: number, bottomInset: number) => splashGeometry({ H, bottomInset, cardH: CARD_H_ESTIMATE, panelH: PANEL_H_ESTIMATE });

  it.each([
    [640, 0],
    [700, 0],
    [720, 0],
    [720, 48],
    [780, 48],
  ])("H=%i, inset %i: exactly the handoff (anchor at 44%%, 64px offline lift)", (H, inset) => {
    expect(at(H, inset)).toEqual({ anchor: ANCHOR_RATIO * H, offlineLift: OFFLINE_LIFT });
  });

  it.each([
    [640, 48], // the entry phone with a 3-button nav bar — the card used to cover ~20dp of "LyniaGo"
    [640, 24], // …and with gesture navigation (~4dp of clearance before)
    [600, 48],
  ])("H=%i, inset %i: the brand moves up so neither panel ever reaches the wordmark", (H, inset) => {
    const { anchor, offlineLift } = at(H, inset);
    expect(anchor).toBeLessThan(ANCHOR_RATIO * H);
    expect(cardTop(H, inset) - wordmarkBottom(anchor)).toBeGreaterThanOrEqual(MIN_CLEARANCE);
    expect(panelTop(H, inset) - (wordmarkBottom(anchor) - offlineLift)).toBeGreaterThanOrEqual(MIN_CLEARANCE);
  });

  it("a taller (measured) offline panel lifts the brand further than 64", () => {
    const { anchor, offlineLift } = splashGeometry({ H: 640, bottomInset: 48, cardH: CARD_H_ESTIMATE, panelH: 260 });
    expect(offlineLift).toBeGreaterThan(OFFLINE_LIFT);
    expect(panelTop(640, 48) - 84 - (wordmarkBottom(anchor) - offlineLift)).toBeGreaterThanOrEqual(MIN_CLEARANCE);
  });
});
