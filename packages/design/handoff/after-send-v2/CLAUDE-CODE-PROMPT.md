# Prompt for Claude Code — LyniaGo "After Send" v2 (corrections + missing states)

Paste everything below the line into Claude Code from the root of the LyniaGo Expo/React Native repo. First copy this `design_handoff_after_send_v2/` folder into the repo as `docs/design_handoff_after_send_v2/`.

---

You are updating the **order screen** (`/order/:id`) in the LyniaGo Android app. It's the one screen a customer sees after "Send to riders": a full-bleed map, the Send-flow header (‹ Back · title · red Help on live trips), and a bottom sheet whose content follows the order stage.

**v1 is implemented and shipping.** This is a delta: fix what v1 got wrong for the real product, then add the states it never drew. Keep everything else as it is.

## Read first, in this order
1. `docs/design_handoff_after_send_v2/README.md` — **the v2 spec and changelog.** It covers the per-state changes, peek table, new states, share/push copy and gallery mapping. It wins over everything else.
2. `PROMPT-v2.md` — the design brief this answers (Parts 1–3). Use it to check nothing is missed.
3. `BRIEF.md` — product decisions. Final; don't reopen them.
4. `v1/README-v1.md` — the v1 spec. It still applies wherever the v2 README doesn't change it (tokens, components, interactions, navigation).
5. `design/After Send v2 (standalone).html` — open it in a browser. It has every state at 360×720, key states at 320×640, the font-scale 1.3 frames, decisions and copy per state. Cells are labelled **CHANGED** (redrawn vs v1) or **NEW** (2.x ids). **Match these frames.**
6. `design/as-kit.jsx`, `as-screens.jsx`, `as-v2.jsx` — the HTML reference. Lift exact values and the **`A` copy object** from here. Comments marked `v2` show what changed. **Don't port this code**: it's React-DOM with inline styles. Rebuild with the app's RN components.

## Before writing code
Report back briefly on:
- where v1's `OrderScreen`, stage resolver, `copy.ts` and order components live;
- the bottom-sheet implementation and how peek heights are set today;
- how the delivery code is fetched/typed (it must be a 6-character string, never a number — leading zeros);
- the realtime layer, NetInfo usage, and whether an offline cache of the order exists (needed for 2.4);
- the dev route `/dev/order-states` from v1;
- the All Screens Gallery registry (Part 3).

Then list every backend field or endpoint below that doesn't exist yet. Stub each one behind the typed adapter with `// TODO(backend):`.

## Part 1 — Corrections

### 1.1 Six-digit delivery code
- Type it as `string` with length 6. Display it as 3+3 groups ("418 290"): two `<Text>` runs with a gap, **not** a literal space in the value. Copy, share, accessibility label ("4 1 8 2 9 0") and every string use `418290`.
- **CodeCard** (states 6, 7, 9, 19, 2.4): label "DELIVERY CODE" 12/600 `--accent-text`; digits 28/800, tabular, letterSpacing ≈ 0.04em, 10 dp group gap. The white 44 dp "Share code" button stays on the same row. Measure with `onLayout`: if digits + button overflow the row, render Share code **under** the digits at full width. Don't branch on screen width. Digits use `maxFontSizeMultiplier={1.15}`.
- **CodeBig** (state 8): delete the per-digit boxes. Use one white panel, radius 12, 2 dp `--accent-text` border, 8 dp vertical padding, centred digits **56/800** (48 when the window is under 340 dp), group gap 20 (16 under 340). Set `maxFontSizeMultiplier={1}`.
- Update `shareMsg` and `deliveredSub` from `A`.

### 1.2 Grabber
- Make the grabber row 28 dp tall (was 16), with the visible bar still 36×4 `--line`.
- The hit area is **120×44**: the 28 dp row plus 16 dp above the sheet's top edge. Build it as a real 44 dp `Pressable` that sticks out above the sheet, not with `hitSlop`.
- Tap toggles peek ↔ full; drag still works.
- Set `accessibilityRole="button"`, label `A.grabMore` / `A.grabLess`, and `accessibilityActions` for expand/collapse.
- Sheet content starts 12 dp lower than v1.

