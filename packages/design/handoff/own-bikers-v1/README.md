# Handoff: Own bikers v1 (merchant, biker, admin), 2026-10-19

**Extends:** merchant-v2 (D-77) + shop-front-v1, merchant-mobile E2/E3, rider-v2 (D-54), tab-bar-v1, empty-states-v2 (D-78), first-run-v2, ui_kits/admin.
**Fidelity:** high. Final colours, type, spacing and copy, apart from the open items below.

## Contents
- `Own bikers v1 - all screens.html`: every frame, each tagged with `data-screen-label`. It opens one section at a time; use the chips at the top, or `?s=0`…`?s=9`, or `?s=all`.
- `copy.ts`: every string, keyed `OB.merchant` / `OB.biker` / `OB.admin`. New strings are marked `NEW`.
- `CLAUDE-CODE-PROMPT.md`: build order, split into merchant, biker and admin PRs.
- `ob-copy.js`, `ob-kit.js`, `ob-merchant.js`, `ob-biker.js`, `ob-admin.js`: what draws the frames. These are design references, not production code.
- `tokens/`: unchanged copies. **No new tokens.**
- `Own bikers v1 (standalone).html`: the same file, self-contained (fonts inlined), for offline use.
- `screens/`: a PNG of each of the 84 frames, numbered in page order. Reduced-scale previews; the HTML is the reference for exact sizes.
- `assets/fonts/`: Inter + Fredoka, so `tokens/fonts.css` resolves.

Rebuild everything with the apps' own components (AppBar, sheet, fields, Toast, EmptyState, JobCard, TabBar, the admin shell). Take values and copy from here; don't port the markup.

