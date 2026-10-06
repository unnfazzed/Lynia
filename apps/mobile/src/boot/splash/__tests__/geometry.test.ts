/**
 * Splash layout on real screens (ledger D-64 #7, S-5). The anchor is the handoff's 44% of H everywhere
 * (nothing sits under the wordmark since the steps card was removed, CHANGE-2026-10-06). The offline
 * lift is the handoff's 64px wherever that clears the panel; with the bottom inset under the panel on a
 * short phone it grows, so the lifted wordmark is never under the panel.
 */
import { ANCHOR_RATIO, MIN_CLEARANCE, OFFLINE_LIFT, PANEL_BOTTOM, PANEL_H_ESTIMATE, WORDMARK_H, WORDMARK_TOP, splashGeometry } from "../geometry";

const wordmarkBottom = (anchor: number): number => anchor + WORDMARK_TOP + WORDMARK_H;
const panelTop = (H: number, inset: number, panelH = PANEL_H_ESTIMATE): number => H - inset - PANEL_BOTTOM - panelH;

describe("splashGeometry", () => {
  const at = (H: number, bottomInset: number) => splashGeometry({ H, bottomInset, panelH: PANEL_H_ESTIMATE });

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
    [640, 48], // the entry phone with a 3-button nav bar — 64px left the panel over the lifted wordmark
    [640, 24], // …and with gesture navigation
    [600, 48],
  ])("H=%i, inset %i: the anchor stays at 44%%; the lift grows so the panel never reaches the wordmark", (H, inset) => {
    const { anchor, offlineLift } = at(H, inset);
    expect(anchor).toBe(ANCHOR_RATIO * H);
    expect(offlineLift).toBeGreaterThan(OFFLINE_LIFT);
    expect(panelTop(H, inset) - (wordmarkBottom(anchor) - offlineLift)).toBeGreaterThanOrEqual(MIN_CLEARANCE);
  });

  it("a taller (measured) offline panel lifts the brand further", () => {
    const { anchor, offlineLift } = splashGeometry({ H: 700, bottomInset: 0, panelH: 260 });
    expect(offlineLift).toBeGreaterThan(OFFLINE_LIFT);
    expect(panelTop(700, 0, 260) - (wordmarkBottom(anchor) - offlineLift)).toBeGreaterThanOrEqual(MIN_CLEARANCE);
  });
});