### 1.3 Peek heights
- Replace v1's fixed percentages with a **measured peek**: the bottom of the stage's first block + 16 dp. The first block per stage is in the README table.
- Never go below the README table's floor. Never leave the map shorter than 96 dp.
- Re-measure on stage change and on font-scale change.
- Verify at 320×640 with font scale 1.3 that the first block is fully above the CTA bar.

## Part 2 — States to build
Build every 2.x state in the README "New states" table, plus the v1 states marked CHANGED. Key points:

**Loading & errors**
- **2.1** Header with Back and no title. Map with no pins. Skeleton sheet, `A.loading`, no CTA.
- **2.2** Network error: Try again (primary) and Back to home.
- **2.3** 404/403: Back to home only.
- **2.4** Cold start offline with a cached order: render the cached stage. Show the ink banner `A.savedCopy` with the cache time. Hide the rider marker and ETA. Show `A.savedAt`. The code card still works. CTA: Try again.
- Add the cache: persist the last order payload per id, with a timestamp (MMKV/AsyncStorage).

**Finding / offers**
- **2.5 / 2.6** +$0.50 is optimistic **only after the server confirms**. While in flight, show a spinner in the button and leave the price unchanged. On failure, show the toast `A.raiseFail` with a Try again action; the price stays the same.
- **2.7** When the price is raised while offers are showing: put the success note directly under the price row, above the list, for 4 s, then collapse it. Recompute every over-price strip (`over(diff, price)`).
- **2.8** Notify me → plain text `A.notifyOn` with a check, no longer pressable. If push permission is denied or the request fails → `A.notifyFail`, also not pressable.
- **2.9** While Choose is in flight: spinner in that card's button; every other Choose, +$0.50 and Cancel request disabled. Under the card show `A.choosing`; after 5 s, `A.choosingSlow`. A 409 keeps v1's select-race toast (now `A.taken` with the actual name).
- **2.10** When the timer hits 0 with offers on screen, they stay choosable for **15 s**. Show an ink pill "Choose in 0:12" and the notice `A.timeUp`. If nothing is on screen → state 12. The server must reject offers after 0:00 and accept a choice within the grace window (`TODO(backend)` if missing).
- **2.11** OfferCard: photo or initials; "New · N trips"; names wrap (never truncate); `A.yourPriceTag` under the price when it equals the customer's price. The best-match tag works on any card, whichever the app's ranking puts first.

**Tracking**
- **2.12** Matched with no GPS fix: headline `A.noFix` plus `A.noFixSub`. No marker, no ETA. On the first fix → state 6. With no fix for 60 s → state 9.
- **2.13** RiderCard: no plate → "Bike" only; not verified → no tag; no photo → initials; name and plate wrap.
- **2.14** While the code is being issued: six grey bars, Share code disabled, `A.codeIssuing`. No Re-issue button.
- **2.15** No rider phone yet: Call and WhatsApp disabled, with `A.noPhone` under them.
- **2.16** New full-screen PhotoViewer route (modal): `--ink` background, "✕ Close" pill (44 dp, labelled), title, pinch-zoom image, caption `A.photoBy`. Android Back closes it.
- **2.17** Report a problem: a panel over the trip. Single-select chips rp1–rp5, optional multiline "Tell us more", "Send to our team" disabled until a type is picked. Then the thanks panel. POST to a report endpoint (`TODO(backend)` if missing).
- **2.18** Emergency: open the dialer **and** fire a safety-alert event in the background. When the app becomes active again (`AppState`), show the green note `A.sosSent` at the top of the sheet for the rest of the trip. Replace the Google Maps row with "Call 999 again".
- **2.19** Share my trip: RN `Share` with `A.shareTripMsg`, built by a formatter. Drop "(bike …)" when there's no plate. Change the help row subline to the new `A.shareTripSub`.

**Retry / cancel**
- **2.20 / state 13** Rider cancelled before pickup: the server has already reopened the order at the same price. This is now a **finding** state with a reason header (`A.riderCx`, `A.riderCxSub`), countdown, the current price and `A.fasterAt`. CTAs: **Raise to $3.86** (the same PATCH as +$0.50) / Cancel request. Map shows the finding rings, not dimmed. When that window closes → state 12. State 18b is now only for a rider cancel *after* pickup. Update `resolveStage`.
- **2.21** "Send again at $X" (12): spinner on the primary, Edit order disabled; on failure, toast `A.sendFail` + Try again.
- **2.22** Cancel order (10a/b) and Yes, cancel (1b): spinner on that button, the other button disabled; on failure, toast `A.cancelFail` + Try again, and the panel stays open.
- **2.23** Cancel reason chips start with **none selected**; tapping a selected chip clears it. Reason is optional.

