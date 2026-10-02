/**
 * The force-update gate replaces the whole Stack, so the boot route never reports a destination and
 * the splash would never hand off — the gate must end the cold start ITSELF, through the one shared
 * release (native hide + window-background reset + boot-phase end), or the user stares at the splash
 * instead of the gate (CodeRabbit review on PR #887, re-pinned for ledger D-63). Pinned here:
 * mounting the screen runs the full release once, ends the boot phase, and a second release is a no-op.
 */
import renderer, { act } from "react-test-renderer";

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
import { resetBootSplashReleaseForTest, useBootSplashRelease } from "../../src/boot/boot-splash-hold";
import { BootPhaseProvider, useBootPhase } from "../../src/boot/boot-phase";

beforeEach(() => {
  jest.useFakeTimers();
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
      tree = renderer.create(
        <BootPhaseProvider>
          <Probe />
          <ForceUpdateScreen />
        </BootPhaseProvider>,
      );
    });
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleReset).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)).toBe(false); // boot phase ended by the gate — the splash unmounts
    act(() => tree.unmount());
  });

  it("a later release (the splash's own exit, the ErrorBoundary) cannot re-run the side effects", () => {
    let again!: () => void;
    function Later(): null {
      again = useBootSplashRelease();
      return null;
    }
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <BootPhaseProvider>
          <ForceUpdateScreen />
          <Later />
        </BootPhaseProvider>,
      );
    });
    act(() => again());
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleReset).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});
