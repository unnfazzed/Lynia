/**
 * Regression cover for the 0.17.12 "installs but won't open" bug: the app shipped to the Play
 * internal track sat on the native splash forever — icon on white, no crash, no error screen.
 *
 * `app/_layout.tsx` gates BOTH the first render and `SplashScreen.hideAsync()` on `useAppFonts()`
 * settling, and expo-font resolves through `expo-asset`'s `Asset.downloadAsync()`, which carries no
 * timeout. A font load that neither resolves nor rejects therefore stranded the whole app behind a
 * splash nothing would ever hide. These tests pin the contract that makes that unreachable:
 * `useAppFonts` always reports a terminal state, so `fontsReady` in the layout always flips.
 *
 * `useFonts` is mocked because the real one needs the native ExpoFontLoader + asset registry; what
 * is under test is our timeout wrapper around it, not expo-font itself. Driven with
 * react-test-renderer (the harness the sibling fonts.test.tsx already uses — this app has no
 * @testing-library/react-native).
 */
import renderer, { act } from "react-test-renderer";

const mockUseFonts = jest.fn();
jest.mock("expo-font", () => ({ useFonts: (map: unknown) => mockUseFonts(map) }));

import { appFontMap, FONT_LOAD_TIMEOUT_MS, useAppFonts } from "../fonts";

/** Mirrors `_layout.tsx`'s gate — the value that decides "render the app / drop the splash". */
function fontsReady([loaded, error]: [boolean, Error | null]): boolean {
  return loaded || error != null;
}

/** Minimal renderHook: mounts the hook and exposes its latest return value. */
function mountHook(): { current: () => [boolean, Error | null]; rerender: () => void } {
  let latest!: [boolean, Error | null];
  function Probe(): null {
    latest = useAppFonts();
    return null;
  }
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe />);
  });
  return {
    current: () => latest,
    rerender: () => {
      act(() => {
        tree.update(<Probe key="same" />);
      });
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockUseFonts.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useAppFonts", () => {
  it("passes the app font map through to expo-font", () => {
    mockUseFonts.mockReturnValue([true, null]);
    mountHook();
    expect(mockUseFonts).toHaveBeenCalledWith(appFontMap);
  });

  it("reports ready immediately once the fonts load (no timeout penalty on the happy path)", () => {
    mockUseFonts.mockReturnValue([true, null]);
    const hook = mountHook();
    expect(hook.current()).toEqual([true, null]);
    expect(fontsReady(hook.current())).toBe(true);
  });

  it("passes a real load error straight through, unwrapped", () => {
    const err = new Error("missing ttf");
    mockUseFonts.mockReturnValue([false, err]);
    const hook = mountHook();
    expect(hook.current()).toEqual([false, err]);
    expect(fontsReady(hook.current())).toBe(true); // system-font fallback, app still boots
  });

  it("stays pending — splash held — while the load is merely slow", () => {
    mockUseFonts.mockReturnValue([false, null]);
    const hook = mountHook();
    expect(fontsReady(hook.current())).toBe(false);

    act(() => {
      jest.advanceTimersByTime(FONT_LOAD_TIMEOUT_MS - 1);
    });
    expect(fontsReady(hook.current())).toBe(false);
  });

  it("THE BUG: a load that never settles releases the gate at the timeout instead of hanging", () => {
    mockUseFonts.mockReturnValue([false, null]); // never resolves, never rejects
    const hook = mountHook();

    act(() => {
      jest.advanceTimersByTime(FONT_LOAD_TIMEOUT_MS);
    });

    const [loaded, error] = hook.current();
    expect(loaded).toBe(false);
    expect(error).toBeInstanceOf(Error); // synthetic → system font, NOT a permanent splash
    expect(fontsReady(hook.current())).toBe(true);
  });

  it("self-heals: a late-landing font load still reports loaded after the timeout fired", () => {
    mockUseFonts.mockReturnValue([false, null]);
    const hook = mountHook();

    act(() => {
      jest.advanceTimersByTime(FONT_LOAD_TIMEOUT_MS);
    });
    expect(hook.current()[0]).toBe(false);

    mockUseFonts.mockReturnValue([true, null]); // Inter arrives late
    hook.rerender();

    // Real `loaded` wins over the synthetic timeout error, so Text re-renders in Inter.
    expect(hook.current()).toEqual([true, null]);
  });

  it("does not leave a pending timer behind once the fonts load", () => {
    mockUseFonts.mockReturnValue([true, null]);
    mountHook();
    expect(jest.getTimerCount()).toBe(0);
  });
});
