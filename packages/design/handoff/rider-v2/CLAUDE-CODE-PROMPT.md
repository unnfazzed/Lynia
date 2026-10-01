# Prompt for Claude Code — LyniaGo Rider v2

How to use this file:
1. Copy this `design_handoff_rider_v2/` folder into the repo as `packages/design/handoff/rider-v2/`.
2. Paste **Phase 0** into Claude Code from the repo root.
3. Paste each later phase as its own session, in order. Every phase ends with a PR-sized diff and a short report.

---

## Shared context (paste with every phase)

You are implementing **Rider v2** in the LyniaGo Android app (Expo / React Native, expo-router). One app serves customers and riders. A rider is a customer who passed KYC. Riders carry **parcels** (customer posts, riders make one offer, the customer picks one) and **food** (auto-dispatched 60-second full-screen offer; behind `merchantDispatchAutoEnabled`, currently off).

**Read first, in this order:**
1. `packages/design/handoff/rider-v2/README.md`: **the spec.** It covers screens, components, measurements, state tables and rules, and it wins over everything else.
2. `BRIEF.md`: product decisions. They're final; don't reopen them. List the Open questions in your report and don't decide them.
3. `design/Rider v2 (standalone).html`: open it in a browser. The player rail has every state id (J1…S6), and the 320 × 640 toggle sits under the phone. **Match these frames.**
4. `design/rv-*.jsx`: the HTML reference. Lift exact values and the **`R` copy object** (`rv-kit.jsx`). **Don't port this code.** It's React-DOM with inline styles, so rebuild with the app's RN components, theme tokens, bottom-sheet and map libraries.
5. `PROMPT.md` Part 2: the current-state reference (existing files, rules, gallery ids).

