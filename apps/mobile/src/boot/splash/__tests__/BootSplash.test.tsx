/**
 * The cold-start splash (ledger D-64). Pinned: it drops the native launch screen as soon as it has
 * drawn; it stays up exactly until the boot is ready (Home: all three steps; anywhere else: step 1),
 * never shorter than the handoff's minimums; it shows the offline panel (and never gives up) when the
 * API can't be reached; and it can never strand the app on a hung request.
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
import { reportBootDestination, reportBootReady, reportBootRoute, resetBootReadinessForTest } from "../../boot-readiness";
import { resetBootSplashReleaseForTest } from "../../boot-splash-hold";
import { __resetReachability, __setProbeFetch, reportReachable, reportUnreachable } from "../../../net/reachability";
import { BootSplash, stepDoneAnnouncement } from "../BootSplash";
import { GIVE_UP_MS } from "../timeline";
import { RIDER_OFFLINE, RIDER_STEPS, S } from "../copy";

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
/** Each step row's state, read off its accessibilityState. */
const stepLabels = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root
    .findAll((n) => typeof n.type === "string" && n.props.accessibilityState != null && S.steps.includes(n.props.accessibilityLabel))
    .map((n) => (n.props.accessibilityState.checked ? "checked" : n.props.accessibilityState.busy ? "active" : "pending"));
/** Whether the host view holding `text` sits inside a subtree hidden from accessibility. */
const hiddenFromA11y = (tree: renderer.ReactTestRenderer, text: string): boolean => {
  let node: renderer.ReactTestInstance | null = tree.root.findAll((n) => n.type === Text && String(n.props.children) === text)[0] ?? null;
  for (; node; node = node.parent) {
    if (typeof node.type === "string" && (node.props.accessibilityElementsHidden === true || node.props.importantForAccessibility === "no-hide-descendants")) return true;
  }
  return false;
};
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

  it("a signed-out boot hands off after step 1 — not before the intro, its minimum and its tick being seen", () => {
    const tree = mount();
    act(() => reportBootDestination("/phone"));
    advance(1600);
    expect(released()).toBe(false);
    advance(300); // 1900: step 1 ticked at 1700, its 300ms pop is still on screen
    expect(released()).toBe(false);
    expect(stepLabels(tree)).toEqual(["checked", "pending", "pending"]); // step 2 never goes active
    advance(200);
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
    for (let ms = 0; ms < 2600; ms += 100) {
      advance(100);
      expect(hiddenFromA11y(tree, S.offlineTitle)).toBe(true);
    }
    advance(1500);
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

  it("accessibility: completed steps are announced as done, the offline panel is announced, hidden parts are not read", () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    __setProbeFetch(async () => false);
    const tree = mount();
    // The intro: the card is not on screen yet, so it is not in the accessibility tree; nor is the pill.
    expect(hiddenFromA11y(tree, S.steps[0])).toBe(true);
    expect(hiddenFromA11y(tree, S.slow)).toBe(true);
    act(() => reportBootDestination("/home"));
    advance(1800);
    expect(hiddenFromA11y(tree, S.steps[0])).toBe(false);
    expect(announce).toHaveBeenCalledWith(stepDoneAnnouncement(S.steps[0]));
    expect(stepDoneAnnouncement(S.steps[0])).toBe("Checking it's you, done");
    advance(4000);
    expect(hiddenFromA11y(tree, S.slow)).toBe(false); // slow now: the pill is read
    act(() => reportUnreachable());
    advance(100);
    expect(announce).toHaveBeenCalledWith(`${S.offlineTitle}. ${S.offlineBody}`);
    expect(hiddenFromA11y(tree, S.steps[0])).toBe(true); // the card hides behind the panel
    expect(hiddenFromA11y(tree, S.offlineTitle)).toBe(false);
    announce.mockRestore();
    act(() => tree.unmount());
  });

  it("a root layout remounted after the boot (the ErrorBoundary's Reload) never replays the splash", () => {
    const first = mount();
    act(() => reportBootDestination("/phone"));
    advance(2100);
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

describe("BootSplash · the rider boot (First Run v2 H1/H2, ledger D-80 §2 #2)", () => {
  const riderRows = (tree: renderer.ReactTestRenderer): string[] =>
    tree.root
      .findAll((n) => typeof n.type === "string" && n.props.accessibilityState != null && (RIDER_STEPS as readonly string[]).includes(n.props.accessibilityLabel))
      .map((n) => `${n.props.accessibilityLabel}:${n.props.accessibilityState.checked ? "checked" : n.props.accessibilityState.busy ? "active" : "pending"}`);

  it("runs the rider's two steps and cuts only once the board's first reads have settled", () => {
    const tree = mount();
    act(() => reportBootDestination("/rider"));
    advance(1800);
    expect(riderRows(tree)).toEqual(["Checking it’s you:checked", "Getting jobs near you:active"]);
    // Home's three steps are gone from the card.
    expect(texts(tree)).not.toContain(S.steps[1]);
    advance(4000);
    expect(released()).toBe(false); // the board is still reading
    act(() => reportBootReady("rider"));
    advance(100);
    expect(riderRows(tree)).toEqual(["Checking it’s you:checked", "Getting jobs near you:checked"]);
    advance(400); // the tick is seen, then the cut (no exit into Home)
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  it("a rider boot sent elsewhere before the board mounts (a rejected session → /phone) hands off at once", () => {
    const tree = mount();
    act(() => reportBootDestination("/rider"));
    advance(2500);
    expect(released()).toBe(false);
    act(() => reportBootRoute("/phone"));
    advance(100);
    expect(released()).toBe(true);
    act(() => tree.unmount());
  });

  it("offline swaps the steps for the single row in the card — no dark panel, no button — and resumes by itself", () => {
    __setProbeFetch(async () => false);
    const tree = mount();
    act(() => reportBootDestination("/rider"));
    advance(1500);
    act(() => reportUnreachable());
    advance(600);
    expect(tree.root.findAll((n) => n.props.testID === "splash-offline-row").length).toBeGreaterThan(0);
    expect(texts(tree)).toEqual(expect.arrayContaining([RIDER_OFFLINE.title, RIDER_OFFLINE.body]));
    expect(hiddenFromA11y(tree, S.offlineTitle)).toBe(true); // splash-v1's panel stays out of the way
    expect(hiddenFromA11y(tree, RIDER_OFFLINE.title)).toBe(false);
    act(() => reportReachable());
    advance(100);
    expect(tree.root.findAll((n) => n.props.testID === "splash-offline-row")).toHaveLength(0);
    expect(riderRows(tree).length).toBe(2);
    act(() => tree.unmount());
  });
});
