/**
 * The cold-start splash (ledger D-64). Pinned: it drops the native launch screen as soon as it has
 * drawn; it stays up exactly until the boot is ready (Home: all three steps; anywhere else: step 1),
 * never shorter than the handoff's minimums; it shows the offline panel (and never gives up) when the
 * API can't be reached; and it can never strand the app on a hung request.
 */
import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockHideAsync = jest.fn(async () => true);
jest.mock("expo-splash-screen", () => ({ hideAsync: () => mockHideAsync() }));
const mockScheduleReset = jest.fn();
jest.mock("../../window-background", () => ({ scheduleWindowBackgroundReset: () => mockScheduleReset() }));

import { BootPhaseProvider, useBootPhase } from "../../boot-phase";
import { reportBootDestination, reportBootReady, resetBootReadinessForTest } from "../../boot-readiness";
import { resetBootSplashReleaseForTest } from "../../boot-splash-hold";
import { __resetReachability, __setProbeFetch, reportUnreachable } from "../../../net/reachability";
import { BootSplash } from "../BootSplash";
import { GIVE_UP_MS } from "../timeline";
import { S } from "../copy";

const metrics = { frame: { x: 0, y: 0, width: 360, height: 720 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

let booting: boolean[] = [];
let mountable: boolean[] = [];
function Probe(): null {
  const phase = useBootPhase();
  booting.push(phase.booting);
  mountable.push(phase.appMountable);
  return null;
}
function Splash(): React.ReactElement | null {
  return useBootPhase().booting ? <BootSplash /> : null;
}

function mount(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <BootPhaseProvider>
          <Probe />
          <Splash />
        </BootPhaseProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

const advance = (ms: number): void => {
  // Step in small slices so chained timers (wake → re-render → next wake) all get to run.
  for (let left = ms; left > 0; left -= 50) {
    act(() => {
      jest.advanceTimersByTime(Math.min(50, left));
    });
  }
};
const released = (): boolean => booting.at(-1) === false;
const texts = (tree: renderer.ReactTestRenderer): string[] => tree.root.findAllByType(Text).map((t) => String(t.props.children));

// RN's jest mock ends every native-driven animation after 16ms whatever its length. The splash runs
// everything on the native driver (delays folded into the curve — see ../motion.ts), so give the mock
// the animation's real length: a timing's precomputed frames, at 60fps.
function nativeAnimationsTakeTheirDuration(): void {
  const { NativeModules } = jest.requireActual<typeof import("react-native")>("react-native");
  (NativeModules.NativeAnimatedModule.startAnimatingNode as jest.Mock).mockImplementation(
    (_id: number, _tag: number, config: { frames?: number[] }, end: (r: { finished: boolean }) => void) => {
      setTimeout(() => end({ finished: true }), config.frames ? (config.frames.length * 1000) / 60 : 16);
    },
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  nativeAnimationsTakeTheirDuration();
  booting = [];
  mountable = [];
  mockHideAsync.mockClear();
  mockScheduleReset.mockClear();
  resetBootReadinessForTest();
  resetBootSplashReleaseForTest();
  __resetReachability();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("BootSplash", () => {
  it("drops the native launch screen once it has drawn, without ending the boot", () => {
    const tree = mount();
    const root = tree.root.findAll((n) => typeof n.props.onLayout === "function")[0]!;
    act(() => root.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 720 } } }));
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(released()).toBe(false);
    act(() => tree.unmount());
  });

  it("draws alone first: the app underneath mounts only on the frame after the splash's first layout", () => {
    const tree = mount();
    expect(mountable.at(-1)).toBe(false);
    const root = tree.root.findAll((n) => typeof n.props.onLayout === "function")[0]!;
    act(() => root.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 720 } } }));
    expect(mountable.at(-1)).toBe(false); // same frame — still the splash alone
    act(() => {
      jest.advanceTimersByTime(20); // next animation frame
    });
    expect(mountable.at(-1)).toBe(true);
    act(() => tree.unmount());
  });

  it("never holds the app back if the splash never lays out", () => {
    const tree = mount();
    advance(1100);
    expect(mountable.at(-1)).toBe(true);
    act(() => tree.unmount());
  });

  it("draws the handoff's steps card copy, verbatim", () => {
    const tree = mount();
    expect(texts(tree)).toEqual(expect.arrayContaining([...S.steps, S.slow, S.offlineTitle, S.offlineBody, S.retry]));
    act(() => tree.unmount());
  });

  it("a signed-out boot hands off after step 1 — not before the intro and its minimum", () => {
    const tree = mount();
    act(() => reportBootDestination("/phone"));
    advance(1600);
    expect(released()).toBe(false);
    advance(300);
    expect(released()).toBe(true);
    expect(mockScheduleReset).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it("Home: stays up until Home's profile and content are ready, then exits into Home", () => {
    const tree = mount();
    act(() => reportBootDestination("/home"));
    act(() => reportBootReady("profile"));
    advance(6000);
    expect(released()).toBe(false); // Home's content still loading — the splash is still the screen
    act(() => reportBootReady("home"));
    advance(400); // step 3's minimum active time
    expect(released()).toBe(false); // exit animation running
    advance(2000);
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  it("a fast boot is as short as the handoff allows (intro + three 400ms steps + the exit)", () => {
    const tree = mount();
    act(() => {
      reportBootDestination("/home");
      reportBootReady("profile");
      reportBootReady("home");
    });
    advance(2450);
    expect(released()).toBe(false);
    advance(1500);
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  it("never strands the app on a hung request", () => {
    const tree = mount();
    act(() => reportBootDestination("/home"));
    advance(GIVE_UP_MS - 100);
    expect(released()).toBe(false);
    advance(2000);
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  it("offline: holds on the offline panel instead of giving up", () => {
    __setProbeFetch(async () => false);
    const tree = mount();
    act(() => reportBootDestination("/home"));
    act(() => reportUnreachable());
    advance(GIVE_UP_MS + 5000);
    expect(released()).toBe(false);
    act(() => tree.unmount());
  });
});
