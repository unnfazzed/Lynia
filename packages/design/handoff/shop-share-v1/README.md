# Handoff: Shop share links v1 (merchant, customer app, web app, lyniago.com), 2026-11-08

**Extends:** Browse v2 (S1/S2/S3/S4/S11/I3), Calm Mint v2 (C2/C4/C5), First Run v2 (PC1/PC8 shell), Merchant v2 + Shop front v1, Own bikers v1 (invite sheet), Empty States v2 (D-78), lyniago.com `site/`.
**Decisions:** DR1–DR16 and E1–E4 from `docs/plans/2026-11-07-shop-share-links.md` (copied here as `PROMPT.md`). They are not reopened.
**Fidelity:** high. Final colours, type, spacing and copy. **This README wins over the drawings.**

## Contents
- `CLAUDE-CODE-PROMPT.md`: paste into Claude Code. Build order, one PR per lane.
- `Shop share v1 - all screens.html`: every state. Every phone state is drawn at **360×720 and 320×640** side by side. `?s=0`…`?s=5` shows one section; `?screen=SH-M2` shows one frame; add `-320` for the small size (`?screen=SH-M2-320`).
- `copy.ts`: every string, one object `SH`. Ships verbatim.
- `ss-copy.js`, `ss-kit.js`, `ss-app.js`, `ss-merchant.js`, `ss-web.js`: what draws the frames. Design reference, not production code.
- `export-pngs.mjs.txt`: writes a 2× PNG of every state to `screens/` (Playwright). Rename to `export-pngs.mjs` after export (kept as `.txt` so the design-system bundler skips it), then see the file header.
- `DESIGN-DEVIATIONS-entry.md`: the D-129 ledger draft.
- `assets/`: Inter + Fredoka, the LyniaGo mark, sample food photos (stand-ins for merchant uploads).

New elements are unmarked by default. **Show what’s new** (top right, or `?marks=1`) outlines them in dashed violet with a NEW tag. That is an annotation, not UI.

Rebuild with the apps' own components (`StoreCover` discs, `CompactBar`, `Sheet`, `EmptyState`, `Toast`, the merchant `AppBar` and sheet, the website Worker's HTML). Take values and copy from here; don't port the markup.

---
## 1. Screens and states
| Id | State | Built on |
|---|---|---|
| **Merchant** | | |
| SH-M1 | Shop front, live: **Share your shop** row | Shop front v1 "Restaurant filled" |
| SH-M1b | Shop front, not live: **no row** (DR6) | Shop front v1 "Shop filled · not live yet" |
| SH-M2 | Share sheet: preview · Share on WhatsApp · Copy link · Show QR · link text | OB-M6 invite sheet structure |
| SH-M3 | Link copied: row shows "Copied", toast | OB-M6 copied |
| SH-M4 | QR for your counter, full screen | new |
| SH-M4p | The saved / printed card (A6) | new |
| SH-M5 | Owner with several branches: branch picker, preview names the branch | new |
| SH-M6 | 45-character name (sheet + Shop front) | — |
| **Customer share button** | | |
| SH-C1 / C1L | Restaurant cover with Back · Search · **Share** / 45-character name | Browse v2 S1 |
| SH-C2 | Scrolled compact bar with Search · **Share** | S2 |
| SH-C3a/b/c | No-cover tint band (S11) · shop (S3) · pharmacy (S4) | S11, S3, S4 |
| SH-C4 | Android share menu over the store | system |
| **The way in** | | |
| SH-S1 / S1L | Phone screen with the chip / 45-character name | Calm Mint C2 |
| SH-S2 | Code screen with the chip | C4 |
| SH-S3 | Profile screen with the chip | C5 |
| SH-S4a / S4b | Location ask (PC1) / notifications ask (PC8) with the chip, full screen | First Run v2 shell |
| SH-S5 | Chip without a name: "Taking you to the shop" | — |
| SH-S6 | Web app on iPhone, phone screen with the chip | customer web app |
| **Arrival** | | |
| SH-A1 | Store skeleton while the link resolves | S13a skeleton |
| SH-A2 / A2L | No delivery address: "Set where to deliver" cell | S1 info strip |
| SH-A3 | Outside the delivery area: strip, + off | S1 |
| SH-A4 | Shop not available (unknown, not live, paused: one screen) | EmptyState |
| SH-A5 | Can't reach LyniaGo · Try again | EmptyState |
| SH-A6 | Cart at another shop → "Start a new cart?" naming both | I3 |
| SH-A7 / A7b | Biker taps a link / biker on an active job | Rider v2 board + sheet |
| SH-A8 | Closed shop from a link: closed row + Schedule | Empty States v2 S8 row |
| **Landing + preview** | | |
| SH-W1a / W1b | Android with Play: handing off / didn't open | new (website language) |
| SH-W2 | Android without Play | new |
| SH-W3 | iPhone | new |
| SH-W4 / W4b | Desktop 1440×900, QR / dead code | new |
| SH-W5 | Dead or not-live code: generic, names no shop | new |
| SH-W6 | No-photo shop: tint + initial | new |
| SH-W7a/b/c | og:image 1200×630: normal / no photo / generic | new |
| SH-W7d | The cards inside a chat | stand-in |

