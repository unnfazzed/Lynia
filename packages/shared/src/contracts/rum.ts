/**
 * Contracts: client RUM (glass-to-glass latency). Re-exported by ../contracts.ts (the front door).
 */
import { z } from "zod";

// ── Client RUM (glass-to-glass latency) ─────────────────────────────────────
// The app already emits SERVER-side latency SLOs (docs/OBSERVABILITY.md); those miss network RTT +
// client render. This is the client's side of the picture: the mobile app measures perceived latency
// and posts a small batch to `POST /client-metrics`, which records it into the SAME OTEL pipeline as
// `client_*_latency_ms` histograms. TRUST BOUNDARY: unlike the server instruments (labels derived by
// trusted interceptor/gateway code), every value here is client-supplied — so the wire schema is a
// hard allowlist. `event`/`role` are enums (bounded label cardinality — the fixed-vocabulary rule),
// `ms` is clamped to a sane ceiling, and `.strict()` REJECTS any stray field (no ids/phones/lat-lng
// can ride in as a label). The server re-clamps and buckets on ingest; nothing here is trusted as-is.
//
// Clock-skew note: `apifetch` is measured entirely on-client (skew-free). The WS-glass events subtract
// a SERVER-stamped `at` from a client clock, so the client drops out-of-range samples before sending
// and reports the count in `dropped` — skew stays observable instead of poisoning the p95.

/** What a client-side latency sample measures. Bounded enum → safe as a metric label. */
export const ClientMetricEvent = z.enum([
  /** glass-to-glass: rider fix `at` → customer map marker updated. */
  "position_glass",
  /** glass-to-glass: offer `offers:changed` `at` → customer offer list refreshed. */
  "offer_glass",
  /** glass-to-glass: `board:new-order` `createdAt` → rider board row rendered. */
  "board_glass",
  /** client-measured REST round-trip (skew-free: start + end both client `Date.now()`). */
  "apifetch",
  /**
   * Cold start, first half: JS bundle evaluation began → the native splash is released and the first
   * React frame is visible. Covers module evaluation (the whole eager startup graph) plus the font
   * gate. Skew-free — both ends are the client's own monotonic clock, measured from Metro's
   * `__BUNDLE_START_TIME__`. It deliberately EXCLUDES native process start (zygote → JS bundle load),
   * which JS cannot see; a device stopwatch will always read a little higher than this.
   */
  "boot_paint",
  /**
   * Cold start, second half: same origin → the boot route decision resolves and the app leaves the
   * splash for a real screen. `boot_home - boot_paint` is the cost of the device-local boot reads
   * (keychain session/role/onboarding + the cold-start notification), which is the segment the
   * prewarm exists to collapse.
   */
  "boot_home",
  /**
   * Cold start, third mark: same origin → the customer home screen's first PRESENTED frame, as
   * closely as JS can observe it (the client enqueues from a post-interaction callback after home's
   * first commit, not a layout effect — layout effects run before the native frame is on glass and
   * would understate the gap; the Paper architecture exposes no compositor-presentation callback,
   * so this remains a LOWER BOUND on what the customer saw, never an overstatement).
   * `boot_home_paint - boot_home` is the redirect→home segment the RCA found unpainted and
   * unmeasured (docs/archive/CUSTOMER-JOURNEY-LOAD-PERF-2026-08-17.md §1.2). SCOPE CAVEAT: only fires when
   * the boot lands on the customer home — deep-link cold starts (push-tap → order screen) and
   * rider boots never emit it, so read this histogram alongside `boot_home`, not as a universal
   * cold-start number.
   */
  "boot_home_paint",
  /**
   * Tap acknowledgement headroom: `onPressIn` → the next animation frame the JS thread can actually
   * run. NOT "how long until the button lit up" — since the Android press state is now a native
   * ripple painted by the platform on the UI thread, there is no JS press state left to time. What
   * this measures is the thing that made taps feel late in the first place: how backed-up the JS
   * thread was at the instant the touch arrived, i.e. how late a JS-driven response WOULD have been.
   * An idle thread reads ~one frame (≈16 ms); a screen mid-poll, mid-socket-push or mid-clock-tick
   * reads far higher, and that is the signal. Sampled 1-in-N on the client (taps are frequent).
   * See docs/archive/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §1.2.
   */
  "tap_ack",
  /**
   * Tap → destination screen on glass: the touch that preceded a route change → the first presented
   * frame of the new route, observed from a post-interaction callback (the same technique and the
   * same LOWER-BOUND caveat as `boot_home_paint` — Paper exposes no compositor-presentation
   * callback). Only emitted when a real touch preceded the navigation, so redirects, deep links and
   * programmatic pushes never enter the histogram. This is the number the route-prewarm registry
   * (src/boot/prewarm-routes.ts) exists to move.
   */
  "nav_open",
]);
export type ClientMetricEvent = z.infer<typeof ClientMetricEvent>;

/** One latency sample. `ms` capped at 60s — anything larger is treated as garbage and dropped. */
export const ClientMetricSample = z
  .object({ event: ClientMetricEvent, ms: z.number().int().min(0).max(60_000) })
  .strict();
export type ClientMetricSample = z.infer<typeof ClientMetricSample>;

/** `POST /client-metrics` body — a bounded, fire-and-forget batch. `.strict()` rejects stray keys so
 *  no unbounded/PII field can become a label. `appVersion` is coerced to a `major.minor` bucket on the
 *  server (or dropped) before it's ever used as an attribute. `dropped` carries the count of skewed
 *  samples the client discarded, so tail distortion is measurable rather than silent. */
export const ClientMetricsBatch = z
  .object({
    role: z.enum(["rider", "customer"]),
    appVersion: z.string().max(24).optional(),
    samples: z.array(ClientMetricSample).min(1).max(20),
    dropped: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();
export type ClientMetricsBatch = z.infer<typeof ClientMetricsBatch>;
