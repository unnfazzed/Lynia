# Orders v2 · BRIEF (2026-10-01)
Decisions as final statements. Owner answers 1–10 from the prompt stand; these are the design calls on top.

1. **Header** reuses Calm Mint v2's mint header: "Your orders" 24/700 + bell, search field below. The header scrolls away with the list.
2. **Now** sits between header and chips, labelled "NOW" (with "· 3" and "Tap an order to open it" when 2+). Absent when nothing runs.
3. **Now card = Home's live bar, in-flow.** Forest, radius 18, 40px brand disc, title in plain words, sub-line, 7-segment progress, highlight ETA chip. No ETA → a quiet translucent pill ("4:12 left", "No ETA", "As of 09:24"). Never a yellow chip without a real ETA.
4. **Card titles say who is doing what now**: "Sadza Republic is cooking", "Tendai has your parcel". A cooking order never reads "Rider assigned".
5. **Progress map (7 segments).** Parcel: finding 1 · assigned 2 · heading to pickup 3 · collected 4 · on the way 6. Food/shop: waiting 1 · preparing 2 · ready 4 · on the way 6. Segment 7 = delivered (card leaves Now).
6. **Parcel rows are titled "Parcel to <drop-off area>"**; the pickup moves to the item line ("Documents · from Eastgate Mall"). Food and shop rows use the venue name.
7. **Row = 3 lines**: title · item summary · outcome tag + rider + your stars. Right column: amount, then time (or date in search results).
8. **Amount column**: paid amount in ink 700; "No charge" in muted 600 for every unpaid outcome; refunds read "$7.50 back" in green-text.
9. **Outcome tones**: Delivered = mint/green-text. Cancelled by you · Rider cancelled · Restaurant (Shop) didn't confirm · No rider found · Refunded = neutral surface/muted (none of them cost money). Not delivered = danger wash/ink (your parcel is still with the rider, so it needs you).
10. **Stars** show only once rated, as filled stars only (★★★★, not ★★★★☆). Unrated rows show nothing: no inline "Rate" (decision 4).
11. **Chips are 44px**, selected = mint fill + check icon + green-text. They scroll sideways when they don't fit (320 @1.3).
12. **Search focus** collapses the header into a mint search bar with "Cancel"; running orders stay as a slim 48px forest strip so Now is always visible. Matches are marked (mint). Results show the date instead of the time.
13. **Empty / offline-nothing / error** hide the search field (nothing to search).
14. **Empty** promises only what Orders does: "Follow the one on its way, and look back at what you paid." Primary: Send a parcel. Secondary (only if food/shops on): Find food or shops.
15. **Offline** is Calm Mint's muted banner under the header with the save time; Now cards keep their last stage and progress, lose the ETA, and show "As of 09:24".
16. **Paging failure** is an inline bottom row (surface, "Try again" 44). A second failure also raises the ink toast for 4 s.

## Open questions
- Not delivered: is anything charged when the rider returns the parcel? Row shows "No charge" until the backend says otherwise.
- Should a rateable (< 7 days, unrated) delivered row carry a passive "Not rated yet" hint? Left out to keep rows calm.
- Font scale 1.3 at 320: chip row scrolls; confirm horizontal scroll is acceptable vs. wrapping to two rows.
