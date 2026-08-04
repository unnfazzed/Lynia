# LC-A report — 2026-08-04d (size & data diet)

Lane A is in OPTIMIZE MODE (since `A-T5`, 2026-08-03b). This firing takes the first unchecked
optimization item, **A-O4** — the rider `activeJob` REST poll's missing offline gate, a Day-0/A-T4
KNOWN backlog item (S effort).

## What shipped

`apps/mobile/app/rider/(tabs)/index.tsx:249` polls `/orders/mine/active` every 8s as a self-heal
fallback while the board socket is down — the same pattern `job.tsx` uses for its own active-job
query. Unlike its sibling `openOrders` query (`:482`, `enabled: online`), this poll had no
online/active-job gate at all: it ran the 8s cadence indefinitely even while the rider was fully
offline with the board tab open, forever.

The naive fix — copy `openOrders`'s `enabled: online` — is wrong here. Two things this query does
that `openOrders` doesn't:

1. **A rider can go offline mid-delivery.** The "Go offline" button (`onlineToggleCard`, `:709`,
   `onPress={() => onlineM.mutate(!online)}`) has no active-job guard — only the *confirm-switch*
   dialog's "Go to customer view" path (`:854`) conditionally skips the toggle when `activeJob` is
   set, and that's a different, narrower flow (navigating away, not just flipping the switch). A
   rider who taps "Go offline" while mid-delivery stays `online: false` locally but still has a job
   to finish — this poll is the only thing tracking it to completion once the board socket (which
   only ever connects `if (online)`, confirmed in `use-rider-board.ts:67`) has nothing to say about
   it.
2. **No bootstrap seed exists for this query.** The customer parcel/food journeys get their active-
   order state seeded by `/app/bootstrap` at cold start; the rider board has no equivalent. A rider
   who force-quit mid-job and reopens the app while still offline needs this query's one-shot mount
   fetch to discover that leftover active job — gating `enabled` on `online` would make that fetch
   never fire until the rider manually goes online.

So `enabled` stays default-on (unchanged: the mount fetch always runs), and only the *recurring*
interval gates:

```ts
const activeQ = useQuery({
  queryKey: ["activeJob"],
  queryFn: getActiveOrder,
  refetchInterval: (query) => {
    if (board.connected) return false;
    return online || query.state.data != null ? 8000 : false;
  },
});
```

`query.state.data` (not a closure over `activeQ` itself, to sidestep the TDZ self-reference issue)
holds the last resolved fetch's result — `null` once a completed fetch has confirmed no active job.
Once that's true AND the rider is offline, the interval returns `false` and the self-heal poll goes
quiet. It resumes instantly the moment `online` flips true, and never stops at all while an active
job is in flight, regardless of the online toggle — covering point 1 above.

## What was deliberately left alone

- **The mount-time fetch** — untouched (no `enabled` change), for the bootstrap-gap reason above.
- **`board.connected` short-circuit** — untouched; the poll was already correctly disabled the
  whole time the board socket carries live `activeJob` invalidations.
- **`openOrders`'s own `enabled: online` gate** (`:482`) — correct as-is; unlike `activeJob`, a
  fully offline rider genuinely has nothing this query could ever surface (no equivalent
  "already-in-flight open order" case survives a rider going offline).

## Evidence

Request-count change, not a payload-shape one — same category as A-O1/A-O10/A-O15's own framing.

| Scenario | Before | After |
|---|---|---|
| Offline, board tab open, no active job (the ticket's own case) | 450 req/h (8s cadence, indefinite) | 1 request total (mount fetch), then 0/h |
| Offline, active job in flight (rider went offline mid-delivery) | 450 req/h | 450 req/h (unchanged — now regression-tested, was incidental before) |
| Online | 450 req/h (unless board connected) | 450 req/h (unchanged) |

Each poll's response body is a bare `null` (`JSON.stringify(null)` = 4 bytes) in the no-job case, so
the win here is almost entirely avoided round trips/radio wakeups on a metered 2G/3G connection, not
raw payload bytes — matching this item's own "(S)" sizing and the ticket's "polls indefinitely"
framing rather than a byte-count one.

No JS bundle-size impact: logic-only, no new dependencies or assets — `size-budget.json` untouched.

## Verification

- **New regression tests** — `apps/mobile/app/rider/(tabs)/__tests__/index.test.tsx`, a new
  `describe` block (2 cases), using REAL timers (not fake — `jest.useFakeTimers()` combined with
  this screen's actual `Vibration`-backed haptics/other timers hung indefinitely in this test file,
  an unrelated pre-existing test-infra gap, not a product bug; worked around with real `setTimeout`
  waits under a 15s per-test timeout instead):
  - offline + no active job: `getActiveOrder` is called once on mount, then confirmed to NOT be
    called again after 9 real seconds (the poll would have fired at the 8s mark under the old code).
  - offline + an active job already in flight: `getActiveOrder` is called at least twice within 9
    real seconds (mount fetch + the 8s self-heal poll), confirming the fix does NOT regress
    in-progress job tracking for a rider who went offline mid-delivery.
- Full monorepo `pnpm typecheck && pnpm lint && pnpm test`: all green.
  - `@lynia/mobile` test: **117 suites / 830 tests** pass (828 prior + the 2 new A-O4 cases).
  - `@lynia/api`/`@lynia/admin`/`@lynia/merchant`/`@lynia/shared` typecheck/lint/test: unaffected.
  - `oxlint` (root config): clean on `@lynia/mobile` (the same pre-existing unrelated `no-shadow`
    warning in `apps/api/src/admin/admin-orders.service.spec.ts` noted in prior reports, untouched
    by this PR).

## Budgets and doctrine

No JS/bundle-size change — `size-budget.json` untouched. Fully OTA-able (JS-only client change, no
native/config change, no server change).

**Sensitive-lane doctrine:** the diff touches only `apps/mobile/app/rider/(tabs)/index.tsx` and its
test file — not in `apps/api/src/{wallet,settlements,offers,orders,matching,kyc,riders}/` or
`packages/shared/src/{policy,pricing,money}.ts`, so the four doctrine questions don't apply. The
data being polled (`getActiveOrder`) is order/assignment-adjacent, but this change touches only
*when* the client re-polls a read endpoint — never the response shape, the write path, the
assignment/matching logic, or any money field — and the fix is explicitly designed to never reduce
visibility into an in-progress job (point 1 above), the one scenario where under-polling could cost
correctness.

## Checklist status

Ticked `A-O4` in `docs/plans/2026-08-01-low-connectivity-program.md` §5 (Lane A optimization
checklist). Lane A's next unchecked item is `A-O5` (cap/paginate `getSnapshot.events[]`, M). Lane A
does not self-disable this run — the checklist still has open items.
