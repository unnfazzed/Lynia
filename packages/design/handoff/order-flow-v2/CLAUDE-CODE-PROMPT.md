# Claude Code prompt — LyniaGo Order flow v2.1 (Restaurants, Shops & Pharmacy)

Paste this whole file into Claude Code from the repo root, with this folder vendored at `packages/design/handoff/order-flow-v2/`.

---

## Your job
Implement the **Order flow v2.1** design across the three LyniaGo phones:
- the **customer** app (Expo / React Native): Review & place, the order screen, the door, Done and the endings;
- the **merchant** phone web app: ringing with substitution, tickets, hand-over with photo, tracking, cash back, Scheduled, Rx check;
- the **rider** app: deltas on top of Rider v2's food job.

Rebuild it in the app's own components, theme, navigation (expo-router), bottom-sheet and map libraries. **Don't port the prototype's HTML/JS.** Lift exact values and copy from it.

## Sources of truth, in order
1. `BRIEF.md` — the product decisions (final). If code and design disagree, BRIEF wins.
2. `code/copy.ts` — **every user-facing string**, final copy, as `O`. Use these strings verbatim; `{x}` placeholders go through `ofFmt()`. Don't invent or paraphrase copy. If a string is missing, add it to `copy.ts` in the same style and list it in your PR.
3. `code/tokens.ts` — colours, radii, type, targets, shadows, code lengths (exported as `ofColor`, `ofRadius`, `ofSpace`, `ofType`, `ofShadow`, `ofAlpha`, `ofTarget`, `ofCode`). **No new colour values.** Map them onto the existing theme tokens; don't create parallel ones.
4. `Order flow v2.1 - all screens.html` — every state at 360×720. Open it in a browser:
   - `?screen=T4` shows one state full-bleed;
   - `?w=320` renders every state at 320×640;
   - `?fs=1.3` renders every state at font scale 1.3.

   `order-flow-v2-1.html` is the same canvas as one offline file. **v2.1 = v2 + `of-polish.js`.** Where they differ, the polish layer is the final look.
5. `README.md` — the screen list, navigation, the component spec table (sizes at 360 and 320), the per-service table, the peek table, push rules, NEEDS BACKEND, and Keep/Retire.
6. `of-kit.js`, `of-polish.js`, `of-screens-*.js` — read these for exact markup, spacing and sizes per state. Kit functions are named after the components you'll build: `top`, `track`, `riderCard`, `codeCard`, `codeBig`, `venueRow`, `prep`, `summary`, `photoRow`, `door`, `receipt`, `rating`, `map`, and so on.
7. `PROMPT.md` — the original brief (current-state screenshots table, data model, product rules).

Need reference PNGs? Render them yourself (Playwright). Use a 360×720 viewport and `deviceScaleFactor: 2`, load `Order flow v2.1 - all screens.html?screen=<ID>`, and screenshot the `.ph` element. Put them under `design/screens/<ID>.png` and use them in visual review.

## Hard rules (fail the PR if broken)
- **Cash only.** Remove every wallet, card, EcoCash, InnBucks, mobile-money and "refund reference" string from customer views (`grep -ri "wallet\|mobile money\|ecocash\|innbucks" src app`).
- **Every code is 6 digits, shown 3+3.** That's the delivery code "418 290" and the pickup code "731 604". Copied or shared values have no space. Rider CodeBoxes are 6 at both stops. Push notifications never contain a code.
- **Targets:** ≥ 44 dp, and the one primary CTA is 52 dp, drawn with `minHeight`, not hit-slop. Every icon has a visible text label.
- **Never red text on white.** Problems use `dangerWash` + `dangerInk`. Green *text* is `accentText` #006630, never `accent`.
- **No pull-to-refresh, no Refresh buttons.** Use the socket plus refetch on AppState active. Only a failed *first* load shows "↻ Try again". Offline keeps the last state under an ink banner.
- **Errors are an ink toast for about 4 s.** No persistent red lines. Hints never block, except the cash rule, the code, the Rx photo and offline.
- **Honest data.** No ETA without a location fix. Show an ETA *range* until the rider collects, then one time. No star for an unrated venue.
- **Font scale:** text grows (sp). Buttons wrap rather than truncate. The code card caps at ×1.15 and the big code at ×1.0.
- **Bottom padding** on every scroll view = CTA bar height + 16 + the Android bottom inset. Nothing may sit under the bar.
- Order screens are **pushed over the tabs**, so there's no tab bar on them.

## Build order (one PR each; tick the README state ids each PR covers)
1. **Customer order screen on the After Send v2 shell — restaurants, no backend change.**
   - Extend `app/order/[id]` to render merchant orders. Header: ‹ Back · **venue name** · red Help. Full-bleed map from the first second.
   - **VenuePin** (new marker): a 48 dp disc in the tile colour, the service sticker, a white ring and a name pill. Drop pin = red square + "You". Before a rider: a dashed muted route with a white casing. Rider found: ink bike disc + green glow + a dotted line to the venue. Collected: solid accent route, 6 dp, with an 11 dp white casing.
   - Sheet order: stage title (21/800) → **ETA hero** (label 11.5/700 caps + 30/800 time; after collection, a highlight chip "~9 min" + "Arrives 12:47") → 4-step track in a surface panel (24 dp circles, current one pulses) → the stage block → the rest. Peek = bottom of the first block after the track + 16.
   - States: T1–T9, T11–T16, P1–P3 (DoorCard + CodeBig on forest), D1–D4. Derive the 4-step track from `merchantPhase`/`status` on the phone for now (see NEEDS BACKEND).
   - Retire `src/ui/food/*` views per README "Keep / redesign / merge / retire".
