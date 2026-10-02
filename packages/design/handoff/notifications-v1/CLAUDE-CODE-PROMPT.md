# Claude Code prompt · Notifications v1

Copy this folder to `packages/design/handoff/notifications-v1/`, then paste the prompt below.

---

> Rebuild `app/notifications/` (Expo / React Native) to match `packages/design/handoff/notifications-v1/`. Read `README.md` first, then `n-kit.jsx` (parts + the `N` copy object) and `n-screens.jsx` (frames + sample feed). Open `Notifications v1 (standalone).html` and measure against it. Every frame is 360 × 720 and must also work at 320 × 640.
>
> 1. **Copy**: add `N` from `n-kit.jsx` as `app/notifications/copy.ts` without changing it. Names, prices, places and times in it are sample data; build the real strings from the feed using the same sentence shapes. The bead line uses `earlier(n)`.
> 2. **Header and page**: the pushed-screen AHeader (52 px, Back). The page background is `--surface`. Use one white r16 card per day group with 1 px `--line` dividers. Day labels are 11/600 uppercase muted: TODAY · YESTERDAY · then "MON 28 SEP".
> 3. **Grouping in the app** (no API change): group the feed rows by `orderId`. Show one row per order with its latest update. Earlier updates become the timeline, latest first. An order sits in the day of its latest update. Rows without an order id (account, wallet, safety without an order) stay single rows.
> 4. **Row** (`NRow`): a 40 px disc + gold unread dot (order and job rows: the v2 service sticker on its tile tint, with the tone as an 18 px corner mark; other rows: a Lucide icon on a tone-filled disc; see `KIND` / `MARK` in `n-kit.jsx`), title, latest line, time ("now", "2 min", "1 hr", "Yesterday", "28 Sep"). Add the 44 px bead line only when there's more than one update; tapping it expands the inline timeline (`Timeline`), and the footer has "Hide updates" / "Open order" (rider: "Open job"). Tapping the rest of the row opens the order, job or account screen.
> 5. **Tones**: map every feed type to neutral / good / money / needs-you / danger using the README table. Use existing tokens only. Gold `--highlight` is only for the unread dot.
> 6. **Needs you**: only new offer ("See offer"), item swapped ("Review swap") and ID check failed ("Try again") get the inline SmBtn. Each one deep-links to its screen.
> 7. **Danger pin**: an active SOS, account paused or account blocked renders above the day groups in a `--danger` bordered card while it's in force. Once it's lifted, show it as a neutral row in its day.
> 8. **Read state**: on focus, call mark-all-read. Keep the set of rows that were unread in local state so their dots stay until blur.
> 9. **Side**: customers see order rows, riders see job rows, both see account and safety rows. Dual-role users see the feed for the side they're on, plus the `OtherSide` row when the other side has unread items; it opens the existing C4/C5 switch sheet.
> 10. **Notifications off**: if `Notifications.getPermissionsAsync()` isn't granted, show `OffRow` (Rider v2 J8) at the top. "Turn on" → `Linking.openSettings()`. Re-check on app foreground.
> 11. **Swipe to dismiss**: use a Gesture Handler pan with Reanimated. The row follows the finger, opacity goes 1 → 0.3 and the `--danger-wash` "Remove" strip shows behind. Past 35% of the width it removes the row; otherwise it springs back. Show the AToast "Notification removed" + Undo for 5 s, and only call the delete API when the toast expires. Swiping a grouped order removes the whole order's row.
> 12. **States**: skeleton rows (`--skeleton`, same geometry) while loading; after 6 s add "Slow connection. Still loading…". If loading fails with a cache, keep the feed and show the `stale` Notice. With no cache, show N10 with a 52 px "Try again". Empty: the Calm Mint v2 mint card (r20, `trust-tracking.svg`). Customers get one "Send a parcel" action; riders get no action.
> 13. **Rules**: tap targets ≥ 44 px, primary 52 px. No settings, filters, tabs, "Mark all read", badges or confetti.
>
> **Server (separate PR)**: in `apps/api/src/notifications/notifications-feed.service.ts` (~line 410), stop skipping non-parcel orders. Emit restaurant, shop and pharmacy updates (accepted · being prepared · rider collected · at your door · delivered · item swapped) with the venue name as the title and the copy taken from `O.g.push`.
>
> When done: add a ledger entry in `docs/DESIGN-DEVIATIONS.md`, and retire the gallery screens `LJ.notifications` and `LJ.notif_empty`.
