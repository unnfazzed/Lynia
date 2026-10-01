# Browse v2 · BRIEF (Oct 2026)
Decisions for the Restaurants, Shops and Pharmacy browse pages. Each one is final unless the owner changes it.

## Decisions
1. **One template, three skins.** List → storefront → item sheet → cart bar is the same for all three services. Only these change: sticker/tint, list chips, storefront body (dish rows / item grid / item rows), note label, time word, and the OTC notice.
2. **Pharmacy is its own page, not a Shops chip.** It's the Shops template locked to kind = pharmacy, with no chips and the OTC notice under the header and on the storefront.
3. **The list header is Calm Mint v2's mint header:** back, the same "DELIVERING TO" control as Home, the service title + sticker, and the 48px search. When you scroll, it collapses to a white 56px bar (back · title · search icon). Chips and Sort stick under it.
4. **The list has two controls: one Sort button and one "Free delivery" button.** "Free delivery" shows only when at least one venue funds delivery. Cuisine (restaurants) or Shop type (shops) is a dropdown at the top of the Sort sheet. A chosen category is shown inside the Sort button ("Auto parts · Sort: Recommended", green). Choosing a sort applies it and closes the sheet, so there's no Apply button. (The round-1 chip row and the round-2 category circles are both removed.)
5. **There's no "Open now" filter. Closed venues never disappear.** They go in a "Closed now" group at the end of the list, with "Opens 10:00" (or "Opens tomorrow 09:00").
6. **Card rhythm:** the first 2 results are full cards (2:1 image), the rest are compact rows (96×80 thumb). Each compact row has three fixed lines: name / "cuisine · km" / "★ rating (count) · fee". Every line is a single line with an ellipsis, so it never wraps.
7. **The fee is muted ink, never green.** "Free delivery" uses the purple `free` token: a tag on the image in full cards, and bold purple text in compact rows.
8. **"Closes in 15 min"** is a solid highlight pill on the image (list) and a highlight-wash strip (storefront).
9. **The storefront answers four questions above the fold.** A 4-cell info strip shows ★ rating (count) · time range · delivery fee · distance. The open-state strip under it shows open until / closing soon / closed + Remind me.
10. **There's one scrolling menu.** Sticky tabs scroll-spy: tapping a tab jumps to that section. Section headings stay, because the page is one scroll.
11. **The + sits inside the photo** (32px disc, 44px target confined to the image), so it never overflows the screen edge. Once an item is in the cart, the disc shows the count and a "− n +" stepper (44 tall) appears under the price. At quantity 1, − becomes a bin.
12. **When the venue is closed, there's no + anywhere.** Prices and photos stay visible. The item sheet opens read-only, with a disabled "Opens at 10:00" bar and the Remind me toggle.
13. **Starting a new cart is asked before anything is cleared.** The "Start a new cart?" sheet names the old cart and the item being added.
14. **The cart bar is the forest family** (like Home's live bar): bag disc · "3 items · $12.50" · venue · highlight "View cart". Under $4.00, the sub-line becomes "Add $0.70 to skip the $1.00 small-order fee" with a progress line. It never blocks checkout.
15. **No location ⇒ no numbers.** Cards show rating only, a mint "Where should we deliver?" card sits on top, and Nearest / Fastest / Lowest fee are greyed out in the Sort sheet.
16. **An unrated venue shows "New"** (never ★ 0). In the storefront strip it reads "New / No ratings yet".
17. **Venues without a cover** get the service tint band with Calm Mint's decorative circles, and a logo disc with the initial in the kind tint. On list cards, the initial sits on a white 76px disc so the fallback reads as a logo, not as a missing photo.
18. **Search is scoped by where you start.** From a service page you get PLACES + DISHES/ITEMS for that service. From Home you get RESTAURANTS · SHOPS · PHARMACY · DISHES & ITEMS, plus a "Send a parcel" row when the words sound like a parcel.
19. **A deep link into a switched-off service** opens the service header dimmed, with Calm Mint's notify-me sheet over it. Closing the sheet goes back to Home.

## Open questions
- **Cover ratio.** The data is a 3:1 banner, but the brief asks for 16:9. I drew 360×140 (≈2.6:1, centre crop) so the banner isn't cropped badly. Is a 16:9 upload worth adding to the merchant app?
- **Kind ink colours** (#8A1F5C Fashion, #0B5A7A Auto parts) come from Calm Mint v2's code, not its token table. Should they be promoted to tokens?
- **Shop item photos are placeholders** in this pack. Real samples from merchants signing up would help the grid review.
- **"Busy mode"** (+10 min) copy is in `B.store.busy` but not drawn on a frame. Should it show in the open-state strip?
