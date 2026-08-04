/**
 * Central client reliability policy (C-O2, DoorDash lesson 6: "client reliability policy belongs
 * to the contract, not call sites" — docs/plans/2026-08-01-low-connectivity-program.md §3). Before
 * this module, every network edge in `apps/mobile` picked its own timeout constant by feel
 * (`client.ts` 15s, `uploads.ts` 15s "mirroring" it by comment rather than by reference,
 * `places.ts` 8s, `use-feature-flags.ts`/`use-server-version-gate.ts` 10s, `reachability.ts`'s
 * probe 5s) and TanStack Query's retry backoff was left at the library default — un-jittered,
 * un-tuned, and not owned by this codebase at all. That's exactly the drift DoorDash's gRPC
 * client-standard post-mortem warns about: N call sites each independently guessing a number is N
 * chances to guess wrong, and nothing stops them silently diverging over time.
 *
 * Every timeout below is one of a small number of TIERS, chosen for what the call is waiting on —
 * not one arbitrary constant per file. `RTT_BUDGET_MS` is the network floor this whole program is
 * built against (§1 of the program doc: ~300-600 ms RTT on 2G/3G in Harare); each tier is a
 * multiple of it with headroom for the request's own cost (JSON parse, GCS write, a third-party
 * hop), not a round number picked in isolation.
 */

/** The pessimistic RTT floor this program targets (program doc §1). Every timeout tier below is
 *  expressed as a multiple of this, not as an independently-chosen round number. */
export const RTT_BUDGET_MS = 600;

/**
 * Standard authenticated Lynia API call (`apiFetch` in `api/client.ts`, and the raw-binary photo
 * PUT in `uploads.ts` that bypasses `apiFetch` but must fail into the same friendly-error path just
 * as fast). ~25x RTT: generous enough that a real 2-5s degraded round trip (the audit's own
 * adversarial condition (a)) still completes, tight enough that a truly stalled link fails into the
 * retry/offline UI within a few seconds, not the OS default of tens of seconds.
 */
export const STANDARD_TIMEOUT_MS = 15_000;

/**
 * A latency-sensitive THIRD-PARTY call the UI is actively blocking on while the user is mid-typing
 * (Google Places autocomplete/details in `api/places.ts`). Shorter than `STANDARD_TIMEOUT_MS`
 * deliberately: a slow Places response is worth abandoning fast into the pin-on-map fallback rather
 * than holding the search box open, since Places is a convenience layer, not the flow itself.
 */
export const FAST_TIMEOUT_MS = 8_000;

/**
 * A best-effort, pre-auth BACKGROUND check the boot path fires and does not block on — feature
 * flags (`use-feature-flags.ts`) and the server version gate (`use-server-version-gate.ts`). Both
 * already fail to a safe default (flags closed, gate absent) on any timeout, so this tier can sit
 * between `FAST_TIMEOUT_MS` and `STANDARD_TIMEOUT_MS` without user-visible cost either way.
 */
export const BACKGROUND_CHECK_TIMEOUT_MS = 10_000;

/**
 * The `/health` reachability probe (`net/reachability.ts`). Deliberately the shortest tier: it's
 * polled repeatedly on a backoff while offline specifically to detect recovery fast, so a single
 * probe hanging the full `STANDARD_TIMEOUT_MS` would delay noticing the network came back.
 */
export const PROBE_TIMEOUT_MS = 5_000;

/**
 * AWS "full jitter" exponential backoff (https://aws.amazon.com/blogs/architecture/exponential-
 * backoff-and-jitter/): `random(0, min(capMs, baseMs * 2^attempt))`. Full jitter (not
 * decorrelated/equal jitter) is the right choice here specifically because DoorDash lesson 7 names
 * the failure mode we're defending against — a backend blip recovering right as every client's
 * un-jittered exponential backoff lands on the SAME instant re-synchronizes them into a retry storm
 * that turns the blip into an outage. Full jitter spreads that instant across the whole window
 * instead of a fixed point on it. `rng` is injectable so callers get deterministic, seeded tests
 * instead of asserting flaky wall-clock ranges.
 */
export function fullJitterBackoffMs(
  attempt: number,
  opts: { baseMs: number; capMs: number },
  rng: () => number = Math.random,
): number {
  const window = Math.min(opts.capMs, opts.baseMs * 2 ** attempt);
  return Math.floor(rng() * window);
}

/**
 * TanStack Query's `queries.retryDelay` (wired in `query/client.ts`). Base ~2x `RTT_BUDGET_MS`: a
 * blip usually clears within a round trip or two, so retrying near-immediately (rather than the
 * library's un-tuned 1s/2s/4s... default) gets a flaky read back on screen faster. Capped at 4s —
 * `shouldRetry` only ever allows 2 attempts (docs/ARCHITECTURE.md §Retry ownership: a real outage
 * PAUSES the query via `onlineManager` instead of burning retries), so this backoff only ever needs
 * to cover a brief blip, never a sustained outage.
 */
export function queryRetryDelayMs(attempt: number): number {
  return fullJitterBackoffMs(attempt, { baseMs: RTT_BUDGET_MS * 2, capMs: 4_000 });
}
