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
 * under the wordmark since the steps card was removed (CHANGE-2026-10-06), so the anchor is always
 * exactly 44% of H. On a frame with room (every canonical size without a nav bar, 360×720 with one)
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

export interface SplashGeometry {
  /** The anchor's y. */
  anchor: number;
  /** How far the brand moves up while the offline panel shows. */
  offlineLift: number;
}

export function splashGeometry({ H, bottomInset, panelH }: { H: number; bottomInset: number; panelH: number }): SplashGeometry {
  const anchor = ANCHOR_RATIO * H;
  const panelTop = H - bottomInset - PANEL_BOTTOM - panelH;
  const offlineLift = Math.max(OFFLINE_LIFT, anchor + WORDMARK_TOP + WORDMARK_H + MIN_CLEARANCE - panelTop);
  return { anchor, offlineLift };
}
