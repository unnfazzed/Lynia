/**
 * The last touch, as a one-slot mailbox. Deliberately a standalone module with ZERO imports: it is
 * read from the tappable primitive's `onPressIn` (src/ui/Tappable.tsx), which is the press path the
 * whole responsiveness program exists to keep clear, so it must not drag expo-router, the RUM buffer
 * or anything else into the UI layer's module graph.
 *
 * Consumed by `NavOpenProbe` (./nav-timing.tsx) to pair a press with the route change it caused —
 * see that file for why the pairing is done this way rather than at the 111 `router.push` call sites.
 */

let lastTouchAt: number | null = null;

/** Record that a control was pressed. One clock read, one assignment — nothing else belongs here. */
export function noteTouch(now: number = Date.now()): void {
  lastTouchAt = now;
}

/** Read and clear the pending touch. Null when no press preceded this navigation, which is the
 *  filter that keeps redirects, deep links and socket-driven navigations out of the histogram. */
export function consumeTouch(): number | null {
  const at = lastTouchAt;
  lastTouchAt = null;
  return at;
}

/** Test seam: drop any pending touch between cases. */
export function __resetTapSignal(): void {
  lastTouchAt = null;
}
