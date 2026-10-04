# LyniaGo Merchant v2: handoff

**Contents:**
- `Merchant v2 - all screens.html`: a single offline file. Open it in any browser to see all 14 screens at 360×720, each with a short note on what changed.
- `MerchantV2.dc.html`: the source of that file. It reads tokens from `../../styles.css`.
- `BRIEF.md`: the product decisions. They are final, apart from the open questions listed at its end.
- `CLAUDE-CODE-PROMPT.md`: paste this into Claude Code.
- `tokens/`: the colour, type and spacing tokens the screens use.

This handoff follows the same visual language as `rider-v2-2026-10` and `order-flow-v2-2026-10`; read those first if you have them.

## Screens
| ID | Screen | Business |
|---|---|---|
| K1 | Orders board | Kitchen |
| K2 | New order rings (ready-in picker) | Kitchen |
| K3 | Cooking ticket (+5 min, Change items, Problem) | Kitchen |
| K4 | Hand over: 6-digit code, moves on by itself | Kitchen |
| K5 | On the way, then delivered, then cash back | All |
| S1 | Orders board: APP and BOOKED orders, Book a rider | Shop |
| S2 | Rings, with inline swap / remove / undo | Shop |
| S3 | Hand over checklist: seal → photo → code | Shop, pharmacy |
| S4 | Book a rider (one screen) | Shop |
| P1 | Rx check with checklist | Pharmacy |
| T1 | Menu / Inventory, plus the live bar | All |
| T2 | Money | All |
| T3 | Account | All |
| T4 | Closed | All |

## Navigation
- **Tabs:**
  - Kitchen: Orders · Menu · Money · Account
  - Shop and pharmacy: Orders · Inventory · Money · Account
- **From the board:** tapping a ringing order opens K2 or S2 full screen. Tapping a ticket opens K3, K4, S3 or K5 according to its step. Tapping "Book a rider" opens S4, then the Send v2 offers list, then K5.
- **Rx orders:** P1 comes before S2. Approving P1 continues into S2.

## Components and specs
These sizes are at 360 px width. At 320 px wide, keep the same sizes and let text wrap; never truncate amounts.

| Component | Spec |
|---|---|
| Mint top card | `--accent-wash` background, 18/16/14 padding, title 22/700 |
| Open pill | 44 h, radius 999, 32×20 switch plus a word label |
| KPI strip | white, radius 16, 3 cells with 1 px dividers, value 18/700 |
| Board card | 1 px `--line`, radius 16, 12/14 padding. A "Needs you" card gets a 2 px `--accent` border |
| Progress | 5 segments, 4 h, 4 gap, done = `--accent`, todo = `--line` |
| Ringing banner | `--cta-fill`, countdown 32/700, sheet overlaps the banner by 14 px, radius 20 |
| Ready-in chips | 44 h pills, selected = `--ink` fill |
| Code | 48/700, letter-spacing .08em, shown as `NNN NNN` |
| Cash card | `--highlight-wash` fill, `--highlight-border` border, `--highlight-ink` label |
| Live bar | `--live-bar` fill, 56 h, radius 16, floats 12 px above the tab bar |
| Tab bar | 64 h; active tab = 52×26 `--accent-wash` pill behind the icon, label 12/700 `--accent-text` |
| CTA bar | pinned, 12/16/16 padding; primary button 52 h, secondary button 48 h outline, both radius 999 |
| Touch targets | at least 44 px everywhere |

**Icons:** Lucide, 20 px in navigation and 16 px inline, stroke 2: inbox, utensils, package, wallet, user, bike, phone, camera, map-pin, volume-2, pencil, plus, minus, arrow-left-right, clock, power, search, zoom-in, shield-check, banknote, store.

## Needs backend
- `+5 min` on a ticket. It changes the ETA and moves the rider booking.
- Accept and send the substitution in one call; the customer's 3-minute approval timer runs on the server.
- Hand-over moves on by itself: push or websocket `order.handed_over` when the rider enters the code.
- Rx checklist results stored on the order, for the audit trail.
- "Open, but busy": adds 10 minutes to every ETA quoted until it is switched off.
- A late-cash flag on ledger rows and the rider's phone number on the Money tab.

## Keep / retire
- **Retire:**
  - the New / Cooking / Ready tabs;
  - the merchant's own "Hand over" button;
  - "Can't finish" (replaced by the Problem pill);
  - the two-step Book a rider flow;
  - the separate tracking, delivered and cash-back screens.
- **Keep:** reasons sheets, the Send v2 offer list, sign-in and onboarding, and the settings sub-screens (restyle only).
