import renderer, { act } from "react-test-renderer";
import { useSettled } from "../use-settled";

let seen: boolean[] = [];
function Probe({ flag, ms }: { flag: boolean; ms: number }): null {
  seen.push(useSettled(flag, ms));
  return null;
}

describe("useSettled", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    seen = [];
  });
  afterEach(() => jest.useRealTimers());

  it("is false until the flag has held for the grace period, and drops at once", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Probe flag ms={1000} />);
    });
    expect(seen.at(-1)).toBe(false);
    act(() => jest.advanceTimersByTime(999));
    expect(seen.at(-1)).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(seen.at(-1)).toBe(true);
    act(() => tree.update(<Probe flag={false} ms={1000} />));
    expect(seen.at(-1)).toBe(false);
    act(() => tree.update(<Probe flag ms={1000} />));
    expect(seen.at(-1)).toBe(false); // the clock restarts
    act(() => tree.unmount());
  });
});
