# Prompt for Claude Code — LyniaGo "After Send" order screen

Paste everything below into Claude Code from the root of the LyniaGo Expo/React Native repo, with this `design_handoff_after_send/` folder copied into the repo (e.g. `docs/design_handoff_after_send/`).

---

You are implementing the redesigned **order screen** a customer sees after tapping "Send to riders" in the LyniaGo Android app (Expo / React Native, cash-only parcel marketplace in Harare).

## Read first, in this order
1. `docs/design_handoff_after_send/README.md`: the full spec. Measurements, tokens, copy, behaviour, navigation and state. Treat it as the source of truth for UI.
2. `docs/design_handoff_after_send/BRIEF.md`: product decisions. These are final; don't reopen them.
3. `docs/design_handoff_after_send/screens/*.png`: 2× renders of every state. Match them.
4. `docs/design_handoff_after_send/design/as-kit.jsx` and `as-screens.jsx`: the HTML reference implementation. Lift exact values and the **`A` copy object** from here. **Do not copy this code into the app**: it's React-DOM with inline styles. Rebuild with the app's RN primitives.
5. Open `design/After Send (standalone).html` in a browser if you need to see a state live.

## Before writing code
- Explore the repo and report back briefly:
  - where the current order/tracking/auction screens live;
  - the navigation setup (stack names, the deep-link config);
  - the map library;
  - whether a bottom-sheet library exists (e.g. `@gorhom/bottom-sheet`);
  - the theme/token file;
  - the icon component;
  - where Send v2's Header / CTA bar / Btn / Notice / Toast components are;
  - the order API client and realtime (socket/poll) layer.
- **Reuse Send v2 components** (Header, CTA bar, Btn, Notice, Toast, MapPin). Don't duplicate them.
- Use only the existing theme tokens listed in the README. If one is missing, add it to the theme file rather than hard-coding the hex.
- List any API fields from the README "State" section that the backend doesn't return yet. Stub them behind a typed adapter with sample data so the UI can be built, and leave a `// TODO(backend):` comment at each stub.

## Build
1. **Copy**: create `src/features/order/copy.ts` exporting the `A` object verbatim from `as-kit.jsx`, typed with `as const`. Dynamic parts (names, prices, minutes, times, codes) become small formatter functions. Keep the wording exactly; for example, "+$0.64 over your price. Choose to accept $4.00." becomes `over(diff, price)`.
2. **Route**: one `OrderScreen` at `/order/:id`. "Send to riders" must `navigation.replace` into it. Add deep links for push notifications. Implement the Back order exactly as in the README (close panel → collapse sheet → Home) for both the header Back and Android hardware back (`BackHandler`).
3. **Layout shell**:
   - status bar;
   - Header (Back, per-stage title from the README table, red Help button on live trips);
   - a full-bleed map behind the sheet;
   - a bottom sheet with the per-stage peek heights from the README table and a full snap leaving a 96 px map strip;
   - an optional pinned CTA bar.
   
   Sheet content scrolls and never goes under the CTA bar.
4. **Map**: green dot pickup, red square drop-off, 5 px `--accent` route.
   - Build the **new rider marker**: a 34 px ink disc with a white bike icon and a name pill. Add the paused variant and the dotted line to pickup.
   - Add the finding rings, static under reduced motion.
   - Fit bounds per stage, with padding equal to the sheet height.
5. **Components** (one file each under `src/features/order/components/`): Countdown + progress, OfferCard, StepTrack, RiderCard, CodeCard, CodeBig, GoogleMapsRow, PickupPhotoRow, Tags, Stars, Receipt, IconDisc, OfflineBanner, HelpPanel, plus the CancelPanel and CancelRequest confirm. Follow the README measurements exactly (44 px small buttons, 52 px CTAs, type sizes and weights, radii, borders).
6. **Stage resolver**: a pure function `resolveStage(order, offers, riderPos, now, online)`. It returns one of: finding, noRiders, offers, toPickup, toDropoff, handoff, retryNoMatch, retryRiderCancelled, delivered, completed, undelivered, cancelled. It also returns the flags gpsPaused and offline. Unit-test it.
7. **Sheets per stage**: compose the components exactly as in README "States" 1–19 and the PNGs. Each stage is a small component; `OrderScreen` switches on the stage.
8. **Behaviour**: implement every item in README "Interactions & behaviour":
   - +$0.50 in place, optimistic, without resetting the timer;
   - offer insert animation;
   - Choose with the 409 → select-race toast;
   - inline cancel-request confirm;
   - cancel before/after pickup;
   - 60 s GPS-paused rule;
   - NetInfo offline banner;
   - one-tap retry that re-posts and stays on this screen;
   - Edit order → Send step 4 prefilled;
   - rating with the tag-set switch at ≤2 stars, Skip, and 10 s Undo;
   - phone masking after the trip;
   - Share code / Share receipt / Share trip through the RN Share API;
   - WhatsApp via `https://wa.me/<number>`;
   - Google Maps intent.
9. **Transitions**: 250 ms ease-out cross-fade of the title and sheet content between stages, with sheet height animation and map re-fit. Turn them all off when reduce motion is on (`AccessibilityInfo.isReduceMotionEnabled`).
10. **Remove** the old pieces listed in README "Removed vs today's screens": the order-id title, status pills, the vertical timeline, sort chips, the separate counter card with Decline, Expand/Recenter, the Re-issue code button, separate failure screens, and the gold pin.

## Constraints (non-negotiable)
- Tap targets ≥ 44 px, primary CTA 52 px. Build them at size, not with hitSlop.
- Every icon has a visible text label.
- Cash only. No card or wallet UI.
- Inter only. Tabular numerals for money, the code, times and countdowns.
- Must work at 320×640 and 360×720 with the system font scale at 1.0 and 1.3. Text may wrap; nothing may overlap or truncate a button label.
- Low-end Android with patchy data: no heavy animations on the JS thread (use Reanimated), and throttle GPS updates to 1 per 2 s on the map.

## Done means
- Every state in `screens/` can be reproduced. Add a dev-only route `/dev/order-states` that renders `OrderScreen` with fixture data for each of the 24 states (ids 1, 1b, 2, 3, 4, 5, 6, 7, 8, 9, 10a, 10b, 11, 12, 13, 14a, 14b, 15, 16, 17, 18a, 18b, 18c, 19) so design can compare them side by side.
- `resolveStage` is unit-tested for every status / flag combination.
- Back behaviour is verified on Android hardware back for: a panel open, the sheet at full, a live stage, and an end state.
- All strings come from `copy.ts`, with no inline literals in components.
- Finish with a short summary listing any backend stubs left (README "Needs backend") and any place you had to deviate from the spec, and why.
