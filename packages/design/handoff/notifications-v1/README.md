# LyniaGo Notifications v1 — handoff (2026-10-02)

Redesign of the shared Notifications screen (customer + rider, one app), in the Calm Mint v2 / Rider v2 language. Replaces the August screen (`LJ.notifications`, `LJ.notif_empty`).

## Open
- `Notifications v1 (standalone).html` — works offline, open in Chrome. Prototype at the top (tap the dot line under a row to expand it, drag a row sideways to remove it, then Undo; switch Customer/Rider, Notifications off, 320 × 640), then every frame, the 320 × 640 checks, the decisions and the full `N` copy list.
- `Notifications v1.html` — the same page, run from inside the design-system project (needs `../../styles.css`, `../../assets/lynia-icons.js`, `../rider-v2-2026-10/*-kit.jsx`).
- Single frames: `Notifications v1.html?only=N1,N2` · add `&w=320` for 320 × 640.

## Files
- `n-kit.jsx` — **`N`, every user-facing string (ships verbatim)**, plus the parts: `NDisc`, `NHeader`, `NCard`, `Day`, `Beads`, `Timeline`, `NRow`, `SwipeRow`, `OffRow`, `OtherSide`, `SkelRow`, `NScreen`, `Group`.
- `n-stickers.js` — the four v2 service stickers as data URIs, only so the standalone file works offline. In the app, use `assets/service-icons/v2/*.svg`.
- `n-screens.jsx` — sample feed (`CF` customer, `RF` rider), every frame, and the `LiveFeed` prototype.
- `kit/` — copies of the Rider v2 kits it builds on, unchanged: `sc2-kit.jsx` (Ic, Notice), `as-kit.jsx` (AFrame, SmBtn, GBtn, AToast, IconDisc), `rv-kit.jsx` (RStatus, Lbl).
- `CLAUDE-CODE-PROMPT.md` — the build prompt for `app/notifications/`.

## Frames
| id | state |
|---|---|
| N1 / N1b | Customer, populated / scrolled (Today · Yesterday · Mon 28 Sep; parcel + restaurant + shop + pharmacy rows) |
| N1c | Live SOS pinned above the day groups |
| N2 | One order opened inline to its timeline |
| N5 | Needs you: See offer · Review swap · Try again |
| N3 / N3b | Rider, account paused (pinned) / account restored |
| N4a / N4b | Dual role on the Customer side / on the Rider side |
| N6a / N6b | Notifications off (J8 row), customer / rider copy |
| N7a / N7b | Swipe mid-gesture / removed + Undo toast |
| N8a / N8b | Empty, customer (Send a parcel) / rider (no action) |
| N9 / N9b | Loading skeleton / slow connection after 6 s |
| N10 / N10b | Couldn't load (nothing cached) / couldn't refresh (cached feed kept) |

## Row anatomy
- Card: white, 1 px `--line`, radius 16, on a `--surface` page. Rows are separated by 1 px `--line`. Padding 12, gap 12.
- **Disc** 40 px.
  - **Order and job rows** use the v2 service sticker (`assets/service-icons/v2/` send · restaurants · shops · pharmacy) at 72% size, on its tile tint (`--tile-mint` · `--tile-peach` · `--tile-lilac` · `--tile-pharmacy`), the same as the Order flow v2.1 venue disc. The tone rides on an 18 px mark at the bottom-right (2 px white ring): good = `--cta-fill` + white check, needs you = `--danger` + white "!", danger = `--danger-ink` + white "!". An order in progress (neutral) has no mark.
  - **Account, money and safety rows** use a Lucide icon (Banknote, IdCard, ShieldCheck, Siren, Ban) on a disc filled with the tone.
- **Unread** = 10 px `--highlight` dot with a 2 px white ring at the disc's top-right, plus a 700 title and an ink line and time. Read = 600 title, muted line.
- **Title** 15/20, one line, ellipsis. Orders: "Parcel to <drop-off area>" or the venue name. Rider jobs: "<pickup> → <drop-off>". Account/safety rows: the event itself.
- **Line** 13/18 = the latest update. It wraps and is never truncated.
- **Time** 12, tabular, right-aligned: now · 2 min · 1 hr · Yesterday · 28 Sep.
- **Bead line** (only when an order has had more than one update): 44 px tall. One 6 px `--illus-idle-mid` dot per earlier update (max 5), then "4 earlier updates" and a chevron. Tapping it expands the row.
- **Expanded**: a vertical step track, latest first. Dots: 10 px `--accent-text` with a 3 px `--accent-wash` ring for the latest step, 8 px `--accent` for the rest. Connector 2 px `--line`. Label 13 and clock time 12. Footer: "Hide updates" (muted) on the left, "Open order" / "Open job" (green-text) on the right, both 44 px.
- **Action** (needs-you rows only): SmBtn fill, 44 px, under the line.
- Tapping anywhere else on the row opens the order, job or account screen.

## Tones (existing tokens only)
On order rows the tone is the corner mark; on every other row it is the disc fill.

| tone | disc / mark | used for |
|---|---|---|
| neutral | `--accent-wash` / `--accent-text` | in progress, cancelled, history |
| good | `--cta-fill` / white | delivered, verified, restored, resolved |
| money | `--tile-sun` / `--sun-ink` | wallet credited, top-up |
| needs you | white + 1.5 px `--danger` ring / `--danger` | new offer, item swapped, ID retry |
| danger | `--danger-wash` / `--danger-ink` | SOS, account paused, account blocked |

Gold (`--highlight`) is used only for unread. While a danger item is in force, it pins above the day groups in a card with a 1 px `--danger` border. Once it's lifted, it drops to neutral and moves into its day. A resolved SOS becomes a step in its order's timeline.

## Behaviour
- **Grouping**: group the rows by order id in the app (no API change). An order sits in the day of its latest update and moves to the top when it changes.
- **Read state**: opening the screen marks everything read on the server. The unread dots stay until the user leaves the screen.
- **Swipe**: works either way. The row follows the finger and fades (opacity 1 → 0.3), with a `--danger-wash` strip behind it showing Trash2 and "Remove". Releasing past 35% of the width removes it; anything less snaps back (220 ms). The toast "Notification removed" + Undo shows for 5 s, 16 px from the bottom.
- **Dual role (N4)**: the feed follows the side the user is on. Account and safety rows show on both sides. When the other side has something new, one quiet `--surface` row at the top says what's waiting and opens the C4/C5 switch sheet. Why: the two sides use the same words in different voices, the tab bar already shows the side, and tags would be noise for the many single-role users.
- **Notifications off**: the Rider v2 J8 warn row above the list. "Turn on" opens the phone settings. It never blocks the list.
- **Network**: show skeletons for up to 6 s, then add "Slow connection. Still loading…". If loading fails with a cached feed, keep the feed and show the stale notice. With no cache, show N10 with "Try again" (52 px).
- Targets ≥ 44 px, primary 52 px. Frames are 360 × 720, checked at 320 × 640 (page padding 12 under 340 px).

## Not on this screen (by rule)
No settings, filters, tabs, "Mark all read", badges, illustrations on rows or confetti.

## Outside the design
- **Server**: `notifications-feed.service.ts:410` skips every order that isn't a parcel. It has to include restaurant, shop and pharmacy orders, with row copy from `O.g.push`.
- Ledger entry in `docs/DESIGN-DEVIATIONS.md`. Retire `LJ.notifications` and `LJ.notif_empty`.
