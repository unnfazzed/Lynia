# LyniaGo: the system your frames must fit

This page is the short version. Values come from `resources/tokens/*.css`, and the tokens win if anything here disagrees.

## Feel

- "Grab-style clean utility." Light theme only. Solid fills, no gradients, almost no blur or shadow.
- Built for a cash market, cheap Android phones, bright sunlight and expensive data.
- Calm and honest. Every dead end offers a next step. Nothing decorative that moves.

## Colour: the rules people break

| Use | Token | Value |
|---|---|---|
| Brand green: fills, discs, map graphics only, **never text** | `--accent` | #00B14F |
| Green text and small icons | `--accent-text` | #006630 |
| Primary button fill (white label) | `--cta-fill` | #00812F |
| Mint wash: selected, soft pills, top cards | `--accent-wash` | #E9F8EF |
| Body text / secondary text | `--ink` / `--muted` | #14181B / #5B6670 |
| Sunken surface / hairline | `--surface` / `--line` | #F6F7F8 / #E2E6EA |
| Dark live bar, toasts | `--forest` | #063B22 |
| Gold: ETA chip, LATE chip, unread dot. Sparingly | `--highlight` / `--highlight-chip-ink` | #FFD23F / #3D3100 |
| Warn or money strip | `--highlight-wash` + `--highlight-border` + `--highlight-ink` | #FFFCF2 / #FFD23F66 / #6B5600 |
| Problem strip, **never red text on white** | `--danger-wash` + `--danger-ink` (+ 1px `--danger`) | #FAEDEB / #8F2418 / #C0392B |
| Rider identity | `--rider-accent` / `--rider-wash` | #4B2FBF / #ECE8FF |

Service tints (venue discs): food #FFD9CC, shops #DDD5FF, pharmacy #C5E9DF.

## Type

- Inter 400/600/700 only. Mocks that draw 800 render as 700.
- Scale: 28 (codes, totals) · 24 (h1) · 20 (sheet title) · 18 (card or empty title) · 16 (buttons, inputs) · 14 (body) · 12 (caption, label) · 10 (micro overline).
- Tabular figures on every number: money, times, countdowns, codes.

## Space, shape, targets

- 8pt scale: 4 · 8 · 12 · 16 · 24 · 32 · 48. Screen edge 16.
- Radii: input 12 · card 16 · sheet top 20–24 · pill 999 · tag 6.
- **Targets: at least 44 for every control (`--target-min`), 52 for the one primary CTA.** A mock smaller than this is a defect we can't ship.
- Cards use a 1px `--line` border, not shadows. Only sheets, map pins and toasts get a shadow.

## Components to reuse (don't invent new ones)

- **Primary CTA**: full-width 52 pill, `--cta-fill`, one per screen, pinned bar at the bottom.
- **Secondary**: 48 outline. **Destructive**: 52 `--danger` fill.
- **Soft pill**: 44, mint wash + `--accent-text`. **Call pill** (merchant): 44, tel: link.
- **Info strips** (radius 12): neutral / gold money / mint / red, as in the table above.
- **Empty and explaining states**: a 64 disc in an 88 halo, an 18/600 title, at most one 14 muted line, at most one 44 soft pill. No cards, no art.
- **Toast**: forest, radius 14, one line, about 2.5s.
- **Bottom sheet**: 36×4 grabber, 20/700 title, 14 muted sub.
- **Merchant**: the mint top card with a labelled open pill · the KPI strip · board cards (1px line, radius 16, a 2px `--accent` border when NEEDS YOU) · a 5-segment progress bar · the dark live bar.
- **Customer order screen**: a full-bleed map + stage sheet · rider card (photo, "Tendai M.", ★ 4.9 · 132 trips, plate, Call / WhatsApp 44) · codes **6 digits shown 3+3** ("418 290").

## Words

- Second person, sentence case. Uppercase only for tiny overlines (`NEEDS YOU`, `DELIVERY CODE`).
- One short sentence, two at most. Say what happened and what to do. No blame.
- Use " · " to join facts: "Open · until 22:00", "Not delivered · get the goods back".
- Money is `$3.50`, tabular. A missing value is dropped, never "$0.00" or "—".
- People are first name + last initial: "Blessing M.".
- Codes never appear in pushes. No emoji, ever. Icons always have a text label.
- Shops say "goods / packed / out of stock". Kitchens say "dishes / food is ready".

## Layout checks

- Draw at 360×720. Every frame must survive 320×640 and font scale 1.3.
- At 320: one column, text wraps, money is never truncated, actions stack rather than sitting side by side.
- Sheets max out at viewport − 24. Past that, the body scrolls and the CTA stays pinned.