2. **Review & place.** Merge `app/food/cart.tsx` + `app/food/checkout.tsx` into one Review screen pushed from the cart bar (R1–R9).
   - White ReviewBlocks on a surface page. Inline − n + steppers. Deliver to ✎ opens Send v2's inline address card with the map.
   - When: segmented ASAP / Schedule. Pay is one fixed cash row. Breakdown card. "Place order · $16.50 cash" pinned.
   - Place → replace the route with `app/order/[id]` (Back goes Home).
3. **Merchant + rider deltas.**
   - Merchant: M1a, M3a/b, M4 (6-digit pickup code shown 3+3), M5 (4-step track + the "Cash back to you" row), M6a/b.
   - Rider: RD1 tags (SHOP #DDD5FF, PHARMACY #C5E9DF), RD2a 6-box pickup code, RD4a/b door mirror.
   - Fix the rider no-show wait copy 10 → **8 min**.
4. **Substitution, photos, scheduled (backend).**
   - Substitution: U1–U5 (merchant proposer + customer per-line SubCard, 3-minute window; a timeout declines swaps and removes those lines; a lower-only change is announced; any swap needs a yes).
   - Photos: RD2b–d sealed-bag tick + photo (shops/pharmacy required → M4b keeps Hand over disabled until it arrives), T8 photo row + viewer, RD4c/d door photo, P5, M5b.
   - Scheduled: R5a–c, T13, M1c, M7a/b.
5. **Shops & pharmacy** customer APIs, wired to the same screens (T3, T5a/b, R2a/b, P1s, G1/G2 per service).
6. **Rx behind its flag** (`rxEnabled`, default off): R8a/b, T5c, D5a/b, M8a/b, RD1d, RD3. With the flag off, none of it renders and the OTC notice stays.

## Components to build (names = README component table)
- New: VenuePin, StageTop (ETA hero), PrepBar (striped 6 dp), VenueRow, OrderSummary, SubCard, DoorCard, PhotoRow + PhotoViewer, Receipt, TwoRowRating, ReviewBlock, ScheduleSheet, RxBlock, RxCheck, ScheduledList, MerchantProposer, MerchantTrack, JobTag variants, TickRow, CameraStep.
- Reuse: AHeader, Sheet, Bar/GBtn/SmBtn (secondary buttons are now **surface-filled, no border**), StepTrack (restyled), RiderCard (52 avatar with a 2 dp accent ring, gold star), CodeCard (digit groups on white tiles), CodeBig (**forest panel, white 58/800 digits, accent border**), Toast, Rider v2 StopCard / CashSplit / CodeBoxes / numpad, merchant ringing takeover, ConfirmSheet, PrepRing, CashBackCard.
- Each new component gets a story or fixture rendering the exact states listed in README, with the sample data from `PROMPT.md` Part 2 §7 (Gava's Kitchen $16.50, Avondale Fresh $16.10 → $16.20, Avondale Pharmacy $6.80, Tendai M., codes 418 290 / 731 604, order #A1B2).

## NEEDS BACKEND (stub behind interfaces; don't fake data in production)
- Per-line substitution proposals + approvals (and for mid-prep edits), plus the "if out of stock" preference.
- Pickup photo on merchant orders, and the door-proof photo surfaced to the customer and merchant.
- Scheduled orders: slots API, ring-at-start, "order for when they open".
- Rx: Script entity, pharmacist role, Rx item flag, check/decline + reason.
- Venue rating and the merchant-order receipt.
- Shop/pharmacy catalogue + order APIs.
- A merchant-order step track on the customer socket.
- The owed balance after a cancel-after-pickup (D3f).

Until each one lands, hide the UI that depends on it (**not drawn ⇒ not rendered**). Never show placeholder numbers.

## Push
Use `O.g.push` (customer `c`, merchant `m`, rider `r`) as [title, body], one per stage change. Push never carries a code. Notification channel names stay as they are today.

## Repo bookkeeping (from PROMPT.md Part 4)
- Add a ledger entry in `docs/DESIGN-DEVIATIONS.md` (next free number) naming the superseded `RC.*` order/checkout ids and the app-only food views. Add a CLAUDE.md pointer like D-52…D-56.
- Parity: mark the `RC.*` order targets in `tools/parity/app-targets.mjs` + `codegen/adopted.mjs` as SUPERSEDED deferrals (D-55 pattern). Add `shoot-order-flow.mjs` that shoots the app states and pairs them with the prototype's `?screen=` renders.

## Definition of done (per PR)
- Every state id the PR claims matches its prototype frame at 360×720, 320×640 and font scale 1.3 (side-by-side screenshots in the PR description).
- Copy diff against `code/copy.ts` is empty. Token diff against `code/tokens.ts` is empty.
- TalkBack reads stage title → ETA → current step. Grabber: "Show more" / "Show less".
- `grep` for wallet/mobile-money strings returns nothing in customer views. No 4-digit code anywhere.
- Unit tests:
  - track derivation from `status` + `merchantPhase`;
  - ETA formatter (range vs single, no fix → none);
  - substitution totals (U2b: $16.10 → $8.20);
  - small-order fee (< $4.00 adds $1.00);
  - code grouping (3+3, copy without the space).

## Ask before you…
- add any screen, state, string or token not in this package;
- change a product rule from `BRIEF.md` (open questions there are **not** decided; implement the drawn default and flag it).
