# Handoff: Download QR popup + iPhone install tip, 15 Oct 2026

## Overview
Two pieces so `lyniago.com/download` can go live:

1. **Website, desktop only:** every "Download the app" button opens a small **QR popup**. The page and the `#app` card **do not change**. On phones and tablets the buttons go straight to `/download`.
2. **Customer web app (`app.lyniago.com`), iPhone only:** an **Add to Home Screen bottom sheet**, shown on `?install=1`, plus the states around it (small phone, dismissed, installed, App Store launched).

**The flow:** a desktop visitor clicks "Download the app" and the QR popup opens. They scan it with their phone, which opens `lyniago.com/download`. That page sends Android to Google Play and iPhone to `app.lyniago.com/?install=1`, where the install tip appears.

## About the design files
`Download QR and Install Tip.html` is a **design reference in HTML**, not production code. It's a pan/zoom canvas. The top row is the website (frame 1 = unchanged card, frame 2 = the popup open, frame 3 = phone, unchanged). The second row is the iPhone tip at 360×720 plus its states. It loads `../../styles.css` and `../../assets/…` from the design system, so open it from inside the design-system project.

## Fidelity
**High fidelity.** Colours, type, sizes, spacing and copy are final. Copy comes verbatim from `copy.ts`.

---

## 1. Website: QR popup (`lyniago.com`)

### Trigger
- The three existing buttons in `site/index.html`: header `.btn.b-g`, "Send in three steps" `.btn.b-ink`, and the `#app` card `.btn.b-yel`.
- Change their `href="#app"` to **`href="/download"`** (works with no JS, and on phones). Add `data-download` to each.
- JS: on click, **if** `matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches`, call `preventDefault()` and open the popup. Otherwise let the link navigate.
- No other markup, CSS or copy on the page changes. The `#app` card stays exactly as it is.

### Anatomy
```
┌──────────────── popup 440 wide, radius 32, white ─────────────┐
│█████████ green band 170 tall (#00B14F) + 3 blobs ████████ (✕) │  ✕ 44, white, top 14 right 14
│█████        ┌──────── QR card ────────┐ [Point. Scan. Go.]    │  sticker overlaps card top-right
│             │   QR 236×236            │                       │  card: padding 16, radius 28, rotate −3°
│             └─────────────────────────┘                       │
│                         24                                    │
│                Scan to get LyniaGo        26/700              │
│                         6                                     │
│       Point your phone's camera at the code.   16/400 muted   │
│                         28 (bottom padding)                   │
└───────────────────────────────────────────────────────────────┘
```

| Part | Spec |
|---|---|
| Scrim | fixed, inset 0, `rgba(20,24,27,.55)`, z above header |
| Popup | width **440** (max `calc(100vw − 48px)`), centred both ways, bg `--bg`, radius **32**, `overflow:hidden`, padding `0 32 28`, column, centred, shadow `0 40px 80px rgba(20,24,27,.35)` |
| Green band | absolute top 0, full width, **170** tall, bg `--accent #00B14F`, `overflow:hidden`. Blobs (circles): coral `#FF6B4A` 120 at left −30 / top −40; gold `#FFD23F` 160 at right −50 / top 30; pink `#FF8AC5` 36 at right 120 / top 18 |
| Close ✕ | **44×44**, radius 999, bg white, Lucide `x` 24 stroke 2 in `--ink`, absolute top 14 / right 14, above the band |
| QR card | margin-top **36**, bg white, radius **28**, padding **16**, `transform: rotate(-3deg)`, shadow `0 24px 48px rgba(6,59,34,.3)`, above the band |
| QR image | `assets/download-qr-2026-10.svg` (**new filename**, because assets are cached for a year), **236×236**, `alt` from copy. **Don't restyle the code itself:** square finders, dark modules on white, quiet zone and logo tile stay as they are. |
| Sticker | absolute top −22 / right −30 of the QR card, height **46**, padding `0 20`, radius 999, bg `--highlight-sun #FFD23F`, text Inter **17/700** `--highlight-sun-ink #3D3100`, `rotate(9deg)`, shadow `0 10px 20px rgba(6,59,34,.25)` |
| Title | Inter **26/700**, letter-spacing −0.025em, `--ink`, margin-top **24**. Give it an id and point `aria-labelledby` at it |
| Line | Inter **16/400**, `--muted #5B6670`, margin-top **6** |

