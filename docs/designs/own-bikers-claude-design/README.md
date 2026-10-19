# Own bikers: Claude Design pack

Everything Claude Design needs to draw the Own bikers screens so they sit inside the current LyniaGo design.
The decisions behind it are in `docs/designs/own-bikers.md` (Design Review section, owner-approved 2026-10-19).

## How to use it
1. Open the LyniaGo design-system project in Claude Design (it is the same system as `packages/design/`; its
   skill is `packages/design/SKILL.md`). If the merchant-v2 and rider-v2 handoffs aren't in that project, upload the
   files listed under "Attach" below (or the zip made from them).
2. Upload `BRIEF.md` from this folder.
3. Paste `PROMPT.md` as the first message.
4. When Claude Design is done, export the handoff and commit it to `packages/design/handoff/own-bikers-v1/`
   with a `docs/DESIGN-DEVIATIONS.md` entry (the reverse-drift freeze needs it). Then the screens get built (T8 →
   lanes B/C/D).

## Attach (in this order; the first ones matter most)

| # | File (repo path) | Why Claude Design needs it | Take from it |
|---|------------------|----------------------------|--------------|
| 1 | `docs/designs/own-bikers-claude-design/BRIEF.md` | The work order: every screen, state and string | Everything |
| 2 | `packages/design/SKILL.md` + `packages/design/readme.md` | Brand ground rules | Tone, colours, type, icon rules |
| 3 | `packages/design/tokens/*.css` (colors, typography, spacing, icons, fonts) | The only allowed values | Every colour, size, radius, shadow. **No new tokens** |
| 4 | `packages/design/handoff/merchant-v2/BRIEF.md` | The merchant app's product rules; it wins over its drawings | Shell, board, Book (§7), cash card (§6), Money (§9), Account (§10) |
| 5 | `packages/design/handoff/merchant-v2/Merchant v2 - all screens.html` + `README.md` | The merchant screens being extended | K1/K1b board, S4 Book, K5 cash card, T2/T2b Money, T3 Account, sheets, info strips, 44 px rule |
| 6 | `packages/design/handoff/merchant-mobile/Merchant Prototype (standalone).html` + `README.md` | Team list and invite (E2/E3), which merchant-v2 did not redraw | Team rows, Owner/Staff pills, "Resend" pill, "+ Add someone" |
| 7 | `packages/design/handoff/shop-front-v1/README.md` + `Shop front v1 (standalone).html` | The newest merchant handoff: how a finished export looks | Loading, Couldn't load, Staff (read-only) patterns; export format |
| 8 | `packages/design/handoff/rider-v2/design/Rider v2 (standalone).html` + `README.md` | The biker app being extended | MintTop, BoardMap, JobCard, food offer F1–F4, active job A1–A13/B1–B6, X6 cancel sheet, Money M1–M12, Gates, Account |
| 9 | `packages/design/handoff/empty-states-v2-2026-10/README.md` + `Empty States Minimal v2.html` + `copy.ts` | The one EmptyState used everywhere in the mobile app | 64 mark in 88 halo, title, one line, at most one pill |
| 10 | `packages/design/handoff/tab-bar-v1/README.md` | The biker tab bar | Bottom reserve (72 + inset) |
| 11 | `packages/design/handoff/first-run-v2/README.md` + `design/First Run v2.html` | Full-screen sheet pattern for "You're a public biker now" | Sheet layout |
| 12 | `packages/design/ui_kits/admin/` (`index.html`, `riders.html`, `cash.html`, `admin.css`, `shell.js`, `README.md`) | The admin console's look | Table, side panel, confirm modal with reason code, skeleton/empty/offline states. **`cash.html` shows a retired weekly-15% model: keep its look, not its logic** |
| 13 | `docs/DESIGN.md` § Responsive & accessibility | Target sizes, contrast, labels | `--target-min` 44, `--target-primary` 52, icon + text |

## Rules Claude Design must follow (summary; BRIEF.md has the detail)
- **Extend, don't invent.** Every screen is built from parts merchant-v2 or rider-v2 already draw. New parts only
  where BRIEF.md lists them (a countdown bar and a roster state chip).
- **Frames 360 × 720, checked at 320 × 640** and font scale 1.3. Admin 1440 × 900.
- **Tokens only.** Lucide icons, stroke 2, always with a text label. Inter 400/600/700, tabular numbers for money.
- **Copy says "biker", never "rider"** (owner rule D-101). The older handoffs still say "rider"; new strings don't.
- **Biker app: no Retry buttons.** rider-v2 retries by itself and says so ("Trying again in 10 s"). Merchant and
  admin do use "Try again".
- **Never red text on white.** Danger = `--danger-wash` fill + `--danger-ink` text.
- **Targets drawn at size** (`minHeight`), ≥ 44, primary 52. Below-floor drawings are kit defects.

## What the export must contain (same shape as shop-front-v1)
- `README.md`: screen index by `data-screen-label`, layout, tokens used, open items, DESIGN-DEVIATIONS entry text.
- `Own bikers v1 - all screens.html` and `(standalone).html`.
- `screens/*.png` previews.
- `copy.ts`: every string, verbatim, keyed per surface (`OB.merchant`, `OB.biker`, `OB.admin`), new strings marked `NEW`.
- `CLAUDE-CODE-PROMPT.md`: the build order split into PRs (merchant, biker, admin).
- `tokens/`: unchanged copies.