## 2. Navigation
**Merchant**
- Shop front → **Share your shop** row → share sheet (SH-M2). The row exists only while the shop is live (approved and not paused or suspended). When it goes not live, the row disappears; links already out show SH-A4 / SH-W5.
- **Share on WhatsApp** → `https://wa.me/?text=<encoded SH.merchant.waText>`. WhatsApp's own picker chooses chat, group or Status. No number is prefilled. If WhatsApp isn't installed, the same URL opens in the browser.
- **Copy link** → clipboard (`https://lyniago.com/s/<CODE>`), the row label becomes "Copied" with a check for 2 s, toast `toastCopied` for 2.5 s. The sheet stays open.
- **Show QR for your counter** → SH-M4 (full screen, close ✕ returns to the sheet). **Save to phone** writes the SH-M4p card as a PNG to the gallery (toast `qrSaved`); **Print** opens the system print dialog with the same card at A6.
- Several branches: the sheet opens on the branch the owner is viewing. The picker swaps preview, link, QR and WhatsApp text together. Staff see only their own branch, without the picker.
- Swipe down, scrim tap or system back closes the sheet.

**Customer app**
- Store **Share** disc (cover, tint band, compact bar) → `Share.share({ message: SH.customer.shareText, title: SH.customer.shareSubject })` with the full https link. Nothing else changes on the page.
- Link opened while signed in → `app/s/[code]` → SH-A1 at once → the store for that service (restaurant / shop / pharmacy screen). Back from a cold start goes to **Home**; Back from a warm start goes to where the user was.
- Link opened over a live-order screen: the store opens **on top**; Back returns to the order (DR9).
- Cart at another shop: nothing happens on arrival. The first **+** opens I3 naming both shops (SH-A6).
- Not found / not live / paused (one 404) → SH-A4. **Browse restaurants** → the B1 list (the 404 carries no service, so the pill is fixed). Back → Home. The pending code is cleared.
- No answer in **10 s**, or offline → SH-A5. **Try again** retries the same code (kept).
- Biker account → SH-A7 over the board. **Open as customer** → the existing role switch (`switch-to-customer.ts`), then the store. **Stay on jobs** closes the sheet; the code is dropped. On an active job → SH-A7b; **OK** closes, nothing switches.