### Behaviour
- `role="dialog" aria-modal="true" aria-labelledby="qr-title"`. On open, move focus to ✕. Keep Tab inside the popup. On close, return focus to the button that opened it.
- Close on ✕, **Esc**, or a click on the scrim. Lock body scroll while open.
- Motion: scrim fades 0 → 1 over 160ms. The popup goes opacity 0 → 1 and scale .96 → 1 over 200ms, `cubic-bezier(.2,.8,.2,1)`. With `prefers-reduced-motion: reduce`, it appears with no animation.
- No analytics or other side effects are needed (add an event later if wanted).
- If the viewport shrinks below 900 while the popup is open, keep it open (it fits down to 488px wide).

### Phone / tablet (frame 3)
No popup. The buttons navigate to `/download`. The page looks the same as today.

---

## 2. Customer web app: iPhone install tip

### When it shows
| Condition | Shows |
|---|---|
| iPhone or iPad **Safari**, **not** standalone, URL has `?install=1`, tip not dismissed | **Sheet** (`§2.1`, or `§2.2` below 360 wide) |
| Same, sheet dismissed earlier, pin row not dismissed | **Pin row** on Home (`§2.3`). `?install=1` does **not** reopen the sheet |
| Standalone (`navigator.standalone === true` or `matchMedia('(display-mode: standalone)')`) | **Nothing**, ever (`§2.4`) |
| Android, desktop, other iOS browsers | **Nothing** |
| `APP_STORE_URL` config is set + iPhone, not standalone | **Launched sheet** (`§2.5`) instead of `§2.1`, once (own dismiss key) |

- Storage keys (localStorage): `lyniago.installTip.dismissed`, `lyniago.installPin.dismissed`, `lyniago.appStoreTip.dismissed` (value `"1"`).
- After showing, strip `install=1` from the URL with `history.replaceState`, so a refresh or a shared link doesn't re-trigger it.
- The sheet sits over **Home**. Home renders normally underneath.

### 2.1 Sheet: first seen (360×720 and up)
```
scrim rgba(20,24,27,.5)
┌──────── sheet, radius 28 top corners ────────┐
│                ▬ handle 40×5                 │ padding 10 20 24, gap 14
│ [LyniaGo for iPhone · ETA: soon]       (✕)   │ gold chip · ✕ 44 surface
│ Our iPhone app is still on its bike.         │ 24/700
│ It's riding to the App Store. …              │ 15/1.45 muted
│  (✓)━━━━━━━(bike)──────────(3)               │ tracker
│ Packed     On the way    App Store           │
│ ┌ steps card (surface) ───────────────────┐  │
│ │ [①share] Tap Share / On iOS 26 …        │  │ rows ≥54, 1px dividers
│ │ [②plus]  Choose Add to Home Screen / …  │  │
│ │ [③check] Tap Add. Done. / …             │  │
│ └─────────────────────────────────────────┘  │
│ [            Got it, let's send            ] │ 52, --cta-fill
└──────────────────────────────────────────────┘
```

| Part | Spec |
|---|---|
| Scrim | `rgba(20,24,27,.5)`. Tapping it = dismiss |
| Sheet | bottom 0, full width, bg `--bg`, radius **28 28 0 0**, padding **10 20 24** (+ safe-area bottom), column gap **14** |
| Handle | 40×5, radius 3, `--line`, centred (decorative, drag-to-dismiss optional) |
| Header row | space-between. Chip: height 26, padding `0 10`, radius 999, bg `--highlight-sun`, text **13/700** `--highlight-sun-ink`. ✕: **44×44**, radius 999, bg `--surface`, Lucide `x` 24 `--ink`. Row margins `-2 -8 -6 0` so the ✕ hugs the corner |
| Title | **24/700**, line-height 1.15, letter-spacing −0.025em, `--ink`, `text-wrap: balance` |
| Body | **15/400**, line-height 1.45, `--muted` |
| Tracker | row: step · bar · step · bar · step. Step = column, gap 6, width 72, centred, label **12/600** (`--accent-text` for done/current, `--muted` for todo). Dot 28 circle: **done** bg `--accent-text #006630` + white Lucide `check` 16; **current** bg `--ink` + white Lucide `bike` 16 + `0 0 0 4px --highlight-sun` ring; **todo** bg `--surface`, 1px `--line` ring, number 12/600 `--muted`. Bar: flex 1, 4 tall, radius 2, `--line`, margin-bottom 20 (lines up with dot centres). Bar 1 = half filled (`linear-gradient(90deg, --accent-text 50%, --line 50%)`); bar 2 = `--line` |
| Steps card | bg `--surface`, radius 16, padding `4 14`. Rows: min-height **54**, gap 12, divider 1px `--line` between rows. Icon tile 40×40, radius 12, bg white, 1px `--line` ring, Lucide 24 stroke 2 `--accent-text`: `share`, `square-plus`, `check`. Number badge on each tile: 20×20 circle, `--accent-text`, white **11/700** (1, 2, 3), at top −6 / left −6, 2px white ring. Title **15/600** ink; sub **13/400** muted. Step 1's sub shows the `···` glyph in a mini keycap (min-width 26, height 22, radius 6, white, 1px `--line` ring, Lucide `ellipsis` 16) |
| Primary | height **52**, radius 999, full width, bg `--cta-fill #00812F`, label **16/600** white. Pressed `--cta-fill-pressed`. Action = dismiss |

