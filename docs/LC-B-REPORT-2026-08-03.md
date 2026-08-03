# LC-B report — 2026-08-03 (Go-class runtime perf)

One LC-B increment today: **B-T3**, the list + memory audit (every list without virtualization,
every unbounded in-memory accumulation, image memory behavior on 1-2 GB devices). Two confirmed
defects fixed with regression tests (`LC-B07`, `LC-B08`), six pure-optimization findings appended
to the Lane B checklist (`B-O10`..`B-O15`), and a tooling misconfiguration (already known from
2026-08-02) reproduced and produced two more off-lane ledger rows.

## Tooling note: the lane-bug-hunt custom-lane bug recurred

This run originally tried to drive B-T3 through the `lane-bug-hunt` workflow with a custom lane
object scoped to lists/virtualization/memory (`{key, context, lenses}`). The workflow silently ran
the hardcoded **wallet & data-lifecycle** lane instead — the exact same tooling misconfiguration
already documented at `LC-B-SIB-1`/`LC-B-SIB-2` (2026-08-02). `resolveLane()` in the workflow
script looks correct on inspection (`if (a && typeof a === 'object' && a.lenses) return a`), so the
custom lane object is evidently not reaching the script as a live object across the tool-call
boundary in this environment — an infra-level bug outside this repo, not something a Lane B PR can
fix. The findings it surfaced (a wallet-receipt math mismatch and an admin-KPI/rider-earnings
orderType-scope gap) are real and adversarially verified, so they're ledgered as `LC-B-SIB-3` and
`LC-B-SIB-4` for Lane D / the wallet audit routine rather than discarded — not fixed here, out of
Lane B's runtime-perf mandate and both touch money paths needing the sensitive-lane treatment.

B-T3 itself was then run as a **linear audit**: three read-only Explore agents in parallel, one per
focus area (unvirtualized lists + map/marker memory; unbounded in-memory accumulation; image memory
behavior), each instructed to read the program doc's Lane B section and `docs/KNOWN_BUGS.md` first
so findings were genuinely new, then self-verified against the actual source before fixing anything.

## Fixed — LC-B07: unbounded restaurant catalog rendered via ScrollView + `.map()`

**Defect.** `GET /restaurants` (`apps/api/src/merchant/merchant.service.ts:313` `listRestaurants`)
is the one list-backing endpoint in the app with **zero server-side cap** — no `take`, no cursor —
unlike every other list in the app (order history capped at 50, the rider board capped at 50,
notifications capped at 30). The customer-facing browse screen (`apps/mobile/app/food/index.tsx`)
and its search variant (`apps/mobile/app/food/search.tsx`) both rendered that unbounded result
through a plain `ScrollView` + `.map()`, with each row (`RestaurantRow` → `FoodThumb`) eagerly
mounting a remote cover-photo `Image` with no windowing — so every matching restaurant's image
decodes and stays resident simultaneously, regardless of how large the corridor's merchant catalog
grows. At today's small pilot scale this is wasted memory, not a crash; but because the query has
no cap at all, this is the one list in the app that gets **strictly worse** as the business grows
rather than staying flat — a real OOM trajectory on a 1-2GB Go-class device.

**Fix.** Converted both screens from `ScrollView` + `.map()` to `FlatList` — this codebase's first
use of it (previously zero `FlatList` usages anywhere in `apps/mobile`), so this also stands as the
reference example for `B-O1`'s planned history/board/notifications conversions. `FlatList` windows
the concurrently-mounted/decoded `RestaurantRow` images to what's actually on-screen, bounding the
memory cost independent of catalog size — the structural fix Lane B's own rules prefer, since it
makes the regression class impossible regardless of how large `GET /restaurants` ever returns.
The query itself staying uncapped is real residual risk (an unbounded JS array + an eventually-slow
unpaginated query as the catalog grows past hundreds of rows) but is a bigger, riskier change
(needs infinite-scroll UX on two screens plus an API contract change) — tracked separately as the
new `B-O10` optimization item rather than rushed into this run.

**Regression tests.** `apps/mobile/app/food/__tests__/index.test.tsx` and `search.test.tsx` mock
`useRestaurantListFeed` with a 30-40 item list and assert exactly one `FlatList` receives the full
dataset via its `data`/`keyExtractor` props — pinning the virtualization so a future "just add a
row here" edit can't quietly revert to an unbounded `ScrollView`.

## Fixed — LC-B08: rider "Your offers" list grew for the whole online session, never pruned

