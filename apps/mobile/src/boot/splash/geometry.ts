/**
 * Where the splash's brand sits, given the real screen (`packages/design/handoff/splash-v1` § Layout,
 * ledger D-64 #7). Pure, so the 320×640 contract is unit-tested without a device.
 *
 * The handoff places the anchor (sun, orbit, dove) at 44% of H and the wordmark's top at anchor + 152,
 * with the steps card 16px and the offline panel 14px off the bottom — in a frame with NO system bars,
 * where the card clears the wordmark by ~26px at 320×640 ("✅ Fits 320×640"). The app adds the device's
 * bottom inset under both (D-64 #3), and on a 640dp phone with a 48dp 3-button nav bar that put the
 * card ~20dp over "LyniaGo" and the offline panel ~8dp over the lifted wordmark.
 *
 * So, where space is short, the brand moves UP — the handoff's own answer to the offline panel ("the
 * content moves up … so it stays clear of it"), applied to the inset:
 *  - the anchor is 44% of H, or higher if that would leave less than {@link MIN_CLEARANCE} between the
 *    wordmark and the steps card;
 *  - the offline lift is the handoff's 64px, or more if that would leave less than MIN_CLEARANCE
 *    between the lifted wordmark and the panel.
 * On a frame with room (every canonical size without a nav bar, 360×720 with one) both are exactly the
 * handoff's values.
 */

/** The anchor's place: 44% of the height. */
export const ANCHOR_RATIO = 0.44;
/** The wordmark's top, below the anchor, and its height (Fredoka 40, line-height 1). */
export const WORDMARK_TOP = 152;
export const WORDMARK_H = 40;
/** The steps card's and the offline panel's distance from the bottom (before the inset). */
export const CARD_BOTTOM = 16;
export const PANEL_BOTTOM = 14;
/** The handoff's offline lift. */
export const OFFLINE_LIFT = 64;
/** The least space kept between the wordmark and a panel below it (the handoff's own clearance is ~26). */
export const MIN_CLEARANCE = 24;
/** The anchor never rises past this (half the orbit + a margin), however short the screen. */
export const ANCHOR_MIN = 152;
/** First-frame estimates, replaced by the measured heights: the card is 16+16 padding, three 22px rows
 *  and two 12px gaps; the panel is 20+20 padding, title, a two-line body, gaps and the 52px button. */
export const CARD_H_ESTIMATE = 122;
export const PANEL_H_ESTIMATE = 176;

export interface SplashGeometry {
  /** The anchor's y. */
  anchor: number;
  /** How far the brand moves up while the offline panel shows. */
  offlineLift: number;
}

/**
 * First Run v2 H2 (ledger D-80 §2 #2, "the 320×640 rule"): on the entry phone the steps card sits 16
 * above the nav bar (it always does: {@link CARD_BOTTOM} + the inset) and the BRAND is centred in the
 * space above the card. Splash-v1's brand is the orbit (half {@link ORBIT_HALF} above the anchor) down to
 * the wordmark's foot (anchor + 152 + 40), so centring it puts the anchor at `cardTop / 2 − 28`. A frame
 * counts as the entry phone at 340 wide or 640 tall and under (the first-run breakpoint, plus any phone
 * as short as it).
 */
export const ORBIT_HALF = 136;
export const COMPACT_W = 340;
export const COMPACT_H = 640;

export function isCompactSplash(W: number, H: number): boolean {
  return W <= COMPACT_W || H <= COMPACT_H;
}

export function splashGeometry({ W, H, bottomInset, cardH, panelH }: { W?: number; H: number; bottomInset: number; cardH: number; panelH: number }): SplashGeometry {
  const cardTop = H - bottomInset - CARD_BOTTOM - cardH;
  const brandCentred = cardTop / 2 - (WORDMARK_TOP + WORDMARK_H - ORBIT_HALF) / 2;
  const preferred = W != null && isCompactSplash(W, H) ? brandCentred : ANCHOR_RATIO * H;
  const anchor = Math.max(ANCHOR_MIN, Math.min(preferred, cardTop - MIN_CLEARANCE - WORDMARK_TOP - WORDMARK_H));
  const panelTop = H - bottomInset - PANEL_BOTTOM - panelH;
  const offlineLift = Math.max(OFFLINE_LIFT, anchor + WORDMARK_TOP + WORDMARK_H + MIN_CLEARANCE - panelTop);
  return { anchor, offlineLift };
}
