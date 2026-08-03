# LC-A report — 2026-08-03g (size & data diet)

Lane A is in OPTIMIZE MODE (since `A-T5`, 2026-08-03b). This firing takes the first unchecked
optimization item, **A-O6** — RUM/telemetry upload batching + cadence review on metered data, the
#2 [data] lever after A-O9 per A-T4's evidence (≈68-324 KB/hour depending on request volume, since
an `apiFetch` sample enqueues on essentially every request during any active-tracking or
food-polling window).

## What shipped

`apps/mobile/src/telemetry/rum.ts` — real sampling (not just batching, which was already in place)
plus a cadence widen, per the item's own framing ("needs real sampling, e.g. 1-in-N or time-boxed,
not just batching"):

- **1-in-4 `apifetch` sampling.** `enqueueApiFetch` now keeps only every 4th call via a deterministic
  modulo counter (`apifetchCounter % APIFETCH_SAMPLE_RATE`), not `Math.random()` — an exact, testable
  cadence rather than a probabilistic one that could streak. Reset on `start()`/`stop()` so cadence is
  stable app-launch to app-launch. **Glass samples are deliberately NOT sampled** —
  `position_glass`/`offer_glass`/`board_glass` go through the unsampled `enqueue()` path unchanged:
  they're already bounded by real WS push frequency (much rarer than a REST call) and each one is
  independently informative (a genuine glass-to-glass latency event), not fungible with its neighbors
  the way a REST round-trip sample is.
- **Flush interval widened 10s → 30s** (`FLUSH_INTERVAL_MS`). At the old 10s cadence, a metered-data
  session with a mostly-quiet buffer still paid one POST's fixed per-request overhead (headers, auth
  bearer token, TLS) every 10 seconds for as little as 1-2 samples — batching existed (`FLUSH_AT = 10`
  and the 20-sample contract cap) but the time-based flush undercut it whenever the buffer filled
  slower than once per 10s, which sampling now makes the common case. `AppState` background/inactive
  still flushes immediately (`onAppStateChange`, unchanged) — nothing is lost on backgrounding, this
  only widens the foreground quiet-buffer cadence, and RUM has no live consumer (it's fire-and-forget
  monitoring, not a signal anything blocks on).

Both changes compose: fewer buffered samples per unit time (sampling) *and* more samples batched per
flush when one does happen (cadence), rather than fighting each other.

## What was deliberately left alone

- **`dropped` semantics untouched.** The contract's `dropped` field is specifically "skew-poisoned
  samples the client discarded" (`clampGlassSample` rejections), consumed server-side by
  `incClientDropped`/`client_samples_dropped_total` as a clock-skew health signal. Sampled-out
  `apifetch` calls are NOT counted into `dropped` — conflating "statistically sampled out by design"
  with "discarded because unusable" would corrupt that signal, making skew look far more common than
  it is. This is a deliberate real-population subsample (each server-side histogram bucket is still a
  fair random draw from the true distribution), not a "some data is missing" event worth flagging.
- **`FLUSH_AT`/`MAX_BUFFER`/`MAX_SAMPLES_PER_BATCH` unchanged.** The 10-sample/20-cap/50-ceiling
  values weren't implicated by A-T4's finding (batch shape was already efficient at ≈79-649 B); only
  cadence and per-event volume needed a look.

## Evidence (payload-bytes + request-count trace, mirroring A-T4/A-O9's methodology)

No live capture — a synthetic-driver script (`Buffer.byteLength(JSON.stringify(...))` on batches
built by the actual `buildBatches()` logic, same batching/flush algorithm as production, same
constants) driven over two 1-hour request-rate scenarios A-T4 traced: an active customer
parcel-tracking window (~1 `apiFetch` every 3s) and a rider steady-state food job leg (~1 every
1.5s). Script: `/tmp` scratch (not committed — a one-off measurement, like A-T4's/A-O9's own traces).

| Scenario | Before (10s flush, unsampled) | After (30s flush, 1-in-4 sampled) | Bytes | Requests |
|---|---:|---:|---:|---:|
| Active tracking (~3s/apifetch) | 54,000 B/h, 360 req/h | 15,000 B/h, 120 req/h | **−72.2%** | **−66.7%** |
| Rider steady-state job leg (~1.5s/apifetch) | 90,000 B/h, 360 req/h | 24,000 B/h, 120 req/h | **−73.3%** | **−66.7%** |

Directionally consistent with A-T4's own ≈68-324 KB/hour range (this item's evidence quantified the
upper end of that band, where `apiFetch` volume dominates) — a ~70-75% cut on the dominant-volume
signal. Sampling alone (10s flush unchanged) measured a smaller ~56-60% byte cut and only 0-17%
fewer requests in an earlier pass of the same script, because the unchanged 10s interval timer kept
firing and shipping small batches regardless of how few samples had accumulated — confirming the
item's own diagnosis that batching/cadence needed a look alongside sampling, not sampling alone.

## Verification

- **New regression tests** — `apps/mobile/src/telemetry/__tests__/rum.test.ts` (new file; the module
  had no dedicated test file before despite its own doc comment stating the pure functions were
  "trivially unit-testable"). 11 cases:
  - `clampGlassSample`/`buildBatches` pure-function coverage (baseline, previously untested).
  - Sampling: keeps exactly every 4th `apifetch` call in order (deterministic assertion on the exact
    batch contents sent); is a no-op before `start()`; glass events (`enqueue()`) are never sampled.
  - Cadence: a quiet buffer does NOT flush at the old 10s mark but does at 30s (`jest.useFakeTimers()`
    + `advanceTimersByTimeAsync`).
  - `AppState` background transition still flushes immediately regardless of the wider interval.
- Full monorepo `pnpm typecheck && pnpm lint && pnpm test`: all green.
  - `@lynia/mobile` typecheck clean, lint clean (oxlint + `check-font-charset`).
  - `@lynia/mobile` test: **107 suites / 743 tests** pass (was 721 at A-O9c/2026-08-03f; +11 from this
    PR's new file, +11 from sibling-lane merges since).
  - `@lynia/api` test: **96 files / 1,516 tests** pass (untouched by this PR — zero server-side
    changes).
  - `@lynia/admin`/`@lynia/merchant`/`@lynia/shared` typecheck/lint: unaffected, all green.

## Budgets and doctrine

No JS/bundle-size change (`size-budget.json` untouched — this is a request-count/payload-bytes
optimization, not a bundle-size one; the diff is a handful of lines of logic plus comments inside an
already-shipped module, no new dependency, no new asset. `apps/mobile/scripts/check-bundle-size.mjs`
wasn't run since nothing here changes bundle contents in any way that could plausibly threaten the
razor-thin Hermes budget A-O12 established headroom for). Fully OTA-able (JS-only, no native/config
change). No sensitive-lane doctrine questions apply: the diff touches only
`apps/mobile/src/telemetry/rum.ts` (+ its new test file) — no file under `apps/api/src/{wallet,
settlements,offers,orders,matching,kyc,riders}/` or `packages/shared/src/{policy,pricing,money}.ts`
was touched, and RUM data is pure client-side latency telemetry, never read by any money/assignment/
auth code path.

`A-O6` is marked resolved in this same PR (program doc §5, this report).
