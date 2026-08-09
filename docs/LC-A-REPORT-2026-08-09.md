# LC-A report — 2026-08-09 (size & data diet)

Lane A is in OPTIMIZE MODE (since `A-T5`, 2026-08-03b). Phase 0 found no in-flight `claude/lc-a*`
PR to babysit (the one open PR, #624, is the Sunday LC-steer's docs-only branch
`claude/lucid-rubin-4ldw0u`, not a Lane A firing) and `docs/KNOWN_BUGS.md`'s `LC-A09` row
confirmed still `OPEN → LC-A (A-O16)` with no sibling PR overlap. This firing takes the first
unchecked optimization item, **A-O16** — Google Places autocomplete/details prefix-cache (S/M
effort, an A-T4 finding).

## What shipped

`apps/mobile/src/api/places.ts`'s `autocompletePlaces`/`placeDetails` called Google directly on
every settled debounce pause with zero local memoization — a backspace-then-retype correction, the
same address searched twice in one order (pickup, then drop-off), or re-selecting a suggestion
after navigating back all paid for a fresh Google round trip even though the answer was already
known locally moments earlier.

Added a small `TtlLruCache<T>` (bounded 50 entries, LRU-evicted) local to `places.ts`:

- **Autocomplete** is keyed by the exact normalized (trimmed, lowercased) query text, TTL 2
  minutes — long enough to absorb a typing correction or a second address in the same order
  composition, short enough that a stale local answer can't linger across an app session.
- **Details** is keyed by `place_id`, TTL 10 minutes — a resolved place's coordinates don't move
  mid-order, and re-selecting the same suggestion is common enough to warrant a longer window.
- A failed/timed-out request (`getJson` returning `null` on abort/offline/non-OK) is **never**
  cached — only a real answer (including a genuine zero-result one) is memoized, so a transient
  network blip can't hide suggestions for the whole TTL window once the link recovers.

Deliberately NOT attempted: collapsing sequential *distinct*-prefix calls (the ledger's own "12" /
"12 Josiah" / "12 Josiah Tongogara" example) by reusing a shorter prefix's results client-side.
Google's autocomplete ranking isn't a strict superset/filter of a shorter prefix's result set (a
longer, more specific query can surface a place a shorter one didn't), so approximating it locally
would risk silently different suggestions for a real behavior change with no size upside worth
that risk. This fix targets the case that's actually safe to memoize: an **exact** repeat.

## Evidence

Real code path, mocked `fetch`, a realistic one-order composition (pickup address typed with one
backspace-correction then resolved, the same address re-searched and re-selected for the drop-off
leg — six requests structured exactly like the ledger's own cited pattern):

| Scenario | Network calls |
|---|---|
| Without the cache (`__resetPlacesCacheForTests()` before every step — today's pre-fix behavior) | 6 |
| With the cache (this PR's behavior, same six steps) | 4 |
| Saved | 2 (**−33%**) |

The 2 avoided calls are exactly the case this item names: the repeated drop-off search and the
re-selected suggestion. At the ledger's own ~1-2 KB/response estimate for a Places response, that's
~2-4 KB avoided in this one scenario alone, compounding with every further repeat inside the TTL
window (e.g. a customer who edits an address after a mis-tap, or composes several orders to the
same place in one sitting). No JS bundle-size impact (logic-only, no new deps/assets) —
`size-budget.json` untouched.

## Verification

8 new regression tests in `apps/mobile/src/api/__tests__/places.test.ts` (the module's first
dedicated test file — it was previously only exercised indirectly through a fully-mocked
`AddressSearch` component test):

- `autocompletePlaces`: exact-repeat query served from cache with no second fetch; a
  case/whitespace-normalized repeat (`"12 Josiah"` vs `"  12 JOSIAH  "`) still hits the same entry;
  a failed request is never cached, so a retry still hits the network; a genuine zero-result answer
  IS cached (not mistaken for a failure); a genuinely different query still fires a fresh call.
- `placeDetails`: repeat `place_id` lookup served from cache; a failed lookup is never cached;
  distinct `place_id`s stay independent.

Full monorepo `pnpm typecheck && pnpm lint && pnpm test`: all green.

- `@lynia/mobile` test: **128 suites / 910 tests** pass (902 prior + 8 new).
- `@lynia/api`/`@lynia/admin`/`@lynia/merchant`/`@lynia/shared`: unaffected (no diff outside
  `apps/mobile`).
- `oxlint` (root config): clean on the touched package; the one pre-existing unrelated
  `no-shadow` warning in `apps/api/src/admin/admin-orders.service.spec.ts` (noted in prior reports)
  is untouched by this PR.

## Budgets and doctrine

No JS bundle-size change — logic-only addition inside an existing module, no new dependency or
asset. `size-budget.json` untouched. Fully OTA-able (JS-only).

**Sensitive-lane doctrine:** not applicable — this diff touches only `apps/mobile/src/api/places.ts`
and its new test file, neither of which is under `apps/api/src/{wallet,settlements,offers,orders,
matching,kyc,riders}/` or `packages/shared/src/{policy,pricing,money}.ts`.

## Checklist status

Ticked `A-O16` in `docs/plans/2026-08-01-low-connectivity-program.md` §5 (Lane A optimization
checklist). Lane A's next unchecked item is `A-O10` (cold-start redundant config round trips, S).
Lane A does not self-disable this run — the checklist still has open items.

Superseded and replaces `docs/LC-A-REPORT-2026-08-04e.md` per the report-retention policy
(`docs/ROUTINES.md` — only the most recent report per lane stays on `main`).