**Signed out (Android app and web app)**
- The link skips C1 (and any intro) and opens C2 directly. The chip shows on C2, C4, C5 and the permission asks the flow shows before the store. After the last one → SH-A1 → store.
- The chip has **no Back** of its own and is not tappable. C2 has no Back (there's no C1 behind it); C4 keeps its Back to C2.
- iPhone: `app.lyniago.com/s/<CODE>` behaves the same (SH-S6). The **Add to Home Screen tip is held until after the first order** from a link (DR12).
- The pending code lives 7 days, is cleared on sign-out, and a Play-referrer code is used once per install (E3).

**lyniago.com/s/&lt;CODE&gt;** (DR4, E1)
- Android: the page renders, then within ~300 ms navigates to `intent://s/<CODE>#Intent;scheme=lynia;package=zw.co.lynia;S.browser_fallback_url=<Play URL with utm_medium=shop_share&utm_content=<CODE>>;end`. While that happens: SH-W1a. If the page is still visible after **3 s** (blocked, other browser): SH-W1b. **Open in LyniaGo** re-fires the intent. **Order on the web** → `app.lyniago.com/s/<CODE>`.
- Android without Play (UA heuristics, e.g. HMS devices): SH-W2. The intent is not fired. **Have Google Play? Open in LyniaGo** fires it (covers wrong guesses).
- iPhone: SH-W3. **Order on the web** → `app.lyniago.com/s/<CODE>`. **Help on WhatsApp** → `wa.me/263778831938`.
- Desktop: SH-W4. QR encodes the same `https://lyniago.com/s/<CODE>`. **Copy link** copies it.
- Dead code: SH-W5 / SH-W4b, same routing with the generic card. Primary "Open LyniaGo" opens the app / Play without a shop code; on iPhone "Go to LyniaGo" opens `app.lyniago.com`.
- Worker can't reach the API: render SH-W5 and still route (never a 5xx page).

## 3. Global rules
- Every new frame is checked at 360×720 and 320×640 (all drawn). Landing also at 1440×900.
- Targets ≥ `--target-min` 44; the one primary per screen is `--target-primary` 52. The landing's primary is 54 (the website's mobile `.btn`).
- Shop names wrap to **2 lines, then ellipsis** everywhere (store h1, chip, preview, sheet, landing, QR). Tested with *Mbuya's Traditional Kitchen & Grill Borrowdale Village* (SH-M6, C1L, S1L, A2L). The og:image name is 1 line (ellipsis) at 60/700.
- Honest data: no time, fee or distance without an address (SH-A2). Outside the area, only distance (SH-A3).
- Zero new shadows in the apps. Existing parts keep theirs (Shop front Change chip, pinned Save bar).
- Never red text on white. Green text is `#006630`. "Biker", never "rider". C5's heading reads "What should **bikers** call you?" (D-101 copy pass; only the word changes).
- Before sign-in, only a live shop's **name, logo and cover** are shown (DR16). The landing's line is therefore fixed copy (`SH.web.line`), not the merchant's own line.
- Accessibility: Share disc label `Share {shop}`. Chip is `role="status"`, `aria-live="polite"`, announced **once** per flow (first screen only) with `SH.chip.a11y`; on later screens it's plain text. QR has `aria-label` `qrA11y` and the link text always beside it. The link text is selectable.

## 4. Component spec (360 → 320)
**Share row (merchant, NEW).** List card: 1px `--line`, radius 16, min-height 72, padding 12 8 12 14. 40 `--accent-wash` disc with `share-2` 20 `--accent-text`. Title 15/700, sub 13/1.35 `--muted` (wraps; 3 lines at 320 is fine). Trailing 44 target with `chevron-right` 20 `--muted`. Whole row is the target. Sits between the intro line and WHAT CUSTOMERS SEE, 16 gap.

