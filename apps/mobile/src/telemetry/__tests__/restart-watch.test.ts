/**
 * Unclean-restart tracking (src/telemetry/restart-watch.ts): a cold start after a run that ended on
 * screen (crash or OS kill) reports `app_unclean_restart` with the route it died on; a clean exit or a
 * first launch reports nothing.
 */
const mockStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore[k] = v;
  },
}));
const mockTrack = jest.fn();
jest.mock("../events", () => ({
  EVENTS: { uncleanRestart: "app_unclean_restart" },
  track: (e: string, p: unknown) => mockTrack(e, p),
}));
let mockAppStateListener: ((s: string) => void) | null = null;
jest.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: (_: string, l: (s: string) => void) => {
      mockAppStateListener = l;
      return { remove: () => undefined };
    },
  },
}));

import {
  __resetRestartWatch,
  noteScreen,
  parseMarker,
  restartReport,
  SESSION_MARKER_KEY,
  startRestartWatch,
} from "../restart-watch";

const flush = (): Promise<void> => new Promise((r) => setImmediate(r));
const stored = (): unknown => JSON.parse(mockStore[SESSION_MARKER_KEY] ?? "null");

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockTrack.mockClear();
  mockAppStateListener = null;
  __resetRestartWatch();
});

describe("restartReport", () => {
  it("reports only a run that ended on screen", () => {
    expect(restartReport(null)).toBeNull();
    expect(restartReport({ screen: "/rider/(tabs)", clean: true })).toBeNull();
    expect(restartReport({ screen: "/rider/offer/[jobId]", clean: false })).toEqual({ last_screen: "/rider/offer/[jobId]" });
  });

  it("treats a missing or corrupt marker as a first launch", () => {
    expect(parseMarker(null)).toBeNull();
    expect(parseMarker("{not json")).toBeNull();
    expect(parseMarker(JSON.stringify({ screen: 3, clean: false }))).toBeNull();
  });
});

describe("startRestartWatch", () => {
  it("reports nothing on a first launch, then keeps this run's marker", async () => {
    await startRestartWatch();
    expect(mockTrack).not.toHaveBeenCalled();
    expect(stored()).toEqual({ screen: "/", clean: false });
  });

  it("reports the screen a run died on", async () => {
    mockStore[SESSION_MARKER_KEY] = JSON.stringify({ screen: "/rider/job", clean: false });
    await startRestartWatch();
    expect(mockTrack).toHaveBeenCalledWith("app_unclean_restart", { last_screen: "/rider/job" });
  });

  it("does not report a run that went to the background first", async () => {
    mockStore[SESSION_MARKER_KEY] = JSON.stringify({ screen: "/rider/job", clean: true });
    await startRestartWatch();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("never writes over the previous marker before reading it", async () => {
    mockStore[SESSION_MARKER_KEY] = JSON.stringify({ screen: "/rider/offer/[jobId]", clean: false });
    noteScreen("/rider/(tabs)"); // the tracker fires before the read lands
    await flush();
    expect(stored()).toEqual({ screen: "/rider/offer/[jobId]", clean: false });
    await startRestartWatch();
    expect(mockTrack).toHaveBeenCalledWith("app_unclean_restart", { last_screen: "/rider/offer/[jobId]" });
    expect(stored()).toEqual({ screen: "/rider/(tabs)", clean: false });
  });

  it("tracks the screen while on screen and marks clean on background, unclean on return", async () => {
    await startRestartWatch();
    noteScreen("/rider/offer/[jobId]");
    await flush();
    expect(stored()).toEqual({ screen: "/rider/offer/[jobId]", clean: false });
    mockAppStateListener?.("background");
    await flush();
    expect(stored()).toEqual({ screen: "/rider/offer/[jobId]", clean: true });
    mockAppStateListener?.("active");
    await flush();
    expect(stored()).toEqual({ screen: "/rider/offer/[jobId]", clean: false });
  });

  it("runs once per launch", async () => {
    mockStore[SESSION_MARKER_KEY] = JSON.stringify({ screen: "/a", clean: false });
    await startRestartWatch();
    await startRestartWatch();
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });
});
