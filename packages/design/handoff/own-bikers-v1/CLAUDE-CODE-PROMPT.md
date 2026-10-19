# Claude Code prompt: Own bikers v1

Read `handoff/own-bikers-v1/README.md` first, then open `Own bikers v1 - all screens.html`. Product rules are in `docs/designs/own-bikers.md` and the brief. Use `copy.ts` for every string, verbatim. **No new tokens.** Build with the apps' existing components; the HTML is a reference, not code to port.

Global rules: targets ≥ 44 (`--target-min`), one 52 primary per screen; money and times tabular; never red text on white; user-facing copy says "biker". Biker app: no Retry buttons, no pull-to-refresh.

## PR 1 · Merchant: Account + roster (OB-M1–M7)
1. T3: swap "Preferred riders" for "Own bikers" (fleet only), with the value / Paused chip / staff value. Remove the Preferred riders screen and route.
2. New pushed screen `OwnBikers`: owner list, staff read-only (lock strip), first-time EmptyState, suggestions card (dismiss persists server-side), first-joined mint banner.
3. Add the two new parts to the merchant kit: `RosterStateChip`, `CashChip`.
4. Biker sheet + remove confirm (destructive pattern).
5. Invite sheet from the Team invite sheet, with the D-116 phone picker. **No SMS:** "Get invite link" returns a phone-bound link; then Share on WhatsApp (wa.me + `waText`) or Copy link (toast). States: getting link / link ready / copied / already invited (same link) / couldn't get a link / no network. Roster invite rows: Share again + Revoke; expired → New link. Needs the invite-link endpoint and the sign-up deep link.
6. States: skeleton, Couldn't load (T14b), offline toast.

## PR 2 · Merchant: Book + board + money (OB-M8–M14)
1. Book: My bikers | Any biker toggle (default rule in BRIEF §3a OB-M8); My bikers hides the fare stepper; paused locks My bikers. Add the Book card to fleet kitchens.
2. Ringing sheet with the `CountdownBar` (new part), live region; none took it (after 3 rounds) → Any biker with the stepper prefilled; nobody online skips ringing.
3. Board: biker name on APP / BOOKED fleet jobs. K5: `cashBackApp` / `cashBackPhone`.
4. Money · This week: FLEET RIDES per branch, adjustment rows, owner-only bill card (Unpaid / Paid / Overdue), zero, loading, couldn't load, cached-week offline.

## PR 3 · Biker app (OB-R1–R13)
1. Invite banner (pre-KYC) and Join card (post-KYC) on the board; push; refusal messages inline; network toast.
2. Fleet board variant: count row, `Chicken Inn job` tag, distance pins, no fare / offer / demand line; cards are previews (not pressable) because fleet jobs ring; empty, loading, reconnecting, couldn't load (auto-retry text), paused.
3. Fleet offer (F1–F4 without fare and pay-kitchen tiles), active job cash lines, Done, Money hero (no Earnings / Commission / Top up), Cancel sheet without strike line.
4. Account row + Leave (blocked during a delivery); one-time "public biker" sheet when the fleet is turned off.
5. Grep the fleet code paths for fare, commission, top-up and strike UI: there must be none.

## PR 4 · Admin console (OB-A1–A4)
1. New sidebar page "Own bikers": fleets table with the sort rule and filters; side panel (fee, Pause/Unpause, Disable, weekly bills, Mark paid, Adjust with required reason + ride).
2. Pause / Disable confirms with reason codes, written to the audit log.
3. Overview tile. States: skeleton, empty, inline error with Try again, offline banner.
4. Use `--danger-ink` on `--danger-wash` for the danger pill and button (fixes the kit). Every control on this page is ≥ 44 px.
5. "Unpaid" and "Days overdue" count billed weeks only; a week is billed when it ends and due the following Friday. Days overdue must match the merchant's bill card.

Finish each PR with screenshots at 360 × 720, 320 × 640 and font scale 1.3 (admin 1440 × 900), and add the DESIGN-DEVIATIONS entry from the README in PR 1.
