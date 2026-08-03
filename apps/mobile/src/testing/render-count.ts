import type React from "react";

/**
 * Render-isolation test helper (B-O2/AuctionClock pattern): counts how many times a
 * `React.memo`-wrapped component's underlying function actually EXECUTES, as opposed to how many
 * times React merely creates an element for it (which happens on every parent render regardless of
 * memo, since JSX always allocates a fresh element).
 *
 * `React.Profiler`'s `onRender` looked like the obvious tool for this but isn't one: verified
 * empirically against this app's React 18.3.1/react-test-renderer that `onRender` fires on every
 * commit that reaches the Profiler boundary EVEN WHEN the memoized child below it bails out on
 * unchanged props — it can't distinguish "ran" from "bailed".
 *
 * Instead this patches the memo wrapper's `.type` field (the underlying render function — a plain,
 * unfrozen property on the object `React.memo()` returns in this React version) with a
 * call-counting passthrough. Test-only.
 */
export function countMemoRenders<P extends object>(
  memoComponent: React.MemoExoticComponent<React.ComponentType<P>>,
): { count: () => number } {
  const target = memoComponent as unknown as { type: (props: P) => React.ReactElement };
  const original = target.type;
  let n = 0;
  target.type = (props: P): React.ReactElement => {
    n += 1;
    return original(props);
  };
  return { count: () => n };
}