**Defect.** `sentOffers` (`apps/mobile/app/rider/(tabs)/index.tsx:124`) gains one entry every time
the rider sends a bid (`recordSentOffer`) and had exactly **one** removal path: a full wipe on
going offline (`useEffect(() => { if (!online) setSentOffers([]) }, [online])`). A taken/expired
resolution (`board.takenOrderIds`/`expiredOrderIds`) only flipped the resolved card's own display
flag at render time (`SentOfferCard`'s `taken`/`expired` props) — it never removed the entry from
`sentOffers` itself. So a busy-market rider who stayed online for a long shift accumulated one
permanent "not chosen"/"window closed" card per bid, for the entire session, with every state
change re-serializing and persisting the ever-growing array to SecureStore
(`saveRiderSentOffers`). Over a realistic multi-hour online streak with dozens-to-hundreds of bids
this is a real, visible UI-clutter and per-write-cost regression on Go-class hardware — not a
theoretical leak.

**Fix.** Added a periodic sweep effect (15s interval, only while online) that evicts offers whose
auction closed more than `SENT_OFFER_RETENTION_MS` (60s) ago, via a new pure `isSentOfferStale`
gate in `src/logic/rider-bid-draft.ts` — reusing the existing `expiresAt` timestamp (no new
"resolvedAt" field needed) the same way `SentOfferCard`'s own `staleClosed` self-heal already does.
60s is long enough that the rider has seen the resolution message (taken / expired / the card's own
stale-closed self-heal), short enough that the list stays bounded regardless of shift length. This
is time-based rather than keyed off `board.takenOrderIds`/`expiredOrderIds` changing, so it
self-heals the same missed-push case `SentOfferCard`'s `staleClosed` branch already documents
(a resolving push dropped in a dead zone) rather than depending on those events firing at all.

**Regression tests.** `src/logic/__tests__/rider-bid-draft.test.ts` pins `isSentOfferStale`: not
stale while the auction is open, not stale immediately after close (must give the resolution
message time to show), stale once the retention window elapses, stale hours later (the actual
unbounded-growth repro this run fixes), and treats an unparseable `expiresAt` as stale rather than
trusting it (matching the existing `isSentOfferExpired` convention).

## Optimization findings appended to the Lane B checklist (not fixed this run)

Six pure-optimization findings from the B-T3 audit — real waste, nothing visibly broken today —
appended to `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane B as `B-O10`..`B-O15`,
ranked by impact/effort:

- **B-O10** — `GET /restaurants`'s missing server-side cap itself (the residual half of `LC-B07`
  the `FlatList` fix didn't address). (M)
- **B-O11** — KYC/pickup-photo preview `Image`s render the original undownscaled camera capture
  instead of the already-downscaled upload asset sitting right there (`rider/become.tsx`,
  `PickupChecklist.tsx`) — one-line swap per site, easy/high-value in the single most
  OOM-sensitive flow in the app. (S)
- **B-O12** — rider board's `openOrders` cache can grow unboundedly across a very long unbroken
  online socket session; no reproducible drop path found, edge-case not confirmed defect. (S,
  bundle with B-O1)
- **B-O13** — `expiredOrderIds`/`takenOrderIds` `Set`s in `use-rider-board.ts` grow for the whole
  online session with no eviction; same shape as the now-fixed `LC-B08`, lower absolute impact. (S)
- **B-O14** — merchant `QueueBoard`'s `ackSecuredIds`/`ackHoldIds` `Set`s never shrink for the
  kitchen tablet's shift; bounded in practice by one restaurant's daily order volume. (S)
- **B-O15** — the delivery-code device index grows one entry per completed order for the life of
  the install with no cap (disk, not JS-heap); trivial `.slice(-N)` fix matching the file's own
  existing pattern. (S)

Map/marker memory was audited and cleared: `LiveMap`/`ComposeMap`/`MapPicker` never hold more than
the current pickup/drop points plus one live rider marker, and the GPS pipeline
(`location-buffer.ts` → `background-location-task.ts`) is deliberately "freshest-fix-wins, drop the
breadcrumb trail" at every layer — no growing position array anywhere in the app's map code.

## Verification

`pnpm typecheck && pnpm lint && pnpm test` all green: 92 mobile test suites / 679 tests, 96 API
test files / 1511 tests, both `oxlint` runs clean (one pre-existing, unrelated `no-shadow` warning
in `apps/api`).

The rest of Lane B's checklist (B-T4, and `B-O1`..`B-O15`) stays for the next scheduled firing.
