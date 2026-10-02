# Handoff: LyniaGo Orders v2 (customer Orders tab)

## Overview
This is a redesign of the **customer Orders tab** in the LyniaGo Android app (Expo / React Native). It brings the tab into the **Calm Mint v2** visual language used by the new Home.

The new tab has five parts, top to bottom:
- a mint header with the title and search
- a pinned **Now** section with one forest card per running order
- service filter chips
- a day-grouped history that loads older orders automatically
- a full set of states: empty, loading, offline, error, paging and search

It replaces `RC orders`, `RC orders_empty` and Rider v2 **C13 Trip history**. From now on, Orders is the customer's only order history.

## About the design files
The files in `design/` are **design references built in HTML**. They show the intended look and behaviour; they are not production code. The task is to **recreate them in the existing app** (`app/(tabs)/orders.tsx`, Expo / React Native) using its established components, theme tokens and data layer. Do not ship the HTML.

## Fidelity
**High-fidelity.** Colours, type, spacing, radii and copy are final. Recreate the UI pixel-for-pixel at 360×720. To check a single screen, open `design/Orders v2.html?screen=O1`. Add `&w=320` for the small width or `&fs=1.3` for the large font scale. Every id in §3 works.

## Files in this bundle
| path | what |
|---|---|
| `CLAUDE_CODE_PROMPT.md` | Paste into Claude Code to start the implementation. |
| `README.md` | This file: the full spec. |
| `BRIEF.md` | The design decisions as final statements, plus open questions. |
| `copy.ts` | Every user-facing string, **final**. Ships verbatim as `src/ui/orders/copy.ts`. |
| `types.ts` | The suggested view-model and data contract for the tab. |
| `PROMPT-original-brief.md` | The owner's original brief: rules, data model, current state. |
| `design/Orders v2.html` | Canvas of all states. Use `?screen=<id>` for a single frame. |
| `design/o-kit.js` | The HTML kit: CSS for every component, the parts, sample data and `O` (the strings). This is the source of truth for measurements. |
| `design/o-screens.js` | Composes each screen id from the kit. |
| `design/assets/` | Icons (Lucide subset), the service stickers `service-icons/v2/{send,restaurants,shops}.svg`, `illustrations/trust-tracking.svg`, and Inter 400/600/700. Use the copies already in the app where they exist. |

