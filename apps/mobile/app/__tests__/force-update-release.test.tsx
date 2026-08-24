/**
 * The force-update gate replaces the whole Stack while the pathname stays "/", so BootSplashHold's
 * route trigger can never fire for it — the gate must release the cold start ITSELF, through the one
 * shared release (native hide + window-background reset + boot-phase end), or the user stares at the
 * held native splash until the 8s absolute cap and the boot phase/green window overstay with it
 * (CodeRabbit review on PR #887). Pinned here: mounting the screen runs the full release once, ends
 * the boot phase, and the cap timer firing later cannot re-run the released side effects.
 */
import renderer, { act } from "react-test-renderer";

let mockPathname = "/";
jest.mock("expo-router", () => ({ usePathname: () => mockPathname }));

const mockHideAsync = jest.fn(async () => true);
jest.mock("expo-splash-screen", () => ({ hideAsync: () => mockHideAsync() }));

const mockScheduleReset = jest.fn();
jest.mock("../../src/boot/window-background", () => ({
  scheduleWindowBackgroundReset: () => mockScheduleReset(),
}));

// The view layer is not under test (it has its own structural-snapshot guardrail); a stub keeps this
// about the release seam, and keeps the test off the Brand SVG tree.
jest.mock("../force-update.view", () => ({ ForceUpdateView: () => null }));
jest.mock("../../src/ui/Brand", () => ({ DoveMark: () => null }));

import ForceUpdateScreen from "../force-update";
import { BOOT_HOLD_ABS_CAP_MS, BootSplashHold, resetBootSplashReleaseForTest } from "../../src/boot/boot-splash-hold";
import { BootPhaseProvider, useBootPhase } from "../../src/boot/boot-phase";

beforeEach(() => {
  jest.useFakeTimers();
  mockPathname = "/";
  mockHideAsync.mockClear();
  mockScheduleReset.mockClear();
  resetBootSplashReleaseForTest();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("ForceUpdateScreen — cold-start release (the navigator-replacement path)", () => {
  it("runs the full shared release on mount: splash hidden, reset scheduled, boot phase ended", () => {
    const seen: boolean[] = [];
    function Probe(): null {
      seen.push(useBootPhase().booting);
      return null;
    }
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      // The real mounting shape: BootSplashHold and the gate coexist under one provider, with the
      // pathname parked on "/" — exactly the state where only the gate can release.
      tree = renderer.create(
        <BootPhaseProvider>
          <Probe />
          <ForceUpdateScreen />
          <BootSplashHold />
        </BootPhaseProvider>,
      );
    });
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleReset).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBe(false); // boot phase ended by the gate, not left to the 8s cap
    act(() => tree.unmount());
  });

  it("the absolute cap firing afterwards cannot re-run the released side effects", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <BootPhaseProvider>
          <ForceUpdateScreen />
          <BootSplashHold />
        </BootPhaseProvider>,
      );
    });
    act(() => {
      jest.advanceTimersByTime(BOOT_HOLD_ABS_CAP_MS + 1);
    });
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleReset).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});
