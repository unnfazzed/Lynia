/**
 * Where the splash's brand sits, given the real screen (`packages/design/handoff/splash-v1` § Layout,
 * ledger D-64 #7). Pure, so the 320×640 contract is unit-tested without a device.
 *
 * The handoff places the anchor (sun, orbit, dove) at 44% of H and the wordmark's top at anchor + 152,
 * with the offline panel 14px off the bottom, and lifts the brand 64px while the panel shows — in a
 * frame with NO system bars. The app adds the device's bottom inset under the panel (D-64 #3), and on a
 * 640dp phone with a 48dp 3-button nav bar that put the panel over the lifted wordmark.
 *
 * So the offline lift is the handoff's 64px, or more if that would leave less than
 * {@link MIN_CLEARANCE} between the lifted wordmark and the panel — the handoff's own answer to the
 * panel ("the content moves up … so it stays clear of it"), applied to the inset. Nothing else sits
 * under the wordmark since the customer's steps card was removed (CHANGE-2026-10-06), so the anchor is
 * exactly 44% of H — except on a rider boot, whose card the brand must clear (`cardH`, below). On a frame with room (every canonical size without a nav bar, 360×720 with one)
 * the lift is exactly the handoff's 64px.
 */

/** The anchor's place: 44% of the height. */
export const ANCHOR_RATIO = 0.44;
/** The wordmark's top, below the anchor, and its height (Fredoka 40, line-height 1). */
export const WORDMARK_TOP = 152;
export const WORDMARK_H = 40;
/** The offline panel's distance from the bottom (before the inset). */
export const PANEL_BOTTOM = 14;
/** The handoff's offline lift. */
export const OFFLINE_LIFT = 64;
/** The least space kept between the lifted wordmark and the panel below it. */
export const MIN_CLEARANCE = 24;
/** First-frame estimate, replaced by the measured height: 20+20 padding, title, a two-line body, gaps
 *  and the 52px button. */
export const PANEL_H_ESTIMATE = 176;

// ── The rider's steps card (First Run v2 H1/H2, ledger D-82 §2 #2) ──
/** The rider card's distance from the bottom (before the inset): "navBarHeight + 16". */
export const CARD_BOTTOM = 16;
/** First-frame estimate of the rider card, replaced by the measured height: 8+8 padding, two 48dp rows. */
export const CARD_H_ESTIMATE = 112;
/** The anchor never rises past this (half the orbit + a margin), however short the screen. */
export const ANCHOR_MIN = 152;
/** Half the orbit: the brand's top edge sits this far above the anchor. */
export const ORBIT_HALF = 136;
/** The entry phone (H2's 320×640): at most this wide, or at most this tall. */
export const COMPACT_W = 340;
export const COMPACT_H = 640;

export function isCompactSplash(W: number, H: number): boolean {
  return W <= COMPACT_W || H <= COMPACT_H;
}

export interface SplashGeometry {
  /** The anchor's y. */
  anchor: number;
  /** How far the brand moves up while the offline panel shows. */
  offlineLift: number;
}

/**
 * `cardH` is set only on a rider boot, whose steps card sits {@link CARD_BOTTOM} above the nav bar. The
 * brand then stays clear of the card, and on the entry phone ({@link isCompactSplash}) it is centred in
 * the space above the card (First Run v2 H2): the brand runs from the orbit's top ({@link ORBIT_HALF}
 * above the anchor) to the wordmark's foot, so centring it puts the anchor at `cardTop / 2 − 28`.
 */
export function splashGeometry({ W, H, bottomInset, panelH, cardH }: { W?: number; H: number; bottomInset: number; panelH: number; cardH?: number | null }): SplashGeometry {
  let anchor = ANCHOR_RATIO * H;
  if (cardH != null) {
    const cardTop = H - bottomInset - CARD_BOTTOM - cardH;
    const brandCentred = cardTop / 2 - (WORDMARK_TOP + WORDMARK_H - ORBIT_HALF) / 2;
    const preferred = W != null && isCompactSplash(W, H) ? brandCentred : anchor;
    anchor = Math.max(ANCHOR_MIN, Math.min(preferred, cardTop - MIN_CLEARANCE - WORDMARK_TOP - WORDMARK_H));
  }
  const panelTop = H - bottomInset - PANEL_BOTTOM - panelH;
  const offlineLift = Math.max(OFFLINE_LIFT, anchor + WORDMARK_TOP + WORDMARK_H + MIN_CLEARANCE - panelTop);
  return { anchor, offlineLift };
}