Don't use Apple's logo or Safari UI. The icons are generic Lucide.

### 2.2 Sheet: small phone (width < 360, designed 320×640)
Same as §2.1 with: padding **8 16 18**, gap **12**; chip text = `sheetSmall.chip`; title **22**; body **14** with the shorter `sheetSmall.body`; **no tracker**; step rows min-height **50**, steps card padding `2 12`; step 2 and 3 have no sub line. Nothing may clip at 320×640.

### 2.3 Dismissed: pin row on Home
- Position: directly below the Home header (mint, with search), above the service tiles.
- Row: margin `16 20 0`, radius 16, bg `--accent-wash #E9F8EF`, padding `8 6 8 14`, gap 12, items centred. Lucide `square-plus` 24 `--accent-text`; label **14/600** ink (flex 1); text button "How" (44 tall, padding `0 10`, **15/600** `--accent-text`) reopens sheet §2.1; ✕ 44, transparent, Lucide `x` 24 `--muted`, which sets `lyniago.installPin.dismissed` and removes the row for good.

### 2.4 Already installed
Home only: no sheet, no pin row, no banner (frame "Already installed").

### 2.5 App Store launched (behind `APP_STORE_URL`)
Same sheet shell as §2.1. Header chip = soft badge: height 28, padding `0 8`, radius 999, bg `--accent-wash`, Lucide `check` 16 + "Delivered" **13/600** `--accent-text`. Title and body from `launched`. Tracker: all three dots done, both bars full `--accent-text`. No steps card. Primary 52 "Get it on the App Store" opens `APP_STORE_URL`. Below it, a text button 44 "Keep using the web app" (**15/600** `--accent-text`), which dismisses.

---

## 3. Where the code lives (verify, these are best guesses)
- Website: `handoff/lyniago-website/site/index.html`, which is shipped as-is. Buttons at the header (`.btn.b-g`), `#send .head` (`.btn.b-ink`) and `#app .txt` (`.btn.b-yel`). Add the popup markup at the end of `<body>` and its CSS in the existing `<style>`, plus a small inline `<script>`. **No new fonts, no frameworks.**
- `/download` redirect: if it doesn't exist yet, it must send Android UA → Google Play `zw.co.lynia`, iPhone/iPad → `https://app.lyniago.com/?install=1`, and anything else → `https://lyniago.com/#app`.
- Customer web app: the Home screen of the customer app's web build (`apps/mobile`, Expo web, if that's what serves `app.lyniago.com`). Put platform detection in one hook, `useInstallTip()`, returning `'sheet' | 'sheetSmall' | 'pin' | 'launched' | null`.

## 4. Tokens used
ink `#14181B` · muted `#5B6670` · bg `#FFFFFF` · surface `#F6F7F8` · line `#E2E6EA` · accent `#00B14F` (fills only) · accent-text `#006630` · accent-wash `#E9F8EF` · cta-fill `#00812F` / pressed `#006B27` · highlight-sun `#FFD23F` · highlight-sun-ink `#3D3100` · website blobs coral `#FF6B4A`, pink `#FF8AC5`.
Type: Inter 400/600/700 only. Radii: 999 pills, 32 popup, 28 sheet / QR card, 16 cards, 12 tiles. Touch targets ≥ 44, primary 52. Icons Lucide 24, stroke 2.

## 5. Review notes
- The QR card is tilted −3°, but the code inside is unchanged. **Scan it on a real Android and a real iPhone from the popup at 100% zoom before shipping.**
- No small white text on `#00B14F`. The popup's green band holds no text.
- No dates or numbers in the copy. "Biker", never "rider".
- Dropped from exploration (not to build): the full-screen tip, the top banner tip, the in-card QR redesign, the A6 counter card.

## Files
- `Download QR and Install Tip.html`: reference canvas
- `copy.ts`: every string, verbatim
- `site-assets/download-qr-2026-10.svg`: copy to `site/assets/download-qr-2026-10.svg`
- `lyniago-download-qr.svg`: the same code, used by the reference HTML
- `CLAUDE-CODE-PROMPT.md`: paste-ready implementation prompt
