import type React from "react";

/**
 * Render-isolation test helper (mirrors apps/mobile's B-O2/AuctionClock `countMemoRenders`):
 * counts how many times a `React.memo`-wrapped component's underlying function actually EXECUTES,
 * as opposed to how many times React merely creates an element for it (which happens on every
 * parent render regardless of memo, since JSX always allocates a fresh element).
 *
 * `React.Profiler`'s `onRender` fires on every commit that reaches a Profiler boundary even when
 * the memoized child below it bails out on unchanged props — it can't distinguish "ran" from
 * "bailed" (verified against this repo's mobile app; same React major version here). This instead
 * patches the memo wrapper's `.type` field (the underlying render function — a plain, unfrozen
 * property on the object `React.memo()` returns) with a call-counting passthrough. Test-only.
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
