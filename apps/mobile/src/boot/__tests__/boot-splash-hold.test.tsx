/**
 * BootSplashHold — the cold-start hold on the NATIVE splash (MOB-BOOT-05: the boot is ONE screen).
 * The contract worth pinning is the two-sided guarantee: the native splash stays up until the FIRST
 * real screen's frame settles (dismiss-on-ANY-route — no per-screen cooperation), and it can NEVER
 * strand — a settle cap bounds a route whose interactions never drain, and an absolute cap bounds
 * everything else. Releasing must do all three things exactly once: hide the native splash, end the
 * boot phase (the transition suppression), and schedule the window-background green→white reset.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { controlInteractions, type InteractionControl } from "../../testing/interactions";

let mockPathname = "/";
jest.mock("expo-router", () => ({ usePathname: () => mockPathname }));

const mockHideAsync = jest.fn(async () => true);
jest.mock("expo-splash-screen", () => ({ hideAsync: () => mockHideAsync() }));

const mockScheduleReset = jest.fn();
jest.mock("../window-background", () => ({
  scheduleWindowBackgroundReset: () => mockScheduleReset(),
}));

import {
  BOOT_HOLD_ABS_CAP_MS,
  BOOT_HOLD_SETTLE_CAP_MS,
  BootSplashHold,
  resetBootSplashReleaseForTest,
} from "../boot-splash-hold";
import { BootPhaseProvider, useBootPhase } from "../boot-phase";

const released = (): boolean => mockHideAsync.mock.calls.length > 0;

let interactions: InteractionControl;
let rafQueue: ((time: number) => void)[];
let rafSpy: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  interactions = controlInteractions();
  // rAF under manual control so "one frame past the interactions drain" is a real, ordered assertion.
  rafQueue = [];
  rafSpy = jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation(((cb: (time: number) => void) => {
    rafQueue.push(cb);
    return rafQueue.length;
  }) as never);
  mockPathname = "/";
  mockHideAsync.mockClear();
  mockScheduleReset.mockClear();
  resetBootSplashReleaseForTest();
});
afterEach(() => {
  rafSpy.mockRestore();
  interactions.restore();
  jest.useRealTimers();
});

function render(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<BootSplashHold />);
  });
  return tree;
}

const flushFrame = (): void => {
  act(() => interactions.flush());
  act(() => {
    rafQueue.splice(0).forEach((cb) => cb(0));
  });
};

describe("BootSplashHold", () => {
  it("holds the native splash while the boot route is still current", () => {
    const tree = render();
    expect(released()).toBe(false);
    // Frames pass on the splash route itself — that must not release anything.
    flushFrame();
    expect(released()).toBe(false);
    act(() => tree.unmount());
  });

  it("renders nothing — the one screen the user sees is the native splash, not a JS copy", () => {
    const tree = render();
    expect(tree.toJSON()).toBeNull();
    act(() => tree.unmount());
  });

  it("releases one presented frame after ANY real route commits (no per-screen wiring)", () => {
    const tree = render();
    mockPathname = "/order/abc123"; // a push-tap deep link, not home — the generic case
    act(() => {
      tree.update(<BootSplashHold />);
    });
    // Committed but not yet presented: still held.
    expect(released()).toBe(false);
    flushFrame();
    expect(released()).toBe(true);
    // The release is one atomic step: splash gone AND the window-background reset scheduled.
    expect(mockScheduleReset).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it("settle cap: a destination whose interactions never drain still releases", () => {
    const tree = render();
    mockPathname = "/home";
    act(() => {
      tree.update(<BootSplashHold />);
    });
    act(() => {
      jest.advanceTimersByTime(BOOT_HOLD_SETTLE_CAP_MS + 1);
    });
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  it("absolute cap: can never strand the splash, whatever the router does", () => {
    const tree = render();
    act(() => {
      jest.advanceTimersByTime(BOOT_HOLD_ABS_CAP_MS + 1);
    });
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  /**
   * The hold's release is also what ENDS the boot phase, and the boot phase is what suppresses the
   * navigator's screen transition. Both halves of the owner's instruction depend on this one edge:
   * hold up ⇒ no transition (the cold start is one motionless green screen), hold gone ⇒ transition
   * back (the in-app animation is kept). A release that forgot to call `endBoot` would strand the
   * whole app with instant cuts, and nothing else in the suite would notice.
   */
  it("ends the boot phase when it releases, so in-app animation comes back", () => {
    const seen: boolean[] = [];
    function Probe(): null {
      seen.push(useBootPhase().booting);
      return null;
    }
    let tree!: renderer.ReactTestRenderer;
    const mount = (): React.ReactElement => (
      <BootPhaseProvider>
        <Probe />
        <BootSplashHold />
      </BootPhaseProvider>
    );
    act(() => {
      tree = renderer.create(mount());
    });
    expect(seen.at(-1)).toBe(true); // still booting while the splash is up
    mockPathname = "/home";
    act(() => {
      tree.update(mount());
    });
    expect(seen.at(-1)).toBe(true); // committed but not presented — still suppressing
    flushFrame();
    expect(released()).toBe(true);
    expect(seen.at(-1)).toBe(false); // destination is on screen: animations restored
    act(() => tree.unmount());
  });

  it("ends the boot phase on the absolute cap too — a stuck boot must not freeze animation", () => {
    const seen: boolean[] = [];
    function Probe(): null {
      seen.push(useBootPhase().booting);
      return null;
    }
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <BootPhaseProvider>
          <Probe />
          <BootSplashHold />
        </BootPhaseProvider>,
      );
    });
    act(() => {
      jest.advanceTimersByTime(BOOT_HOLD_ABS_CAP_MS + 1);
    });
    expect(seen.at(-1)).toBe(false);
    act(() => tree.unmount());
  });

  it("releases exactly once — later navigations and the caps can never double-fire it", () => {
    const tree = render();
    mockPathname = "/home";
    act(() => {
      tree.update(<BootSplashHold />);
    });
    flushFrame();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    mockPathname = "/send";
    act(() => {
      tree.update(<BootSplashHold />);
    });
    flushFrame();
    act(() => {
      jest.advanceTimersByTime(BOOT_HOLD_ABS_CAP_MS + 1);
    });
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleReset).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});