**Delivered / completed**
- **2.24** If the rating submit fails after the 10 s undo window: return to the rate form with stars and tags kept, plus toast `A.rateFail` + Try again.
- **2.25** Trip complete, not rated: a "Rate Tendai" card with five 44 dp stars. A tap expands 14a's tags inline. Show it for 7 days after delivery (`TODO(backend)` for the window).
- **2.26 / 15 / 16** The rated line always shows the rating word: "You rated Tendai ★★★★ Good".
- **2.27** Receipt: one item per line, right-aligned; addresses wrap (remove the ellipsis); pickup time missing → `A.noTime`.
- **2.28** "Send again" on 16/17/18 opens Send step 2 with the "Copied from your order on {date}" banner (already in Send v2). State 12 stays one-tap.

**Not delivered / cancelled**
- **2.29** Map the rider reason enum → `nr1–nr4` and body → `nb1–nb4`. Tries: "1 try" / "N tries".
- **2.30** Cancelled by the customer with no reason: drop the Reason line.
- **2.31** Cancelled by LyniaGo: with an ops reason → "Reason: {text}" + `A.cxLyniaGeneric`; without one → `A.cxLyniaGeneric` only.

**Global**
- **2.32** Every state must work at 320×640 with font scale 1.3:
  - text wraps;
  - buttons grow (`minHeight`, not `height`);
  - button labels never truncate;
  - chips wrap as whole chips;
  - the header title ellipsises before Back/Help shrink;
  - step-track labels may wrap to 2 lines.
- **2.33** Home live-order bar: a 60 dp card with icon disc, one line (`barFinding … barRate`) and chevron, one per stage. It reopens `/order/:id`. Only this bar may show the code.
- **2.34** Push copy per stage change from `A.p*` (title + body). **Never put the delivery code in a push.** Every push deep-links to `/order/:id`. This is server-side copy; hand it to backend if push text is built there.

## Part 3 — Gallery
- Remove the old LJ order entries from the All Screens Gallery and register every v2 id (phones and boards) with fixture data. Use the README "Old → new" table for any references to old ids.
- Extend `/dev/order-states` to every v1 + 2.x id, with toggles for 320×640 and font scale 1.3.

## Copy
- Update `src/features/order/copy.ts` from the `A` object in `design/as-kit.jsx`. Copy every key **verbatim**: v2 additions are in the block marked `v2 additions`; changed v1 keys are `shareMsg`, `shareTripSub`, `riderCx`, `riderCxSub`, `deliveredSub` and `taken`.
- Dynamic parts become formatters (names, prices, times, codes, tries).
- No inline string literals in components.

## Constraints (unchanged)
- Tokens only: `--accent` for fills only, `--accent-text` for green text, `--accent-wash`, `--ink`, `--muted`, `--line`, `--bg`, `--surface`, `--danger`. Radius 12 / pill. 12 dp labels. **No new tokens.**
- Inter only; tabular numerals for money, the code, times and countdowns.
- Tap targets ≥ 44 dp and primary CTAs 52 dp, both built at size.
- Every icon has a visible text label. Cash only.
- Spinners respect reduced motion (slow them down; never remove them). Use Reanimated, not JS-thread animation.

## Done means
- Every frame in `After Send v2 (standalone).html` can be reproduced in `/dev/order-states`, including the 320×640 and 1.3 frames.
- `resolveStage` is unit-tested, including:
  - nofix;
  - issuing code;
  - saved/offline cold start;
  - the timer-grace window;
  - reopened-after-rider-cancel;
  - cancelled-after-pickup;
  - not-rated within/after 7 days.
- Font scale 1.3 at 320×640 is checked on a device or emulator for 3, 6, 8, 14a and 17: no overlap, no truncated button label or code.
- The grabber is reachable with TalkBack and expands/collapses.
- Finish with a short summary: backend stubs left, anything you couldn't match, and why.