**Share sheet (merchant, NEW content in the merchant-v2 sheet).** Radius 20 top, handle 36×4, padding 12 16 16, gap 12. Order: title 20/700 · sub 14 `--muted` · [branch picker] · preview card · **Share on WhatsApp** 52 (`message-circle` 20) · list card (Copy link, Show QR) · link text.
- *Branch picker:* label 14/600; 3-column grid, gap 6, 44 pills radius 999, 14/700, ellipsis; selected `--ink` fill + white, others `--surface`. More than 3 branches → horizontal scroll, same pills. Help 13 `--muted`. At 320 with the picker showing, the sheet drops its sub line so the sheet top stays ≥ 24 from the screen top.
- *Preview card:* 1px `--line`, radius 16. Cover 3:1 (328×109; 288×96 at 320). Logo 56 with 3px white ring, left 14, overlapping 28. Text padding 32 14 12: name 17/700 (2 lines), "lyniago.com" 13 `--muted`. No photo → service tint + initial (as Browse v2).
- *List card:* rows 52, `copy` / `qr-code` 20 `--accent-text`, label 15/600. Copied: icon → `check`, trailing "Copied" 13/700 `--accent-text`.
- *Link text:* "Your link" 13 `--muted` + `lyniago.com/s/7KQ2MX` 14/600 monospace, `--ink`, selectable.
- *Toast:* first-run-v2 forest toast, **top 40** (over the scrim, so it never covers the sheet's rows).

**QR screen (SH-M4, NEW).** AppBar 52 with ✕ and "QR for your counter". Card: 1px `--line`, radius 24, padding 20 (16 at 320), centred, gap 14 (10). Logo 40 + name 17/700. QR **280** (232 at 320), 29 modules, quiet zone inside the white. "Scan to order" 26/700 (22). Link 16/600 mono (15). Pinned: Save to phone 52 (`download`) + Print 48 outline (`printer`, ink). Raise screen brightness to max while open, restore on close.
- *Reading distance:* on a phone the QR is ~45 mm wide, readable at ~0.5 m. **For 1 m, print**: SH-M4p is A6 (105×148 mm) with the QR at **75 mm**, plus the link and `qrSub`. Saved PNG is 1240×1748 (A6 at 300 dpi).
- QR: error correction **M**, encodes `https://lyniago.com/s/<CODE>?src=qr` (the `src` lets attribution tell counter scans from shares; the Worker ignores it for routing). No QR library exists in the repo yet (eng note).

**Share disc (customer, NEW third disc).** 44 white disc, `share-2` 20 `--ink`, same as Search. Right group: Search, Share, gap 8, inset 8 top / 10 sides. On the tint band (S11) the same discs. Compact bar: Back · name 17/700 (ellipsis) · Search 44 · Share 44, no gap change. All three services.

**Chip (NEW).** Inline-flex, min-height 44, radius 22, padding 6 14 6 6, `--accent-wash`, gap 10. Leading 32 logo (photo or tint + initial, no ring) or, with no name, a 32 white disc with `store` 16 `--accent-text`. Text: "Taking you to" 12 `--muted`, then the name 14/700 `--ink`, 2 lines max with ellipsis. Max width = content width. Placement: the first row under the status bar (where Back would be). C4: Back 44, then the chip in the same row. Permission asks: above the hero, 12 below the status bar; the hero shrinks to 200 (150 at 320) to keep the footer clear.

**No-address cell (SH-A2, NEW).** The info strip keeps the rating cell; the other three merge into one cell (grid 1fr 3fr), min 62: `map-pin` 20 `--accent-text`, "Set where to deliver" 15/700 `--accent-text`, "to see time and fee" 12 `--muted`, chevron 18. Whole cell is the target → the Calm Mint H5 address sheet (or PC1 if location was never asked). After an address is set, the strip fills in normally (or becomes SH-A3).

**Out-of-area strip (SH-A3, NEW).** Under the info strip (now 2 cells: rating · "24 km away"). `--surface`, radius 12, padding 12 14, column gap 8. `map-pin` 18 `--muted` + `outT` 14/600 (wraps). "Change address" soft pill 44, indented 28. All + discs and steppers removed; item sheets open read-only (as closed venues). Prices and photos stay.

**Arrival skeleton (SH-A1).** Browse v2 store skeleton: cover block 196, logo ring, three lines, info strip block 62, tab stubs, a rail of three 148 tiles. **Back is real**; Search and Share appear only once the store loads.

**Biker sheet (SH-A7, NEW).** Customer sheet (radius 24, grab, padding 8 16 20, gap 12). 56 `--accent-wash` disc with `store` 24. Title 20/700. Shop row: `--surface` radius 14, logo 40 + name 15/700 (2 lines). Body 14 `--muted`. Primary "Open as customer" 52; secondary 48 outline, ink "Stay on jobs". A7b: `bike` icon, `busyT`, `busyS`, one primary "OK".

**Landing (NEW, website tokens).** Chrome stays the browser's.
- Nav 64, white, 1px `#EEF0F2` bottom, logo only (mark 30 + "LyniaGo" Fredoka 600 22). No links, no download button (DR14).
- Body `--g` with the hero's blobs: yellow 220 at right −90 / top −70, coral 120 at left −50 / bottom −30, pink 16.
- Card: white, radius 28, margin 24 20 (20 at 320). Cover 3:1 of the card width (320×107; 280×93). Logo 84 with 4px white ring, left 20, overlapping 42. Padding 12 20 20. Name 30/700 (26 at 320), −0.035em, 2 lines. Line 15 `--mut`. Gap 18, then [status line 14] · primary · secondary.
- Primary: the site's yellow `.btn` (`--yel`, ink text, 54, 600 16, 20 icon). Secondary: a 44 text link, 600 15 `--gd`, underlined.
- Status line: 14, centred; spinner 16 + `opening` in `--mut` (W1a), `stalled` in ink (W1b).
- No photo: the cover is the service tint (`#DDD5FF` shops, `#FFD9CC` restaurants, `#C5E9DF` pharmacy) with a yellow/coral/sky circle; logo is the kind tint + initial.
- Dead code: cover `--mint` with circles, the mark in the white logo disc, title `deadT` 24/700, line `deadS`.
- Desktop: container 1160, padding 64 32. Two white cards radius 40, gap 32 (1.25 : 1). Left: cover 200, logo 120 (6px ring), name 52/700, line 20. Right: QR 260, `scan` 32/700, `scanSub` 16, hairline, `orLink` 14, then a pill field (link mono 16/600 + ink "Copy link" 44). Nav has "Help on WhatsApp" on the right.
- `<title>` = `pageTitle`; `noindex` (each page is a share target, not a search page).

**og:image (NEW, 1200×630, `lyniago.com/s/<CODE>/card.jpg`).**
- Normal: cover 1200×400 (the 3:1 banner, full width), white below. Logo 168 with 8px white ring, centred, top 316. Name 60/700, −2px, centred, top 500, 1 line with ellipsis, 60 side margin. LyniaGo pill top-right: white, 64 tall, mark 40 + Fredoka 34.
- No photo: the service-tint band with yellow/coral/sky circles instead of the cover; logo = kind tint + initial.
- Generic (dead code, API down): `#00B14F`, yellow 520 circle top-right, coral 60 dot, white 168 disc with the mark, "LyniaGo" Fredoka 84 white. Names no shop.
- WhatsApp's small thumbnails crop the **centre 630×630**: logo always inside it; long names may crop there, and the title tag carries the name anyway.
- Tags: `og:title` = `og.title` (generic `genericTitle`), `og:description` = `og.desc` (generic `genericDesc`), `og:image:alt`, `og:image:width/height` 1200/630, `og:url`. JPEG q80, < 300 KB.

## 5. Tokens
No new tokens. Apps use Calm Mint v2 / merchant `tokens/colors.css`; the landing and cards use the website's `:root` (`--g --gd --gx --mint --ink --mut --yel --coral --sky --pink`).
| Token | Where |
|---|---|
| `--ink` #14181B | text, branch pill selected, QR modules |
| `--muted` #5B6670 | subs, "Taking you to", link label |
| `--line` #E2E6EA | cards, list rows, ghost buttons |
| `--surface` #F6F7F8 | out-of-area strip, branch pills, biker shop row |
| `--accent` #00B14F | spinner arc, toast check (fills/icons only) |
| `--accent-text` #006630 | share icon, Copied, Set where to deliver, links |
| `--accent-wash` #E9F8EF | chip, share-row disc, soft pills, biker disc |
| `--cta-fill` #00812F | Share on WhatsApp, Save to phone, primaries |
| `--forest` #063B22 | copied toast |
| `--highlight` #FFD23F | print card circle, EmptyState dot |
| `--skeleton` #EEF1F3 | SH-A1 |
| tile tints #FFD9CC / #DDD5FF / #C5E9DF | no-photo cover band (app, landing, og) |
| website `--yel` #FFD23F + `--ink` | landing primary |
| website `--gd` #006630 | landing secondary |
| website `--g` #00B14F | landing background, generic og |

Icons (Lucide, stroke 2): new to the apps: `share-2` (exists as `share` in the mobile `Icon` set), `copy`, `qr-code`, `download`, `printer`. Already used: `message-circle`, `store`, `map-pin`, `navigation`, `bell`, `clock`, `wifi-off`, `refresh-cw`, `bike`, `check`, `x`.

## 6. Where the brief and the handoffs disagree (resolved)
| Where | Conflict | Resolution |
|---|---|---|
| DR14 "one line" vs DR16 | The merchant's own line isn't public before sign-in | Landing uses fixed `SH.web.line` |
| DR5 "Browse <service>" vs the 404 | The resolver's 404 carries no service (R6) | Pill is always "Browse restaurants" |
| Calm Mint C5 | "What should riders call you?" | "bikers" (D-101) — only that word |
| Calm Mint C2 | Back 44 to C1 | No C1 on the link path, so the chip takes Back's row |
| First Run PC1 | A sheet over Home | On the link path there's no Home behind: the same content full screen (First Run shell) with the chip |
| First Run PC8 | Asked after the first order | SH-S4b applies only if `setup-permissions` still asks before the store; otherwise the chip never meets PC8 |
| OB-M6 copied toast | Bottom 24, over the sheet | Top 40, over the scrim: the share sheet's last rows stay visible |
| Prompt "QR reads from 1 m" | A phone screen can't do that for a 29-module code | Screen QR for close scans; print card at 75 mm for 1 m |

## 7. NEEDS BACKEND
- `Merchant.shareCode` (6 chars, referral alphabet, random, unique, per branch) and the live test `pilotEnabled && applicationStatus = live && !paused` exposed to the merchant app (row visibility).
- `GET /share/:code` (signed in) → `{ merchantId, service }` | 404 for unknown / not live / paused alike; throttled.
- `GET /share/:code/card` (public) → `{ name, logoThumb, coverThumb }` for live shops only; feeds the chip, the landing and `card.jpg`.
- Worker `/s/<CODE>` (HTML + UA routing + intent URL) and `/s/<CODE>/card.jpg` (stable proxy, edge-cached 1 day, DR10 fallbacks).
- Customer delivery-area check for the store (SH-A3 needs "this venue doesn't deliver to the selected address" plus the distance).
- Scheduling slots on the store for SH-A8 ("Schedule for {t}") — uses the existing scheduled-order flow where slots exist; hide the pill when none.
- QR PNG/A6 rendering in the merchant web app (no QR library yet).
- PostHog `shop_link_shared` (with `channel: whatsapp|copy|qr|system`), `shop_link_opened`, `shop_link_ordered`.

## 8. Retires
- Nothing visible is removed. Plan §5's "Home with a toast" for unknown codes is replaced by SH-A4 (DR5).
- The Calm Mint C1 → C2 path is skipped **only** when a shop code is pending.

## 9. Open items
1. Copy to approve: `SH.web.line`, `SH.arrival.goneS`, `SH.biker.s` ("Switch back in Account" assumes the role switch lives in Account), `SH.merchant.sheetS`.
2. `?src=qr` on the QR link is a suggestion for attribution; drop it if the Worker should see one URL shape only.
3. Android share sheet and the chat in SH-W7d are system / third-party stand-ins.
