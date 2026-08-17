# Work order — implement Customer Home "8c" (LyniaGo app)

You are implementing the redesigned customer home screen in the existing LyniaGo app (Expo / React Native, Android-first, 320px-min widths, ~150KB per-screen budget). The pixel reference is `home-8c.html` in this folder — open it at 360px width and treat it as the acceptance target. `README.md` documents every measurement; this file is the task order.

## Task
Replace the current root home screen with 8c. Same route, same tab position (Home). The screen must be **visually and structurally identical** to the reference: same order of blocks, same spacing, same radii, same colors, same weights.

## Do
1. **Header**: mint block (#e9f8ef) containing greeting (25/700, time-aware: morning <12, afternoon <18, evening after; sun sticker swaps to moon after 18:00), current-location address row (reverse-geocoded GPS; 12.5/600 #006630; tap → location sheet; permission-denied → last known + "set location"), bell button (white 42px circle, gold dot when unread notifications > 0), and the quiet search bar (white, radius 12, padding 10×15, placeholder 12.5 #5b6670). No avatar in the header.
2. **ServiceTiles**: 3-across pressable tiles per README §2 — use the three SVGs in `assets/` (react-native-svg; import as-is, no redrawing, no tinting). Press state: scale 0.97, no ripple color change. Send → send-parcel flow; Restaurants → restaurants list; Pharmacy → notify-me sheet while flagged SOON.
3. **LiveOrderCard (tracker pill)**: render one per running order per README §3; hide entirely when none. ETA chip updates live; progress segments map to the existing 7-step order state machine.
4. **Popular near you**: nearest open venues from the existing venues query; photo cards per README §4 with the tinted-initial fallback when a photo is missing/slow (existing RestaurantCard behavior); lazy-load photos ≤25KB.
5. **Tab bar**: unchanged 3-tab (Home/Orders/Account).

## Don't
- No box-shadow / elevation anywhere on this screen (hard rule — includes Android elevation).
- No bold service labels (12/400 regular ink).
- Gold only on: unread dot, SOON chip, ETA chip, stars.
- Don't invent extra sections, banners, or icons; don't change copy.

## Acceptance checklist
- [ ] Screenshot at 360×720 matches `home-8c.html` side-by-side (block order, spacing, radii, colors, weights).
- [ ] Greeting/sun react to device time; address shows live current location and opens the picker.
- [ ] Tracker hidden with no active order; appears with one; ETA chip and segments live-update.
- [ ] Pharmacy tile opens notify-me sheet (never inert).
- [ ] elevation/shadow grep over the new screen returns nothing.
- [ ] All numbers render tabular-lining (Inter).
