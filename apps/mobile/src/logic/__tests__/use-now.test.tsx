/**
 * LC-B06: `useNow` must actually advance on an interval — the bug it replaces
 * (`useMemo(() => new Date(), deps)`) looked equivalent but could freeze indefinitely whenever `deps`
 * never changed reference (e.g. TanStack Query's structural sharing keeping a no-change refetch's data
 * at the same reference), silently pinning open/closed and "closing in N min" displays.
 */
import renderer, { act } from "react-test-renderer";
import { useNow } from "../use-now";

function Probe({ onRender }: { onRender: (now: Date) => void }): null {
  const now = useNow(1_000);
  onRender(now);
  return null;
}

describe("useNow", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("advances on the given interval instead of freezing at first render", () => {
    const seen: Date[] = [];
    act(() => {
      renderer.create(<Probe onRender={(now) => seen.push(now)} />);
    });
    expect(seen).toHaveLength(1);
    const first = seen[0]!;

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]!.getTime()).toBeGreaterThan(first.getTime());

    // Advance in separate acts (each flushes its own commit) so batching doesn't collapse multiple
    // ticks into one render — what matters here is the clock keeps ticking, not stopping after one.
    act(() => jest.advanceTimersByTime(1_000));
    act(() => jest.advanceTimersByTime(1_000));
    act(() => jest.advanceTimersByTime(1_000));
    expect(seen).toHaveLength(5);
    expect(seen[4]!.getTime()).toBeGreaterThan(seen[1]!.getTime());
  });
});
