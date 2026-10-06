/**
 * Splash layout on real screens (ledger D-64 #7, S-5). The anchor is the handoff's 44% of H everywhere
 * (nothing sits under the wordmark since the steps card was removed, CHANGE-2026-10-06). The offline
 * lift is the handoff's 64px wherever that clears the panel; with the bottom inset under the panel on a
 * short phone it grows, so the lifted wordmark is never under the panel.
 */
import {
  ANCHOR_RATIO,
  CARD_BOTTOM,
  CARD_H_ESTIMATE,
  MIN_CLEARANCE,
  OFFLINE_LIFT,
  ORBIT_HALF,
  PANEL_BOTTOM,
  PANEL_H_ESTIMATE,
  WORDMARK_H,
  WORDMARK_TOP,
  isCompactSplash,
  splashGeometry,
} from "../geometry";

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

describe("the rider card (First Run v2 H2 — the 320×640 rule, ledger D-82 §2 #2)", () => {
  const brandTop = (anchor: number): number => anchor - ORBIT_HALF;
  it.each([
    [48, "3-button"],
    [20, "gesture"],
  ])("inset %i (%s): the card is 16 above the nav bar and the brand is centred in the space above it", (inset) => {
    const { anchor } = splashGeometry({ W: 320, H: 640, bottomInset: inset, cardH: CARD_H_ESTIMATE, panelH: PANEL_H_ESTIMATE });
    const top = 640 - inset - CARD_BOTTOM - CARD_H_ESTIMATE;
    expect(Math.abs(brandTop(anchor) - (top - wordmarkBottom(anchor)))).toBeLessThanOrEqual(1);
    expect(top - wordmarkBottom(anchor)).toBeGreaterThanOrEqual(MIN_CLEARANCE);
  });

  it("leaves every larger frame on splash-v1's 44%, and a customer boot (no card) everywhere", () => {
    expect(isCompactSplash(360, 720)).toBe(false);
    expect(isCompactSplash(320, 640)).toBe(true);
    expect(isCompactSplash(360, 640)).toBe(true);
    expect(splashGeometry({ W: 360, H: 720, bottomInset: 0, cardH: CARD_H_ESTIMATE, panelH: PANEL_H_ESTIMATE }).anchor).toBe(ANCHOR_RATIO * 720);
    expect(splashGeometry({ W: 320, H: 640, bottomInset: 48, cardH: null, panelH: PANEL_H_ESTIMATE }).anchor).toBe(ANCHOR_RATIO * 640);
  });
});
