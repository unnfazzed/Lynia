# LC-B report — 2026-08-04e (Go-class runtime perf)

Phase 0: `docs/plans/2026-08-01-low-connectivity-program.md` was present on `main`. Open PRs at
firing time: only `#581` (`release-please`'s automated release PR, unrelated to any lane). No
`claude/lc-b*` PR existed to babysit instead. `docs/KNOWN_BUGS.md` and the sibling `claude/*` PRs'
diffs were checked — nothing overlaps this firing's scope (there were no other lane PRs open at
all this firing).

All Lane B audit territory (B-D0, B-T1..B-T4) was already checked, so this firing ran in OPTIMIZE
MODE. The first unchecked item in checklist order is `B-O3` — already deprioritized (2026-08-02
steer #2) as blocked on on-device systrace/logcat profiling this environment doesn't have; still
true today, so it stays unchecked, unactioned. The next unchecked item is `B-O6` (native font
embedding).

## B-O6 — investigated, deliberately NOT landed

Started implementing this as scoped: add the `expo-font` config plugin so the three committed
Inter subsets (`apps/mobile/assets/fonts/Inter-*-subset.ttf`) embed natively, letting `RootLayout`
drop its `useFonts()`-gated splash hold (`app/_layout.tsx`) — real cold-start value if it works,
since font loading is the one first-frame-critical async step `B-T1`'s boot trace already
identified.

Before wiring the plugin, checked what family name the OS would actually resolve each file under —
`pip install fontTools` (not on PATH by default here) then read each asset's `name` table directly:

| file | internal Family (nameID 1) | internal Subfamily (nameID 2) |
|---|---|---|
| `Inter-400Regular-subset.ttf` | `Inter` | `Regular` |
| `Inter-600SemiBold-subset.ttf` | `Inter SemiBold` | `Regular` |
| `Inter-700Bold-subset.ttf` | `Inter` | `Bold` |

None of these match `apps/mobile/src/ui/fonts.ts`'s `fontFamilies` map
(`Inter_400Regular`/`Inter_600SemiBold`/`Inter_700Bold`), and 400/700 collide on the literal same
iOS family name (`"Inter"`, distinguished only by a subfamily CoreText doesn't reliably pick for a
custom-loaded font without OS-level style matching). The ONLY reason this works today is that
`expo-font`'s JS `Font.loadAsync` (what `useFonts()` calls) dynamically aliases whatever string key
you hand it to the loaded font data — completely decoupled from the file's own internal name table.
Native embedding gives that decoupling up: fetched `expo-font@13.0.4`'s actual plugin source
(`plugin/build/withFontsAndroid.js` / `withFontsIos.js` via unpkg, matching this app's installed
version) to confirm exactly how it resolves without the JS alias step — Android copies the asset by
its existing filename into `assets/fonts/` (RN's standard `assets/fonts/<name>.<ext>` resolution,
no renaming), iOS just lists filenames in `Info.plist`'s `UIAppFonts` and leaves the actual
`fontFamily`-to-font mapping to CoreText's internal name-table lookup. Neither path lets you supply
a custom family name in config — the plugin's `fonts` prop is a bare string array.

**Conclusion:** landing this as literally scoped ("add the config plugin") would have silently
broken Inter typography app-wide on iOS the moment `useFonts()` was removed to actually capture the
cold-start win — text falling back to the system font, with 400 and 700 weight fighting over one
family name — and there is no way to verify that in this environment: native builds are dormant
per §2 (blocked on a founder arming `EAS_RELEASE_ENABLED`), so neither an emulator nor a device is
reachable here to confirm a fix actually resolves correctly on a real font renderer. `typecheck`/
`lint`/`jest` cannot catch this class of bug at all — none of them render real native text.

Left the item unchecked with the concrete fix recipe (rename the three assets to match the
`fontFamilies` keys for Android's filename resolution + patch each file's `name` table via
`fontTools.ttLib` so Family/Full/PostScript match too, teach `scripts/subset-fonts.mjs` to
reproduce both on every regen, THEN add the plugin) written into the program doc so a future firing
with real native-build/device access doesn't have to re-derive this from scratch — matching this
lane's existing `B-O3` precedent for evidenced-but-blocked items rather than either landing
something unverifiable or leaving a bare "still blocked" note with no path forward.

## B-O10 — GET /restaurants cursor pagination (landed)

Moved to the next unchecked, actually-actionable item: `B-O10`, a `B-T3` finding that `GET
/restaurants` (`apps/api/src/merchant/merchant.service.ts`) was the one list endpoint in the app
with zero server-side cap (history/board/notifications are all already capped 30-50 rows).
`LC-B07` had already bounded the CLIENT memory cost with a `FlatList`; the DB query itself — and
the in-memory JS array backing it — stayed unbounded, a real cost as the corridor's merchant
catalog grows past a page. Fully JS+API, no native build or on-device profiling needed, so
verifiable end-to-end here.

**API** (`apps/api/src/merchant/merchant.service.ts`, `restaurants.controller.ts`): cursor
pagination mirroring `WalletService.getLedger`'s existing shape exactly — `RESTAURANTS_PAGE_SIZE =
20`, `orderBy: [{name:"asc"},{id:"asc"}]` (name isn't unique; `id` is the tiebreaker), `take:
PAGE_SIZE + 1` to detect `hasMore` without a second round trip, `cursor: {id}, skip: 1` to resume.
`RestaurantListResponse` gained an additive `nextCursor?: string` field (`packages/shared/src/
contracts.ts`) — an already-deployed client reading only `.restaurants` keeps working unchanged
against the new paginated server, matching this contract's own precedent for additive fields
(the `hours` field's comment: "Additive on the customer read API — C1 shipped this response
without it").

**Mobile** (`apps/mobile/src/query/use-restaurants.ts`): `useRestaurantListFeed` converted from a
flat `useQuery` to `useInfiniteQuery` (mirroring `useWalletLedger`'s pinned pattern), gaining
`hasMore`/`isLoadingMore`/`loadMore()` alongside its existing `restaurants`/`showingStale`/
`staleSavedAt`/warm-paint surface, which is unchanged for both callers.

**The subtlety this item's seed text didn't call out, and would have been a real regression to
miss:** both consumer screens read `feed.restaurants` for more than just "the visible list" —
`food/search.tsx` filters it CLIENT-SIDE for text search (there is no server-side search endpoint;
see that file's own header comment), and `food/index.tsx`'s "Open now" toggle filters it too.
Naively paginating the underlying feed while leaving those two filters reading only "whatever's
loaded so far" would have silently broken both once the catalog crosses one page — a restaurant on
page 2 would read as "no matches" in search, or never appear under "Open now," with no error and no
visible signal anything was wrong. Fixed by giving both screens an effect that auto-drains every
remaining page (`while hasMore && !isLoadingMore: loadMore()`, expressed as a `useEffect` re-firing
on `isLoadingMore` flipping back to false) the moment they actually need completeness — search: as
soon as a query is typed; index: as soon as "Open now" toggles on — while the plain, unfiltered
browse view (the common case) stays scroll-driven: `FlatList`'s `onEndReached` calls `loadMore()`
with a footer spinner while `isLoadingMore`, which is where the actual bandwidth/memory win lives.
Every individual DB query still stays bounded at `RESTAURANTS_PAGE_SIZE + 1` rows regardless of
which client behavior ends up triggering the pages — the server-side risk this item was actually
about is fixed either way.

**Regression tests** (all new, `pnpm typecheck && pnpm lint && pnpm test` all green repo-wide):
- `apps/api/src/merchant/merchant.service.spec.ts` — asserts the exact `orderBy`/`take` args
  reaching Prisma and that no `cursor`/`skip` is sent on the first page; `nextCursor` present +
  restaurants trimmed to the page size when more rows exist than the page size, absent when the
  catalog fits in one page; a given cursor passed through as `{id, skip: 1}`.
- `apps/mobile/src/query/__tests__/use-restaurants.test.tsx` (new) — first page loads with no
  cursor and exposes `hasMore`; `loadMore()` requests the next page with the prior page's cursor
  and ACCUMULATES restaurants (never replaces); `hasMore` goes false once the server stops
  returning a cursor. Mirrors `use-wallet.test.tsx`'s pinned `useInfiniteQuery` harness exactly.
- `apps/mobile/app/food/__tests__/index.test.tsx` — `onEndReached` calls `loadMore()` only when
  `hasMore`; footer spinner renders while `isLoadingMore`; toggling "Open now" on triggers the
  auto-drain effect.
- `apps/mobile/app/food/__tests__/search.test.tsx` — auto-drain fires once a query is typed (not
  while the box is empty), and stops once the catalog is exhausted (`hasMore: false`).

No `KNOWN_BUGS.md` ledger row — this is a pure capability/scale fix (correctness-intact at today's
pilot catalog size, which per `B-T3`'s own note hasn't yet crossed one page), matching this lane's
`B-O1`/`B-O2`/`B-O5`/`B-O16`-`B-O18` precedent of keeping that class of finding in the program-doc
checklist only.

## Next firing

`B-O10` is now ticked; `B-O6` stays unchecked with a concrete, evidenced fix recipe (see above and
the program doc entry) for whenever native-build/device access exists. Remaining unchecked
optimization items in checklist order: `B-O3` (blocked on hardware this environment doesn't have),
`B-O6` (blocked on native-build verification, recipe now written down), the struck-through `B-O4`,
`B-O13` (rider board `expiredOrderIds`/`takenOrderIds` Set eviction, `B-T3` finding, small/low-
priority per its own text), `B-O14` (merchant kitchen board `ackSecuredIds`/`ackHoldIds` Set
eviction, same shape, also low-priority), `B-O15` (delivery-code device index cap, small, trivial
`.slice(-N)` fix). `B-O13`/`B-O14`/`B-O15` are all fully JS-only and actionable in this environment
— unlike the last firing's assessment (`LC-B-REPORT-2026-08-04d.md` read the checklist as having
"no remaining item this environment can act on" once B-O3/B-O6 were blocked), `B-O10` turned out to
be landable despite its lower position in a prior steer's ranking, and the same is true of
`B-O13`/`B-O14`/`B-O15` for a future firing — worth flagging to the weekly steer that "environment
can't act on X" should be checked per-item, not inferred from the two blocked items at the top.
