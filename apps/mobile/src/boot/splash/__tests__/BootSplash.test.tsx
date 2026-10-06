/**
 * The cold-start splash (ledger D-64, CHANGE-2026-10-06). Pinned: it drops the native launch screen as
 * soon as it has drawn; it has no steps card; it stays up exactly until the boot is ready (Home: all
 * three tasks; anywhere else: the session check), never shorter than the 1300ms intro; it shows the
 * offline panel (and never gives up) when the API can't be reached, and "Try again" resumes only the
 * tasks still pending; and it can never strand the app on a hung request.
 */
import React from "react";
import { AccessibilityInfo, Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

const mockHideAsync = jest.fn(async () => true);
jest.mock("expo-splash-screen", () => ({ hideAsync: () => mockHideAsync() }));
const mockScheduleReset = jest.fn();
jest.mock("../../window-background", () => ({ scheduleWindowBackgroundReset: () => mockScheduleReset() }));

import { BootPhaseProvider, useBootPhase } from "../../boot-phase";
import { getBootReadiness, reportBootDestination, reportBootReady, reportBootRoute, resetBootReadinessForTest } from "../../boot-readiness";
import { resetBootSplashReleaseForTest } from "../../boot-splash-hold";
import { __resetReachability, __setProbeFetch, reportReachable, reportUnreachable } from "../../../net/reachability";
import { BootSplash } from "../BootSplash";
import { GIVE_UP_MS, INTRO_MS } from "../timeline";
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
/** The splash is `done`: its exit into Home has started (reportSplashExit). */
const exiting = (): boolean => getBootReadiness().exitAt != null;
/** The removed steps card's labels (CHANGE-2026-10-06) — never drawn, never announced. */
const RETIRED_STEP_LABELS = ["Checking it's you", "Loading your saved places", "Finding riders near you"];
/** Whether the host view holding `text` sits inside a subtree hidden from accessibility. */
const hiddenFromA11y = (tree: renderer.ReactTestRenderer, text: string): boolean => {
  let node: renderer.ReactTestInstance | null = tree.root.findAll((n) => n.type === Text && String(n.props.children) === text)[0] ?? null;
  for (; node; node = node.parent) {
    if (typeof node.type === "string" && (node.props.accessibilityElementsHidden === true || node.props.importantForAccessibility === "no-hide-descendants")) return true;
  }
  return false;
};
const texts = (tree: renderer.ReactTestRenderer): string[] => tree.root.findAllByType(Text).map((t) => String(t.props.children));
/** The offline panel's "Try again" button. */
const findRetry = (tree: renderer.ReactTestRenderer): renderer.ReactTestInstance =>
  tree.root.findAll((n) => n.props.accessibilityRole === "button" && typeof n.props.onPress === "function")[0]!;

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

  it("draws the handoff's copy verbatim, and no steps card", () => {
    const tree = mount();
    expect(texts(tree)).toEqual(expect.arrayContaining([S.slow, S.offlineTitle, S.offlineBody, S.retry]));
    act(() => reportBootDestination("/home"));
    advance(INTRO_MS + 500); // loading: where the card used to rise in
    for (const label of RETIRED_STEP_LABELS) expect(texts(tree)).not.toContain(label);
    act(() => tree.unmount());
  });

  it("a signed-out boot hands off once the session check is in — not before the intro has played", () => {
    const tree = mount();
    act(() => reportBootDestination("/phone"));
    advance(INTRO_MS - 50);
    expect(released()).toBe(false);
    advance(100);
    expect(released()).toBe(true); // a straight cut: no exit, no tick to wait for
    expect(exiting()).toBe(false);
    expect(mockScheduleReset).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it("a session check that lands after the intro hands off at that moment", () => {
    const tree = mount();
    advance(3000);
    expect(released()).toBe(false);
    act(() => reportBootDestination("/onboarding"));
    advance(50);
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  it("done waits for all three tasks AND the 1300ms intro", () => {
    const tree = mount();
    act(() => {
      reportBootDestination("/home");
      reportBootReady("profile");
    });
    advance(INTRO_MS + 2000);
    expect(exiting()).toBe(false); // Home's content still pending
    act(() => reportBootReady("home"));
    advance(50);
    expect(exiting()).toBe(true);
    act(() => tree.unmount());

    // …and all three in at once still waits for the intro.
    resetBootReadinessForTest();
    resetBootSplashReleaseForTest();
    const again = mount();
    act(() => {
      reportBootDestination("/home");
      reportBootReady("profile");
      reportBootReady("home");
    });
    advance(INTRO_MS - 50);
    expect(exiting()).toBe(false);
    advance(100);
    expect(exiting()).toBe(true);
    act(() => again.unmount());
  });

  it("Home: stays up until Home's profile and content are ready, then exits into Home", () => {
    const tree = mount();
    act(() => reportBootDestination("/home"));
    act(() => reportBootReady("profile"));
    advance(6000);
    expect(released()).toBe(false); // Home's content still loading — the splash is still the screen
    act(() => reportBootReady("home"));
    advance(400);
    expect(exiting()).toBe(true);
    expect(released()).toBe(false); // exit animation running
    advance(2000);
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  it("a fast boot is as short as the handoff allows (the 1300ms intro + the 1150ms exit)", () => {
    const tree = mount();
    act(() => {
      reportBootDestination("/home");
      reportBootReady("profile");
      reportBootReady("home");
    });
    advance(2300);
    expect(released()).toBe(false);
    advance(400);
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

  it("S-2: a Home boot sent elsewhere (a rejected session → /phone) hands off at once, with no slow pill", () => {
    const tree = mount();
    act(() => reportBootDestination("/home"));
    act(() => reportBootRoute("/home"));
    advance(2500);
    expect(released()).toBe(false);
    act(() => reportBootRoute("/phone")); // the SessionGate replaced Home after the 401 sign-out
    advance(100);
    expect(released()).toBe(true); // not the 20s give-up
    act(() => tree.unmount());
  });

  it("S-2: the boot route (\"/\") on its way to Home is not a redirect", () => {
    const tree = mount();
    act(() => reportBootDestination("/home"));
    act(() => reportBootRoute("/"));
    advance(3000);
    expect(released()).toBe(false);
    act(() => tree.unmount());
  });

  it("S-4: never shows the offline panel once the boot is no longer waiting on anything", () => {
    __setProbeFetch(async () => false);
    const tree = mount();
    act(() => {
      reportBootDestination("/home");
      reportBootReady("profile");
      reportBootReady("home");
      reportUnreachable(); // a background request failed — but Home already has everything it needs
    });
    for (let ms = 0; ms < 2300; ms += 100) {
      advance(100);
      expect(hiddenFromA11y(tree, S.offlineTitle)).toBe(true);
    }
    advance(400);
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  it("S-6: the give-up bound does not count time spent offline", () => {
    __setProbeFetch(async () => false);
    const tree = mount();
    act(() => reportBootDestination("/home"));
    advance(2000);
    act(() => reportUnreachable());
    advance(GIVE_UP_MS); // 22s in, 20s of it offline
    expect(released()).toBe(false);
    act(() => reportReachable());
    advance(5000); // back online: Home gets a real load, not an instant give-up
    expect(released()).toBe(false);
    advance(GIVE_UP_MS);
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  it("S-6: a request failing mid-exit never stops the exit (done is one-way)", () => {
    __setProbeFetch(async () => false);
    const tree = mount();
    act(() => reportBootDestination("/home"));
    advance(GIVE_UP_MS + 100); // the give-up exit has started
    act(() => reportUnreachable());
    advance(2000);
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  it("accessibility: \"Loading LyniaGo\" once when loading starts, the offline panel is announced, hidden parts are not read", () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    announce.mockClear(); // RN's jest setup already mocks it, so earlier tests' calls are still on it
    __setProbeFetch(async () => false);
    const tree = mount();
    // The intro: nothing announced yet, and the pill and the panel are not in the accessibility tree.
    expect(hiddenFromA11y(tree, S.slow)).toBe(true);
    expect(hiddenFromA11y(tree, S.offlineTitle)).toBe(true);
    act(() => reportBootDestination("/home"));
    advance(INTRO_MS - 50);
    expect(announce).not.toHaveBeenCalled();
    advance(100);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Loading LyniaGo");
    expect(S.loading).toBe("Loading LyniaGo");
    advance(4000);
    expect(hiddenFromA11y(tree, S.slow)).toBe(false); // slow now: the pill is read
    act(() => reportUnreachable());
    advance(100);
    expect(announce).toHaveBeenCalledWith(`${S.offlineTitle}. ${S.offlineBody}`);
    expect(hiddenFromA11y(tree, S.offlineTitle)).toBe(false);
    // Back to loading after "Try again": not announced a second time.
    act(() => findRetry(tree).props.onPress());
    advance(100);
    expect(announce.mock.calls.filter(([msg]) => msg === S.loading)).toHaveLength(1);
    for (const label of RETIRED_STEP_LABELS) expect(announce.mock.calls.flat().join(" ")).not.toContain(label);
    announce.mockRestore();
    act(() => tree.unmount());
  });

  it("retry after going offline resumes only the unfinished tasks", async () => {
    let probes = 0;
    let probeOk = false;
    __setProbeFetch(async () => {
      probes += 1;
      return probeOk;
    });
    const tree = mount();
    act(() => {
      reportBootDestination("/home");
      reportBootReady("profile");
    });
    const before = { ...getBootReadiness().readyAt };
    advance(2000);
    act(() => reportUnreachable());
    advance(100);
    expect(hiddenFromA11y(tree, S.offlineTitle)).toBe(false); // offline, still waiting on Home's content
    probeOk = true;
    const probesBefore = probes;
    await act(async () => {
      findRetry(tree).props.onPress();
    });
    expect(probes).toBe(probesBefore + 1); // "Try again" probes at once
    // The finished tasks are not re-run or re-stamped: the splash still counts them as done…
    expect(getBootReadiness().readyAt.session).toBe(before.session);
    expect(getBootReadiness().readyAt.profile).toBe(before.profile);
    advance(500);
    expect(exiting()).toBe(false);
    // …so the one unfinished task landing is all it takes — no second intro, no wait on the others.
    act(() => reportBootReady("home"));
    advance(50);
    expect(exiting()).toBe(true);
    act(() => tree.unmount());
  });

  it("a root layout remounted after the boot (the ErrorBoundary's Reload) never replays the splash", () => {
    const first = mount();
    act(() => reportBootDestination("/phone"));
    advance(INTRO_MS + 100);
    expect(released()).toBe(true);
    act(() => first.unmount());
    booting = [];
    const again = mount();
    expect(booting).not.toContain(true);
    expect(again.root.findAll((n) => n.type === BootSplash)).toHaveLength(0);
    act(() => again.unmount());
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