## Where the brief and the handoffs disagree (resolved)
| Where | Conflict | Resolution |
|---|---|---|
| merchant-v2 T3 | The Account row is "Preferred riders · 4" | Becomes "Own bikers" for fleets; removed for non-fleets |
| merchant-v2 S4 / K5 | "Book a rider", "Find a rider", "Delivery $3.20 · rider's" | New strings say biker. For Own-biker app orders K5 shows food + delivery |
| merchant-v2 K1b / T2 | Uses `--highlight-sun` / `--highlight-sun-ink`, which aren't tokens | `--highlight` + `--highlight-chip-ink` (same values) |
| merchant-v2 S4 | The Book card only exists on the shop board | Fleet kitchens get it in the same slot (open item 2) |
| rider-v2 board | Count "4 parcels near you", fare, Make an offer, demand line | Fleet board: "Chicken Inn jobs", no fare, no offer, no demand line |
| rider-v2 TabBar | Flat 60 px bar | tab-bar-v1 floating pill (72 reserve). The drawings use Lucide glyphs; the build uses the illustrated art |
| rider-v2 Money | Collected cash is green "+$X" (it was the biker's) | Fleet amounts are in ink: none of it belongs to the biker |
| ui_kits/admin | `.kpill.bad` / `.btn.danger` use `--danger` text on white or wash | `--danger-ink` on `--danger-wash` |
| Prompt rule 3 vs admin kit | 44 px everywhere vs the kit's 28–32 px desktop buttons | Brief wins: admin buttons, filters, fields and reason rows drawn at 44 px |
| empty-states-v2 vs BRIEF §5 | EmptyState primary is a 44 px soft pill; §5 makes "Invite a biker" a 52 px primary | OB-M4 keeps the soft pill (no filled CTA in empty states) at 52 px tall |
| tab-bar-v1 v1.4 | Glass bar, no shadow | Drawn as glass (72% `--bg`, blur); solid `--bg` fallback per v1.4 |
| empty-states-v2 info tone | Uses #7D8790 / #AEB6BD, which aren't tokens | `--muted` / `--line` (tokens only) |
| BRIEF OB-M2 / OB-M6 | SMS invites: "SMS not sent · Resend", Resend once per 24 h, "Invite sent to Kuda" | **Owner decision 2026-10-19: no SMS.** Invite = a link bound to the phone number, shared by the owner (WhatsApp / copy). SMS-failed row and cooldown removed; Resend → Share again; Expired → New link |
| BRIEF sample data | "4 bikers" vs "Chicken Inn's 6 bikers" (A3); "4 online" / "3 of your bikers online" vs a roster with 2 online; bill 28 Sep–4 Oct overdue while the week is running; $22.50 next to a −$1.50 credit; #B204 on two bikers | One data set across all three apps: Chicken Inn has **4 bikers** (Tendai on a job holding $14.00, Farai and Nyasha online, Blessing offline), so Book says **2 online** and admin says **4 bikers**. Strings with counts are templates. This week's bill (28 Sep–4 Oct, $34.50, due Fri) is Unpaid; the overdue one is last week's (21–27 Sep, $36.00, due Fri 2 Oct, 2 days overdue on both merchant and admin). #B190 was charged then credited, so Avondale nets 15 rides · $22.50. Biker app R4–R12 is **Tendai** (#B204 is his); R1–R3 are **Kuda**, the open invite. The phone booking is Nyasha's |

## Screen index (`data-screen-label`)
**Merchant · Account and roster (s=0):** OB-M1 Account · owner / paused / staff / nonfleet · OB-M2 Roster · owner · OB-M2 Roster · owner · scrolled · OB-M2 Roster · owner · 320 · OB-M2 Biker sheet · owner · OB-M2 Remove confirm · OB-M3 Roster · staff · OB-M4 Roster · first time · OB-M5 Preferred suggestions · OB-M7 First biker joined · OB-M7 Notifications · Farai joined
**Merchant · Invite sheet (s=1):** OB-M6 Invite · typing / getting link / link ready / link copied / already invited / couldn't get a link / no network
**Merchant · Book a biker (s=2):** OB-M8 Kitchen orders · Book card · OB-M8 Book · My bikers · OB-M8 Book · My bikers · 320 · OB-M8 Book · Any biker · OB-M8 Book · 0 online · OB-M8 Book · loading count · OB-M8 Book · can't reach · OB-M9 Ringing my bikers · OB-M10 None took it · OB-M11 Nobody online · OB-M12 Paused
**Merchant · Board, cash and money (s=3):** OB-M13 Board · fleet jobs · OB-M13 K5 · app order, Own biker · OB-M13 K5 · phone booking · OB-M14 Money · fleet rides · unpaid / overdue / paid / no fleet rides
**Merchant · States (s=4):** Roster · loading / couldn't load / offline · Fleet rides · loading / couldn't load / offline
**Biker · Joining (s=5):** OB-R1 Invite waiting for ID check · OB-R2 Join card · OB-R2 Join card · 320 · OB-R2 Push · OB-R3 Refused · shop staff / in another fleet / invite ended · OB-R3 Join · network
**Biker · Fleet board (s=6):** OB-R4 Fleet board · OB-R4 Fleet board · 320 · OB-R5 Fleet board · empty / loading / reconnecting / couldn't load · OB-R6 Paused
**Biker · Job (s=7):** OB-R7 Fleet job offer · OB-R7 Offer expired (F4) · OB-R8 Active · heading to Chicken Inn / heading to drop-off / return the cash · OB-R9 Done · return cash / nothing to return · OB-R11 Cancel sheet · fleet
**Biker · Money, account, leaving (s=8):** OB-R10 Money · fleet biker (+ 320) · OB-R12 Account · Chicken Inn bikers · OB-R12 Leave confirm · OB-R12 Leave · during a delivery · OB-R13 Public biker now
**Admin (s=9):** OB-A1 Fleets table · OB-A2 Side panel (+ adjust) · OB-A3 Pause confirm · OB-A3 Disable confirm · OB-A4 Overview tile · Fleets · loading / empty / error / offline

## Layout
- **Phones:** 360 × 720, checked at 320 × 640. Merchant: 52 AppBar, 16 edge, 12 between rows, 24 between groups, pinned bar 12/16/16 with `0 -4px 16px rgba(20,24,27,.06)`. Biker: rider-v2 MintTop, floating tab bar 60 tall, 12 from the edges; content pads 72 + 16 at the bottom.
- **Roster row** (from the E2 Team row): 40 avatar · name 15/600 (never truncated) · branch 13 `--muted` · chip row (gap 6, wraps) · cancels 13 `--muted` · chevron. Screen-reader order: name, state, cash, cancels, actions.
- **Invites are links, not SMS.** The owner enters phone + name; LyniaGo returns a link bound to that phone number (valid 7 days). The owner shares it: "Share on WhatsApp" (wa.me with the number and a prefilled message) or "Copy link" (system share from there). LyniaGo sends nothing itself, so there is no SMS-failed state and no resend cooldown.
- **Invite row:** dashed 40 avatar with `user-plus`; name or phone 15/600; "{state} · Shared 2d ago" where state is Link not opened yet / Signing up / Waiting for ID check; 44 px pills Share again (mint, reopens the same link) + Revoke (outline). Expired: muted "Link expired" with an outline "New link". Staff see the rows with no actions.
- **Book toggle:** T2 toggle anatomy on `--surface`, 44 tall, selected `--cta-fill`. Paused: My bikers shows `lock` in `--muted` and can't be selected.
- **Ringing / none took it / nobody online:** merchant-v2 bottom sheet over Book; Book stays mounted.
- **K5 cash card:** unchanged gold card; the split line is replaced by one 14/600 sentence.
- **Fleet bill card:** 1px `--line`, radius 16, `receipt` icon, state pill on the right. Overdue: `--danger-wash` fill, 1px `--danger`, `--danger-ink` text, plus "N days overdue" in words.

## New parts (the only two)
1. **Countdown bar** (OB-M9): 8 px track `--line`, fill `--accent`, radius 4; "1:24 left" 14/700 tabular beside it. `role="progressbar"` with the time as its label. The ringing line above it is `aria-live="polite"`.
2. **Roster state chip:** 24 tall pill, 12/600, 8 px dot + word. On a job: `--accent-wash` / `--accent-text`, `--accent` dot. Online: `--surface` / `--ink`, `--accent` dot. Offline: `--surface` / `--muted`, hollow dot. The **cash chip** uses the same anatomy: `--highlight` fill, `--ink` text, `banknote` 14.

## Tokens used
`--ink --muted --bg --surface --line --accent --accent-text --accent-wash --cta-fill --on-accent --danger --danger-wash --danger-ink --highlight --highlight-wash --highlight-ink --highlight-border --highlight-chip-ink --highlight-chip-wash --forest --on-forest-muted --rider-wash --rider-accent --tile-mint --tile-peach --coral-ink --shadow-card --shadow-sheet --shadow-float --shadow-menu --shadow-badge`. Inter 400/600/700, tabular numbers. Lucide, stroke 2. New icons: `user-plus`, `send`, `receipt`, `pause`, `ban`.

## Open items
1. Drafts settled (please approve): `m.staffLock`, `m.emptyT/emptyB`, `m.pausedB`, `b.refNet`, `b.leaveB`, and the OB-R13 copy (`b.pubB`, `pub1–3`).
2. Where the kitchen "Book a biker" card sits: drawn inside the mint top card under the KPI strip (same slot as S1). The alternative is the first card on the board.
3. Strings not in the brief that the frames needed (marked NEW): `m.removeCashB` (removing a biker who holds cash), the invite-link strings (`m.createLink`, `m.linkReady`, `m.linkSub`, `m.shareWa`, `m.copyLink`, `m.copied`, `m.phoneHelp`, `m.waText`, `m.shareAgain`, `m.newLink`, `m.invNotOpened`), `m.inviteExpired`, `m.ringingSub`, `m.noneTookB`, `m.noneOnlineB`, `m.billOverdueSub`, `b.ringsHint`, `b.collectDoorB`, `b.nothingReturnB`, `b.cashHeroB`, `b.joining`, and the admin reason codes.
4. OB-R13 no longer states a commission %; the rate comes from config (rider-v2 has a 0% variant).
5. Kitchen board top card: "Chicken Inn Avondale" + chevron wraps to two lines at 360 next to the Open pill. Allowed (names wrap, amounts never truncate); a shorter branch label is the alternative.
6. Admin sidebar keeps the kit's "Riders" item (existing, not a new string). Renaming to "Bikers" belongs to a kit-wide copy pass (D-101).
7. Backend: invite links need an endpoint that returns a phone-bound link (7-day expiry, revocable, same link on re-invite) and a deep link that opens sign-up with the number prefilled.
8. Staff Money: the brief doesn't say whether staff see FLEET RIDES. Drawn owner-only for the bill; rows are shown to both.

## DESIGN-DEVIATIONS entry
`2026-10-19 · Own bikers v1 · merchant: Own bikers row replaces Preferred riders (T3); roster + invite sheet (invite by shared link bound to the phone number, no SMS); Book gets My bikers | Any biker with no fare stepper on My bikers (S4), also for kitchens; K5 cash card shows food + delivery for Own-biker app orders. Biker: fleet variants of JobCard/pins, food offer, Done, Money hero and Cancel sheet with no fare, commission, top-up or strike; invite/Join/paused banners; public-biker sheet. Admin: Own bikers page. New parts: countdown bar, roster state chip. No new tokens.`
