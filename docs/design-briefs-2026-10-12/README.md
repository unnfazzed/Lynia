# Design briefs · 14 screens waiting on a drawing (2026-10-12)

For the designer (Claude Design or a person). Each brief describes a real gap in the shipped apps
that we can't build until it is drawn. The rule is "not drawn means not built" (owner decision D6).

## How to use these briefs

1. Read `00-BRAND.md` once. It is the system every new frame must fit.
2. Each brief has four parts:
   - **Must**: hard constraints. These come from the data, the rules or user safety.
   - **Your call**: where we want your judgement. Layout, hierarchy, the exact words, and whether a state needs its own frame.
   - **Copy to start from**: real strings already in the app. Reuse them where they fit. New copy is short: one line, plain words.
   - **Draw**: the minimum set of frames.
3. Draw new frames **as variants of the existing screen** in its handoff, with the same frame size, ids and kit components. Don't redesign the screen around the variant.

## The briefs

| # | Brief | App | Extends | Priority |
|---|---|---|---|---|
| 01 | [Ended bookings on the board](01-merchant-ended-bookings.md) | Merchant | merchant-v2 S1 / K1b / K5c | High: up to $150 of goods with no trace |
| 02 | [You need an invite](02-merchant-need-invite.md) | Merchant | merchant-mobile A3 / A5 | Medium: duplicate businesses |
| 03 | [Rx check countdown](03-merchant-rx-countdown.md) | Merchant | merchant-v2 P1 | Medium |
| 04 | [Stay closed today](04-merchant-stay-closed.md) | Merchant | merchant-v2 T4 / K1 top card | Medium |
| 05 | [Open past midnight (question)](05-merchant-overnight-hours.md) | Merchant | merchant-mobile C5 | Low: say yes or no first |
| 06 | [Reach the rider after a late cancel](06-customer-cancel-after-pickup.md) | Customer | after-send-v2 18a / 17 | High: the parcel is with a stranger |
| 07 | [The venue's own note on D3b](07-customer-venue-note.md) | Customer | order-flow-v2 D3b | Low |
| 08 | [Your code changed](08-customer-code-changed.md) | Customer | after-send-v2 2.14 / CodeCard | Medium |
| 09 | [Remove a prescription page](09-customer-remove-rx-page.md) | Customer | order-flow-v2 R8b | Medium |
| 10 | [Before the ID check: tips and documents](10-rider-before-id-check.md) | Rider | first-run-v2 R1 | High: prevents automatic declines |
| 11 | [Under 18](11-rider-underage.md) | Rider | first-run-v2 F5 | Medium: today shows the wrong screen |
| 12 | [This ID is on another account](12-rider-duplicate-id.md) | Rider | first-run-v2 F5dup | High: honest number-changers dead-end |
| 13 | [Your ID expires soon](13-rider-id-expiry-reminder.md) | Rider | first-run-v2 F6 / rider board | Medium: riders go offline with no warning |
| 14 | [Tried too many times today](14-rider-daily-limit.md) | Rider | first-run-v2 F4a–d | Medium |

## What to send back

Export in the same shape as the existing handoffs, one folder per handoff touched (or one combined folder):

- `README.md`: one row per new frame (id, state, what changed), with specs for anything new.
- An HTML prototype or canvas that includes the new frames, at 360×720 plus 320×640 and font scale 1.3 where text wraps.
- `copy.ts`: every new string verbatim, keyed. Mark any changed string with `// was: …`.
- Screenshots `<ID>.png` if you can.
- **New ids follow each handoff's own scheme.** Suggestions are in each brief, but you pick.

Do not add tokens. If you need a value no token covers, say so in the README; don't invent one.

## Resources in this pack

The zip includes `resources/`:

- `tokens/`: the live CSS tokens.
- The prototypes the briefs extend:
  - `Merchant v2 - all screens.html`
  - `merchant-v2/BRIEF.md` and `README.md`
  - `merchant-mobile/README.md`
  - `After Send v2 (standalone).html` and `README.md`
- The order-flow screenshots the briefs cite: D3b, D5a, R8a, R8b, T1.

The full design library is in the repo under `packages/design/`. The gallery is `explorations/journey/All Screens Gallery.html`.
