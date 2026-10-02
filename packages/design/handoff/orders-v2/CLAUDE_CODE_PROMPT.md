# Prompt for Claude Code: implement Orders v2

Paste the prompt below into Claude Code from the repo root, with this folder copied to `packages/design/handoff/orders-v2/`.

---

Implement the **Orders v2** redesign of the customer Orders tab. The spec is in `packages/design/handoff/orders-v2/`. Read `README.md` in full first, then `BRIEF.md`, `copy.ts` and `types.ts`. The pixel reference is `design/Orders v2.html?screen=<id>` (ids O1–O22). `design/o-kit.js` holds the exact CSS values for every component. These HTML files are design references: recreate them with the app's existing React Native components, theme tokens and data hooks, and don't port the HTML.

**Do, in order:**
1. **Copy:** add `src/ui/orders/copy.ts` from `copy.ts`, verbatim. No string in the tab may be hard-coded outside it.
2. **Tokens:** confirm the Calm Mint v2 tokens exist in the theme (forest, highlight, highlight-ink, star-stroke, coral, sky, tile-send/-food/-shops, skeleton). Add none beyond those.
3. **Components** in `src/ui/orders/`, each matching README §4 at 360 and 320 and at font scale 1.3:
   - `OrdersHeader` (reuse the Home mint header and circles; title + bell + search)
   - `OrdersSearchBar` (focused compact header with Cancel/Clear)
   - `NowSection` + `NowCard` (reuse the Home live bar's progress and ETA chip)
   - `NowStrip`
   - `ServiceChips`
   - `DayLabel`
   - `HistoryRow` + `OutcomeTag` + `Stars`
   - `PagingFooter` (loading / end / failed)
   - `OfflineBanner`, `OrdersEmptyCard`, `OrdersSkeleton`
4. **Screen:** rebuild `app/(tabs)/orders.tsx` as a single `FlatList`/`SectionList`.
   - Order: header → banner → Now → chips → day sections → footer, with a 16px bottom pad above the 60px tab bar.
   - Implement every state in README §3 using the screen-choice logic in §6.
5. **Data:**
   - Map the current order statuses to `NowStage` / `Outcome` (types.ts, README §4 tables).
   - Refresh on focus, every 30 s while visible, on reconnect and on resume. No pull-to-refresh and no Refresh button.
   - Keep a saved copy with its `savedAt` and paint it on a cold start.
   - Add cursor paging that falls back to the current 50-item endpoint until `/orders/history?cursor` exists.
   - Search and filtering per README §5.
   - Wherever a NEEDS BACKEND field (README §9) is missing, use the documented fallback and leave a `// NEEDS BACKEND (orders-v2)` comment.
6. **Navigation:** the Now card and the history row open the existing order screen (After Send v2 / food order screen). The Home live bar opens this tab when 2+ orders are running.
7. **Account:** remove the customer-side **Trip history** row and its route (Rider v2 C13). Keep the rider's Job history.
8. **Housekeeping:**
   - Add `docs/DESIGN-DEVIATIONS.md` entry **D-56**: Orders v2 supersedes `RC orders`, `RC orders_empty` and Rider v2 C13.
   - Add a CLAUDE.md line: "The Orders tab follows its own handoff (`handoff/orders-v2/`)". Amend the Rider v2 line so `app/history/index.tsx`'s customer side is no longer a rider-v2 surface.
   - Update the `tools/parity` targets to the O-ids. `tools/parity/mobile/fixtures/orders_review_mixed.mjs` should now render like O6/O7.

**Hard rules:**
- Targets ≥ 44 (primary 52); tabular numerals; never red text on white; brand green is never used as text; zero shadows.
- Errors appear once and go (an ink toast, 4 s). Background failures stay silent.
- No inline actions on history rows.

**Done when:** every O-id matches its single-screen reference at 360×720 and 320×640 (and O1, O2, O6, O16, O19 at font scale 1.3), the parity fixtures pass, and no hard-coded strings remain in the tab.