**Hard constraints (all phases):**
- **Tokens only** (`--ink`, `--muted`, `--bg`, `--surface`, `--line`, `--accent` [fills only], `--accent-text`, `--accent-wash`, `--cta-fill`, `--highlight`, `--danger`, `--danger-wash`, `--danger-ink`, shadows, radius 12/16/pill). No new tokens. Never red text on white.
- Inter 400/600/700; tabular numerals for money, codes, times and distances.
- Tap targets ≥ 44 dp, the one primary CTA 52 dp, built at size (`minHeight`). Every icon has a visible text label.
- **Always online** (no shift toggle). **No pull-to-refresh, Refresh or Retry buttons.** One job at a time. Parcel cards have no countdown.
- Map: pickup = green dot, drop-off = red square, rider = 34 dp ink bike disc labelled "You".
- Credits are green "+$x.xx"; debits are ink "−$x.xx" (U+2212).
- 360 × 720 and 320 × 640 at font scale 1.0 and 1.3: nothing under a bar, labels wrap, no truncated button text.
- Copy: every user-facing string comes from `src/features/rider/copy.ts`, generated **verbatim** from `R` with dynamic parts as formatters. No inline string literals in components.
- For any backend field or endpoint that's missing, stub it behind a typed adapter with `// TODO(backend): …` and fixture data. Don't block on it.
- Use Reanimated for motion and respect reduced motion (slow spinners, don't remove them).

**Every phase ends with:**
- every state for that phase registered in `/dev/rider-states` (create it in Phase 0) with toggles for 320 × 640, font scale 1.3 and food on/off;
- unit tests for the resolvers touched;
- a report: what's done, the backend stubs left, anything you couldn't match and why.

---

## Phase 0 — Recon and scaffolding (no UI changes yet)
Report back on:
- Where these live:
  - `app/rider/(tabs)/index.tsx`, `money.tsx`, `account.tsx`, `app/rider/job.tsx`, `food-job.tsx`, `food-offer.tsx`, `documents.tsx`, `become.tsx`;
  - `app/wallet/top-up.tsx` + `src/ui/rider/TopUpFlow.tsx`;
  - `app/settings/index.tsx`;
  - the customer Account tab and the shared history screen.
- The After Send / Send v2 components already shipped (header, Sheet with the 28 dp grabber, CTA bar, StepTrack, Notice, Toast, Countdown, OfferCard, map markers). **Reuse them**: list which README components map to existing ones (♻ in the README) and which are new.
- The map library and marker API, the bottom-sheet library, the socket/realtime layer, NetInfo, MMKV/AsyncStorage, notification + alarm handling (full-screen intent), and the permissions helpers.
- How the gate reason, KYC status, commission balance/floor/rate, strikes and the feature flag reach the client today.
- The All Screens Gallery registry and the `tools/parity` targets for rider screens.

Then:
1. Create `src/features/rider/copy.ts` from `R` (verbatim), with formatter functions for names, money, km, minutes, times and counts.
2. Create a typed `riderApi` adapter with stubs (`TODO(backend)`) for:
   - demand zones; earnings (today/week/byDay/counts); standing (acceptance, rating, strikes, oldestClearsAt);
   - offer withdraw; fare band; active side (`customer` | `rider`);
   - kitchen cash-return confirmation; safety-alert event; top-up default number.
3. Create the `/dev/rider-states` route with the toggles.
4. List every stub in your report.

## Phase 1 — Shared rider components
Build in `src/ui/rider/` (or extend the shared kit), exactly per README "Shared components":

MintTop (with Conn, 18 dp greeting and no sun under 340 dp) · TabBar (rider + customer) · FoodHeader · FlowHeader + step bar · BoardMap (job pin, selected pin, busy zone, You) · JobCard (+ offer variant) · JTag · RSteps · StopCard · CashLine · CashSplit · ProblemLink · Gate · Row/Card · Seg · IdentityCard · Standing · MSheet · CodeInput (string, 3+3, error/locked) · LRow · Chips.

Register a component board in `/dev/rider-states` showing each one in every variant at 360 and 320.

## Phase 2 — Jobs board, Make an offer, gates (J1–J14, O1–O4, G1–G15)
- Rebuild `app/rider/(tabs)/index.tsx`: MintTop → BoardMap → Sheet (peek 50%, empty 44%, full) → TabBar.
  - Pins and cards map 1:1, selected in sync.
  - Nearest first; taken jobs leave instantly.
  - Demand line and busy zones come from `riderApi.demandZones`.
  - The food line shows only when the flag is on.
- Notifications-off warn row (J8) reads the OS permission on render and on resume.
- "Your offers" group plus **Withdraw** with a 5 s Undo (fire the API after the window).
- Picked → MSheet (J11) with the job ping; not chosen / taken / expired → toasts.
- Reconnecting + couldn't-load states auto-retry (10 s with backoff). **Delete every Retry/Refresh control.**
- New route `app/rider/offer/[jobId].tsx` (O1–O4):
  - route strip; asking line;
  - 56/700 tap-to-type fare with − / + $0.50 and the band bar;
  - ETA chips 5/10/15/20 (10 default);
  - one-offer notice; "Send offer · $x" + "Skip this job".
  - Fare is stored in integer cents, minimum $0.50.
- Gates: one `resolveGate()` with the README priority order. Render with `Gate` using the `GATES` table values (copy keys g*). Facts are live (the cooldown countdown, the top-up shortfall = floor − balance). The bridge ghost switches to the customer side. Unit-test `resolveGate` for every gate and for priority conflicts.

## Phase 3 — Active job, parcel + food, and exceptions (A1–A13, B1–B6, X1–X14)
- Merge `job.tsx` and `food-job.tsx` into one stage-driven screen (keep both routes as thin wrappers if deep links need them). JobShell = header (stage title + Help pill) + map + content-sized sheet + one primary.
- Stage resolver: parcel `toPickup → atPickup(verify) → toDrop → handoff → done`; food `toKitchen → atKitchen(upfront only) → toCustomer → handoff → returnCash(if owed) → done`. Unit-test it, including restored-after-restart, customer-cancelled and locked code.
- Pickup: checklist + photo. The photo is queued locally and uploads in the background; a failure **never** blocks (A6 shows "Photo saved").
- Delivery code: string input with the OS number pad (`oneTimeCode`), 5 attempts. Last try → `triesLast`. Locked → "Call Rudo to re-send" + auto-unlock when a new code arrives. It works offline (queued confirm).
- Cash always on screen: CashLine (parcel) / CashSplit (food).
- **Delete the stacked ghost exits.** Add the single Problem sheet (X1 after pickup / X2 before pickup), also opened by the Help pill:
  - Can't reach: 10-min timer persisted across restarts; calls/WhatsApps logged; Mark undelivered unlocks at 10:00.
  - Can't deliver: reason chips → Send → terminal X5.
  - Cancel (before pickup only): strike notice; at 2 of 3 strikes, the danger box + "Cancel and pause". Primary = Keep the job.
  - Drop (food, before hand-over).
  - Get help → WhatsApp / call + toast X14.
  - Report → existing report flow.
  - Emergency → confirm X13 → dialer + safety-alert event.
- Offline: calm notice → warn after 4 min; every action goes to an outbox. "Job restored" after a cold start.
- Done screen: earnings first, cash/commission rows, optional stars → Back to jobs.

## Phase 4 — Food offer (F1–F4)
- Full-screen route with no Back. Countdown from server `expiresAt`. Upfront variant with the two money tiles (they must be fully visible at peek at 320 × 640 @1.0).
- A looping alarm + full-screen intent when backgrounded or locked. It stops on accept, pass or expiry. Heavy haptic.
- Expired → F4 → Back to jobs. Passing or missing never touches standing.

## Phase 5 — Money + Top up (M1–M12, T1–T6)
- Rebuild `money.tsx`:
  - Earnings card first (Today | This week Seg, 40/700 total, job counts, week bar strip).
  - Then the balance card (normal / low / below floor / owes / 0% copy).
  - Then cash held (real YOURS/OWED values; one line when parcels-only).
  - Then history with chips (hidden when food is off), day groups, infinite scroll (**remove "Load older"**), and the pending top-up recovery notices.
- Top up: 4-step FlowHeader (Provider → Amount → Phone → Approve), defaults from Settings › Top-up number, 90 s wait, success/failed terminals.

## Phase 6 — Account (both sides), role switch, histories, Settings (C1–C13, S1–S6)
- **Rider Account**: tappable IdentityCard → Customer | Rider Seg (48 dp) → Standing card → rows Job history · Notifications · Help & support · Settings. Remove the Money, Bike & documents and Switch-to-customer rows.
- **Customer Account**: the sibling layout. A customer-only user sees the BecomeCard (none / in progress / review / failed) in the toggle's place; when verified, the toggle appears with the ok notice.
- **Switch**: Rider → Jobs. Customer → confirm sheet C4, or C5 during an active job (the job continues, a live-job bar shows on customer Home, and active-job pings still sound). Persist and sync `side`; the server stops dispatching to `side = customer`.
- **Job history** (rider jobs only, with fare and a weekly summary) and **Trip history** (customer orders only). Split the shared history screen.
- **Settings**: one screen, sections YOUR ACCOUNT → CUSTOMER → RIDER (riders only) → Sign out / Delete account last.
  - Job alerts: test ping / test alarm; off → danger box + Open phone settings.
  - Location: rider consequence copy.
  - Navigation app: Google Maps | Waze, used by Navigate.
  - Top-up number: provider + number, feeds Top up.
  - Bike & documents: moved here.
  - Permissions are read live from the OS. No Edit profile, no "coming soon".
- Bike & documents (S5) and Help & support (S6) per the README.

## Phase 7 — Gallery, parity, ledger
- In the All Screens Gallery, retire the superseded `RJM`/`RJ` entries (README "Keep / redesign / merge / retire" in the HTML + PROMPT §6) and register every Rider v2 id with fixtures.
- Update the `tools/parity` targets for `app/rider/**`, `app/wallet/top-up.tsx` and the rider half of `app/settings`.
- Add a `docs/DESIGN-DEVIATIONS.md` entry (next free D-number). It must say that Rider v2 supersedes the listed RJM/RJ screens, and that it **retires D-15, D-16, D-22, D-25 and D-26** (Account/Settings).
- Add a line to CLAUDE.md: "The rider app follows its own handoff (`handoff/rider-v2/`)."

## Done means
- Every frame in `Rider v2 (standalone).html` can be reproduced in `/dev/rider-states`, at 360 × 720 and 320 × 640, with food on and off.
- `resolveGate`, the active-job stage resolver and `resolveSide` are unit-tested.
- Checked on a device or emulator at 320 × 640 with font scale 1.3 for J1, O1, G14, F2, A1, A8, X1, M1, C1, S3: no overlap, nothing under a bar, no truncated button labels.
- There's no pull-to-refresh, Refresh/Retry button or Online/Offline toggle anywhere in `app/rider/**`.
- The final report lists the backend stubs left, the BRIEF open questions, and any deviation with its reason.