---
## 1. Global constraints
- **Frames:** 360×720 is primary. Every state must work at 320×640, and the key states at font scale 1.3. Content scrolls, and nothing may sit under the 60px tab bar (leave 16px bottom padding).
- **Tabs:** Home · Orders · Account, unchanged (Calm Mint v2's tab bar).
- **No pull-to-refresh and no Refresh button.** The tab refreshes itself on focus, every 30 s while visible, on reconnect and on app resume. A failed background refresh is **silent**: keep showing what you have.
- **Where "Try again" appears:** only on a failed *first* load with no saved copy (O21) and on a failed *older page* (O14). A second failure on the same action also raises the ink toast for 4 s.
- **Tap targets:** at least 44 everywhere; the one primary CTA on a screen is 52. Every icon has a visible text label, except the bell, which matches Home.
- **Numbers:** tabular numerals on every number. Money is USD with 2 decimals.
- **Colour rules:** never red text on white. Green *text* is `#006630`; brand `#00B14F` is for fills only.
- **Depth:** zero shadows anywhere. The forest card is the only solid exception.
- **Vocabulary:** Order · Rider · Delivery code · Send again · LyniaGo (never "Lynia").

## 2. Navigation
- **Now card tap:** opens that running order's screen (After Send v2, or the food/shop order screen).
- **History row tap:** opens that order's screen in its end state (receipt · rating · Send again · Get help). A row has **no inline actions**.
- **Filter chip tap:** filters the **history only**, in place. The Now section always shows.
- **Search field tap:** enters the focused search state (O10a). "Cancel" clears the query, leaves the field and restores the full header. "Clear" empties the query but keeps focus.
- **Bell tap:** opens notifications (existing route).
- **Home live bar:** with 1 running order it opens that order's screen; with 2 or more it opens this tab scrolled to the top (O2).
- **Account (customer side):** remove the **Trip history** row. What remains: Notifications · Help & support · Settings (O22). The rider-side **Job history** stays as it is.

## 3. Screens and states
| id | state | notes / replaces |
|---|---|---|
| O1 | One running parcel + history | redesigns `RC orders` |
| O2 | 3 running: food cooking, parcel finding, shop packing | Landing from Home "+1 order". The Now label reads "NOW · 3" with the helper "Tap an order to open it". |
| O3 | Now card for food and shops: waiting · preparing · ready · rider on the way | |
| O4 | Now card for parcels: finding · assigned · to pickup · collected · on the way · GPS not sending | |
| O5 | History only | The Now section is absent, not an empty box. |
| O6 | Every outcome | |
| O7 | Day grouping: Today · Yesterday · weekday · dated | Merges C13 Trip history. |
| O8 | Long venue / address / items @1.3 | Titles and items clamp to 2 lines. |
| O9a–c | Filter: Parcels · Food · Shops | |
| O9d | Filter with no matches | White card with "Show all orders". |
| O9e | Only one service on | No chips at all. |
| O10a | Search focused, keyboard up | Compact header, Now strip, hint line. |
| O10b | Typing, results | Matches marked in mint. Results show the date instead of the time. |
| O10c | No results | |
| O10d | Results, keyboard down | Full header with the query in the field. |
| O11 | Search while offline | Searches only the saved list, and says so. |
| O12 | Loading older | Automatic; no button. |
| O13 | End of history | |
| O14 | Older page failed | The list above stays. |
| O14t | The retry failed again | Ink toast for 4 s. |
| O15 | First load | Real header, skeleton chips and rows. |
| O16 | Empty, every service on | redesigns `RC orders_empty` |
| O17 | Empty, parcels only | No food or shop promise. |
| O18 | Only a running order, no history yet | |
| O19 | Offline cold start with a saved list | Banner. Now cards keep their stage, drop the ETA and show "As of 09:24". |
| O20 | Offline with nothing saved | |
| O21 | Couldn't load (server error, no saved copy) | "Try again" button. |
| O22 | Customer Account without Trip history | Retires the C13 row. |

**Layout order, top to bottom:** status bar 28 → header (scrolls away with the list) → [offline banner] → Now section → chips → day-grouped history → loading / end / failed row → 16 padding → tab bar 60 (fixed).

**Hidden states:**
- In the empty, offline-with-nothing-saved and error states, the search field is hidden because there is nothing to search.
- The chips are hidden with fewer than 2 services enabled, and also while the history is empty.

---
## 4. Components (360; 320 differences noted)
Font: Inter. Sizes are px at font scale 1; type is size/weight.

**Header**
- Background mint `#E9F8EF`, bottom radius 28, padding-bottom 18, overflow hidden.
- Decorative circles sit behind the content:
  - yellow `#FFD23F`, 150px, at right −62 / top −58
  - coral `#FF6B4A`, 26px, at right 78 / top 64 (320: right 14 / top 100)
  - sky `#3EC1F3`, 14px, at right 30 / top 112 (320: right 50 / top 128)
- Title row: padding 10 16 0, space-between, gap 12.
  - "Your orders" 24/700, line-height 1.15, letter-spacing −0.4, ink.
  - Bell: 44 white circle, `bell` icon 20 in `#006630`. Unread dot 8px `#FFD23F` with a 2px white ring, at top 10 / right 11.

**Search field**
- Margin 14 16 0, height 48, white, radius 12, no border.
- Padding: 0 4 0 14. Gap 10.
- `search` icon 18 muted. Placeholder "Search your orders" 14/400 muted.
- **Focused:** 2px `#00B14F` border (left padding 12), ink text, brand caret. A "Clear" button (x icon 16 + "Clear" 13/600 muted, min 44×44) appears once the query isn't empty.
- **Focused header (O10a–c, O11):**
  - Mint, padding-bottom 12, no circles, status bar kept.
  - Row padding 6 8 0 16: the field (flex 1, margin 0), then "Cancel" 14/600 `#006630` in a 64×44 target.
  - The title is hidden.

**Section label "NOW"**
- Padding 20 16 8. 12/600 uppercase, letter-spacing 0.4, muted.
- With 2+ orders: "NOW · 3", plus a helper on the right, "Tap an order to open it" (12.5/400, no uppercase). The helper is hidden while offline.

**Now card**
- Background `#063B22`, radius 18, padding 12, row layout with gap 12, align center, min-height 72.
- Stack gap 8; side padding 16.
- Disc: 40 circle `#00B14F` with a white 20px icon. The icon is `package` / `utensils` / `shopping-bag` per service, switching to `bike` once a rider is carrying the order (stage seg 6).
- Title: 15/700 white, line-height 1.25, max 2 lines.
- Sub: 12.5/400 `#BFE6CD`, line-height 1.35, 1 line with ellipsis, margin-top 2.
- Progress:
  - margin-top 8, max-width 150, 7 segments, each flex 1 × 3px tall, gap 3, radius 2.
  - Filled segments: `#00B14F`. Empty segments: `rgba(255,255,255,.22)`.
- Right side, one of:
  - **ETA chip:** `#FFD23F` background, `#3D3100` text, 13/700, padding 6 10, pill.
  - **Status pill** (when there's no ETA): `rgba(255,255,255,.14)` background, white text, 12/600, padding 6 10, pill.
  - Never a yellow chip without a real ETA.
- Offline: the sub is prefixed "Last known · ", the icon stays the service icon, and the right side shows the pill "As of 09:24".

**Card stages and progress segments.** Titles say who is doing what right now.

| service | stage | title | sub | segments | right |
|---|---|---|---|---|---|
| parcel | finding | Finding a rider | Parcel to Belgravia · asking $3.36 | 1 | pill "4:12 left" |
| parcel | assigned | Tendai M. is your rider | Parcel to Belgravia · Rider assigned | 2 | ETA |
| parcel | to pickup | Tendai is heading to pickup | Eastgate Mall, CBD → Belgravia | 3 | ETA |
| parcel | collected | Tendai has your parcel | Parcel collected · going to Belgravia | 4 | ETA |
| parcel | on the way | Tendai is on the way | Parcel to Belgravia · $3.36 | 6 | ETA |
| parcel | GPS stale | Tendai is on the way | Location not updating · last seen 09:18 | 6 | pill "No ETA" |
| food | awaiting accept | Waiting for Sadza Republic | Restaurants usually confirm in 5 min · $15.50 | 1 | — |
| food | preparing | Sadza Republic is cooking | Preparing · a rider is sent near the end | 2 | ETA |
| food | ready | Your food is ready | Ready for pickup · Rudo K. is collecting | 4 | ETA |
| food | on the way | Rudo is on the way | Food from Sadza Republic · $15.50 | 6 | ETA |
| shop | same phases | "Waiting for Avondale Pharmacy", "Avondale Pharmacy is packing", "Farai is on the way" | | | |

Segment 7 means delivered; at that point the card leaves Now and becomes a history row. A food order that is still cooking never reads "Rider assigned".

**Now strip** (search states only)
- Margin 12 16 0, `#063B22`, radius 14, min-height 48, padding 6 6 6 12, gap 10.
- `bike` icon 18 `#BFE6CD`, title 13.5/600 white with ellipsis, ETA chip 12/700 (padding 5 9).
- One strip per running order.

**Filter chips**
- Row padding 16 16 0, gap 8. The row scrolls sideways when it overflows (320 @1.3).
- Chip: height 44, padding 0 16, pill, 14/600, `nowrap`.
- **Off:** 1px `#E2E6EA` border, ink text.
- **On:** `#E9F8EF` fill and border, `#006630` text, plus a `check` icon 16 before the label.
- Labels: All · Parcels · Food · Shops. A chip only renders for an enabled service.

**Day label**
- Padding 20 16 2. 12/600, letter-spacing 0.4, muted, uppercase.
- Format: TODAY · YESTERDAY · weekday name (2–6 days ago, e.g. "MONDAY") · otherwise "TUE 22 SEP".
- Add the year when it isn't the current one ("TUE 22 SEP 2025").

**History row**
- Row: padding 0 16, gap 12.
- Icon disc: 44 circle, margin-top 12, filled with the service tint: send `#CDEEDA` · food `#FFD9CC` · shops `#DDD5FF`. It holds the 30px v2 sticker.
- Content: flex 1, padding 12 0, 1px `#E2E6EA` bottom border (none on a day group's last row). Gap 10 between the text and the amount column.
  1. **Title:** 15/600, line-height 1.3, ellipsis (2-line clamp at font scale > 1). Parcels: "Parcel to <drop-off area>". Food and shops: the venue name.
  2. **Items:** 13/400 muted, margin-top 1, ellipsis (2-line clamp at scale > 1). Parcels: "<itemDesc> · from <pickup landmark>". Merchants: the dishes ("Sadza & beef stew, Mazoe ×2"), or "3 items".
  3. **Meta row:** margin-top 6, flex-wrap, gap 4 8, 12.5 muted. It holds the outcome tag, then the rider name (if any), then the stars (if rated).
- **Amount column** (right-aligned, stacked, gap 3):
  - Paid: "$12.50" 15/700 ink.
  - Unpaid: "No charge" 13/600 muted.
  - Refunded: "$7.50 back" 13/600 `#006630`.
  - Under it: the time "13:05" 12 muted. In search results, the date replaces the time ("Today" / "Yesterday" / "Monday" / "Tue 22 Sep").
- Row height is about 84. The whole row is the tap target.

**Outcome tag**
- Height 22, padding 0 8, pill, 12/600, with a 12px icon before the label (gap 4).

| outcome | label | tone | icon |
|---|---|---|---|
| delivered / completed | Delivered | `#E9F8EF` / `#006630` | check |
| cancelled by customer | Cancelled by you | `#F6F7F8` / `#5B6670` | ban |
| cancelled by rider | Rider cancelled | neutral | ban |
| kitchen auto-cancel (food) | Restaurant didn't confirm | neutral | clock |
| kitchen auto-cancel (shop) | Shop didn't confirm | neutral | clock |
| expired | No rider found | neutral | bike |
| undelivered | Not delivered | `#FAEDEB` / `#8F2418` | triangle-alert |
| refunded | Refunded | neutral | wallet |

Only "Not delivered" uses the problem tone, because the customer's parcel is still with the rider. None of the neutral outcomes cost the customer money.

**Stars**
- Shown only after the customer rated: N filled stars, 12px, fill `#FFD23F`, stroke `#C99500`, gap 1. Add `aria-label="N stars"`.
- Unrated rows show nothing.

**Paging rows**
- **Loading older:** min-height 56, centred. An 18px spinner (2.5px ring `#CDEEDA` with a `#00B14F` top arc, 0.8 s linear rotate), then "Loading older orders…" 13/600 muted. Trigger it when the list is within about 1 screen of the bottom.
- **End:** padding 20 16 24. `check` 16 green + "That's everything" 13/600 ink; below it "Your orders since Mar 2025" 13/400 muted (from the first order's date).
- **Page failed:** margin 8 16 16, `#F6F7F8`, radius 14, padding 6 6 6 14, space-between. Text "Couldn't load older orders" 13/600 muted, then a ghost button: white, 44 tall, pill, 1px line border, `refresh-cw` 16 + "Try again" 14/600 `#006630`.

**Offline banner**
- Margin 12 16 0, `#F6F7F8`, radius 12, padding 10 12, gap 10.
- `wifi-off` 16 muted, then the text 13/600 muted, line-height 1.4.
- Copy:
  - list: "You're offline. Showing your orders as of 09:24."
  - search: "You're offline. Searching orders saved on this phone."

**Empty / info cards**
- Margin 20 16 0, radius 20, padding 20, text centred.
- Background: mint (empty states) or white with a 1px line border (filter-none, offline-nothing, error).
- Content: art or a 64px icon disc, then the title 18/700 (margin-top 8), then the body 14/400 muted (line-height 1.45, margin 6 0 16).
- **O16:** trust-tracking art (104 tall), the title, the body, a primary "Send a parcel" button (52, `#00812F`, pill, `package` icon), and a secondary text button "Find food or shops" (48, `#006630`, 14/600).
- **O17:** only the primary button, and the body without food or shops.
- **O20:** a `wifi-off` disc on `#F6F7F8`.
- **O21:** a `circle-alert` disc on `#FAEDEB` / `#8F2418`, plus a primary "Try again" button with `refresh-cw`.

**Toast**
- Position: left/right 12, bottom 72 (above the tab bar).
- `#14181B`, radius 12, padding 6 6 6 14.
- Text 14 white, then the action "Try again" with `refresh-cw` 16, both `#FFD23F` 600, in a 44 target.
- Shows for 4 s; tapping the action retries.

**Skeleton (O15)**
- Blocks in `#EEF1F3`, radius 12 (circles for the icon discs).
- Four chip pills (56/88/68/72 wide), a day-label bar, then 5 rows mirroring the row anatomy.
- The header is real, with the search field at 60% opacity.

**Customer Account (O22)**
- Unchanged from Rider v2 apart from the removed row.
- Rows (min 60): Notifications ("3 new" tag) · Help & support ("WhatsApp or call the safety line") · Settings ("Language, payment, privacy").

## 5. Interactions and behaviour
- **Refresh:** on focus, every 30 s while visible, on reconnect and on app resume. Merge the results into the list without moving the scroll position. No spinners for background refreshes.
- **Saved copy:**
  - Persist the last list (Now + the first page of history) together with its fetch time.
  - On a cold start, paint the saved list immediately, then fetch.
  - While offline, show the banner with the save time. Now cards show their last stage, no ETA, and the "As of HH:MM" pill.
- **Paging:** cursor-based. Fetch the next page as the list nears the bottom. Show "Loading older" while it fetches.
  - When the page comes back empty, show the End row.
  - When it fails, show the Page-failed row. "Try again" refetches the same cursor. A second failure also raises the toast.
- **Search:**
  - Debounce 300 ms. Match the venue name, drop-off area and rider name (case-insensitive) and highlight the matched substring (mint background, `#006630` text, radius 4, padding 0 2).
  - Results are a flat list (no day labels), headed "N orders match "<q>"".
  - Search ignores the chip filter, and the Now strip stays visible.
  - Offline, match the saved list locally and add the footnote (`O.noMatchOff`).
- **Filters:** a client-side filter on the service while history is paged. If a page under a filter returns 0 matches, keep paging until the end.
- **Now ordering:** most-advanced stage first, then newest. A card leaves Now as soon as its order is delivered or cancelled.
- **Font scale:** every text size scales with the system font. Titles and items clamp to 2 lines, the chip row scrolls sideways, and the amount column never wraps.

## 6. State (suggested; see `types.ts`)
`running: NowCardVM[]`, `history: HistoryRowVM[]`, `cursor: string|null`, `paging: 'idle'|'loading'|'failed'|'end'`, `firstLoad: 'loading'|'ok'|'error'`, `online: boolean`, `savedAt: Date|null`, `filter: 'all'|'send'|'restaurants'|'shops'`, `query: string`, `searchFocused: boolean`, `enabledServices` (from feature flags).

**Screen choice:**
- firstLoad `loading` with no saved copy → O15
- `error` with no saved copy → O21, or O20 if offline
- no orders at all → O16 / O17
- running orders but no history → O18
- otherwise → the list

## 7. Design tokens (Calm Mint v2; no new tokens)
**Colours:**
- ink `#14181B` · muted `#5B6670` · line `#E2E6EA` · surface `#F6F7F8`
- brand `#00B14F` (fills only) · green-text `#006630` · cta `#00812F` (pressed `#006B27`)
- mint `#E9F8EF` · forest `#063B22` (sub-text `#BFE6CD`)
- highlight `#FFD23F` · highlight-ink `#3D3100` · star-stroke `#C99500`
- coral `#FF6B4A` · sky `#3EC1F3` (decorative only)
- tile-send `#CDEEDA` · tile-food `#FFD9CC` · tile-shops `#DDD5FF`
- danger-wash `#FAEDEB` · danger-ink `#8F2418`
- skeleton `#EEF1F3` · spinner track `#CDEEDA`

**Type:** Inter 400/600/700, tabular numerals. Scale: 24 / 18 / 16 / 15 / 14 / 13.5 / 13 / 12.5 / 12 / 11.

**Space:** gutter 16, grid 8.

**Radius:** search 12 · banner 12 · now strip 14 · page-fail 14 · now card 18 · empty card 20 · header bottom 28 · pills 999.

**Shadows:** none.

## 8. Assets
- **Icons:** Lucide (ISC): package, utensils, shopping-bag, bike, bell, search, x, check, ban, clock, triangle-alert, wallet, star, refresh-cw, wifi-off, circle-alert, receipt, store, user, chevron-right, message-circle, settings. Use the app's existing icon set.
- **Service stickers:** `assets/service-icons/v2/{send,restaurants,shops}.svg`, the same files as on Calm Mint v2 Home.
- **Empty-state art:** `assets/illustrations/trust-tracking.svg`.

## 9. NEEDS BACKEND
- A paged `/orders/history?cursor=` (beyond the latest 50), plus the date of the customer's first order for the End row.
- Search on the server (venue, drop-off area, rider).
- On each history row:
  - the amount charged and a refund flag with its amount
  - the cancel reason: `by_customer` · `by_rider` · `kitchen_timeout` · `lynia`
  - an item summary for merchant orders
  - the shop `kind` and the payment method
- The drop-off **area** (suburb), for "Parcel to <area>". Until it exists, fall back to the first segment of the drop-off address.
- For running food and shop orders: the kitchen phase and the estimated ready time.
- For running parcels: the rider's GPS last-seen time (it drives "No ETA").

## 10. Retires
- `RC orders` and `RC orders_empty` (gallery "Home & orders")
- Rider v2 **C13 Trip history**, its route and its Account row
- The "EARLIER" label, the green-outlined live card, the "Sent" meta on every row, and the ghost "Retry" in the offline sentence

## 11. Open questions (owner)
1. "Not delivered": is the customer charged when the parcel is returned? The row shows "No charge" until we know.
2. Stars: should rated rows show filled stars only (current), all 5 with empties, or a word ("Good")?
3. The expired label: "No rider found" (this design) or After Send's "No rider yet"? The two should match.
4. Now card type is 15/12.5, against Home's live bar at 14/12. Keep it, or match Home?
