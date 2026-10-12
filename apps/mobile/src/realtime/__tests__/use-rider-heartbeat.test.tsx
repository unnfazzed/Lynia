import * as Location from "expo-location";
import { AppState, type AppStateStatus } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ApiError } from "../../api/client";
import { sendHeartbeat } from "../../api/riders";
import { handleBackgroundLocations, RIDER_LOCATION_TASK } from "../background-location-task";
import { HEARTBEAT_MS, MIN_BEAT_GAP_MS, useRiderHeartbeat } from "../use-rider-heartbeat";

let mockSession: { accessToken: string } | null = { accessToken: "tok" };
jest.mock("../../auth/auth-context", () => ({
  useAuth: () => ({ session: mockSession }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock("../../api/riders", () => ({ sendHeartbeat: jest.fn() }));

// background-location-task.ts is used REAL here (it's the bridge under test); only the native
// surfaces beneath it are mocked.
jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
}));

const beatMock = sendHeartbeat as jest.Mock;
const startUpdatesMock = Location.startLocationUpdatesAsync as jest.Mock;
const stopUpdatesMock = Location.stopLocationUpdatesAsync as jest.Mock;
const hasStartedMock = Location.hasStartedLocationUpdatesAsync as jest.Mock;

let appStateListener: ((s: AppStateStatus) => void) | null = null;

const BOARD_LOC = { lat: -17.8, lng: 31.0 };

function Harness({ online, onRefused }: { online: boolean; onRefused: (e: ApiError) => void }): null {
  const { stale } = useRiderHeartbeat(online, () => BOARD_LOC, onRefused);
  lastStale = stale;
  return null;
}
let lastStale = false;

/** Deliver a fix the way the OS would wake the background task (headless, batched). */
function deliverBackgroundFix(lat: number, lng: number): void {
  handleBackgroundLocations({
    data: { locations: [{ coords: { latitude: lat, longitude: lng } }] },
    error: null,
    executionInfo: { eventId: "e1", taskName: RIDER_LOCATION_TASK },
  } as unknown as Parameters<typeof handleBackgroundLocations>[0]);
}

/** Flush the beat's promise chain (fake timers don't touch microtasks). */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function mount(online = true, onRefused: (e: ApiError) => void = jest.fn()): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Harness online={online} onRefused={onRefused} />);
  });
  return tree;
}

/** Move the clock WITHOUT firing timers: a locked phone, where the JS interval doesn't run. */
function lockedFor(ms: number): void {
  jest.setSystemTime(Date.now() + ms);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSession = { accessToken: "tok" };
  lastStale = false;
  beatMock.mockReset().mockResolvedValue({ online: true });
  startUpdatesMock.mockReset().mockResolvedValue(undefined);
  stopUpdatesMock.mockReset().mockResolvedValue(undefined);
  hasStartedMock.mockReset().mockResolvedValue(true);
  appStateListener = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, cb) => {
    appStateListener = cb as (s: AppStateStatus) => void;
    return { remove: () => (appStateListener = null) } as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("useRiderHeartbeat — foreground", () => {
  it("beats every 20 s with the board's position while online", async () => {
    const tree = await mount();

    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    expect(beatMock).toHaveBeenCalledTimes(1);
    expect(beatMock).toHaveBeenLastCalledWith(BOARD_LOC);

    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    expect(beatMock).toHaveBeenCalledTimes(2);

    await act(async () => tree.unmount());
  });

  it("only a 403 takes the rider offline; two other failures in a row report stale", async () => {
    const onRefused = jest.fn();
    const tree = await mount(true, onRefused);

    beatMock.mockRejectedValue(new ApiError(0, "network"));
    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    await settle();
    expect(lastStale).toBe(false);
    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    await settle();
    expect(lastStale).toBe(true);
    expect(onRefused).not.toHaveBeenCalled();

    beatMock.mockRejectedValue(new ApiError(403, "You're offline"));
    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    await settle();
    expect(onRefused).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));

    await act(async () => tree.unmount());
  });

  it("never beats or starts the service while offline", async () => {
    const tree = await mount(false);

    act(() => jest.advanceTimersByTime(HEARTBEAT_MS * 3));
    deliverBackgroundFix(-17.83, 31.05);

    expect(beatMock).not.toHaveBeenCalled();
    expect(startUpdatesMock).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  });
});

describe("useRiderHeartbeat — phone locked (background location task)", () => {
  it("starts the background task at the online rate the moment the rider is online", async () => {
    const tree = await mount();

    expect(startUpdatesMock).toHaveBeenCalledWith(RIDER_LOCATION_TASK, expect.objectContaining({ timeInterval: 25_000 }));

    await act(async () => tree.unmount());
  });

  it("beats off background fixes, carrying the fix, when the JS timer is paused", async () => {
    const tree = await mount();

    lockedFor(25_000);
    deliverBackgroundFix(-17.83, 31.05);
    expect(beatMock).toHaveBeenCalledTimes(1);
    expect(beatMock).toHaveBeenLastCalledWith({ lat: -17.83, lng: 31.05 });

    lockedFor(25_000);
    deliverBackgroundFix(-17.84, 31.06);
    expect(beatMock).toHaveBeenCalledTimes(2);
    expect(beatMock).toHaveBeenLastCalledWith({ lat: -17.84, lng: 31.06 });

    await act(async () => tree.unmount());
  });

  it("never beats more often than every 20 s, whichever clock fires", async () => {
    const tree = await mount();

    // Right after going online (which stamped the heartbeat server-side): no beat yet.
    deliverBackgroundFix(-17.83, 31.05);
    expect(beatMock).not.toHaveBeenCalled();

    lockedFor(MIN_BEAT_GAP_MS);
    deliverBackgroundFix(-17.83, 31.05);
    expect(beatMock).toHaveBeenCalledTimes(1);

    // A burst of fixes (the job rate, a batched wake-up) inside the gap: still one beat.
    lockedFor(MIN_BEAT_GAP_MS - 1);
    deliverBackgroundFix(-17.84, 31.06);
    deliverBackgroundFix(-17.85, 31.07);
    expect(beatMock).toHaveBeenCalledTimes(1);

    await act(async () => tree.unmount());
  });

  it("a 403 on a background beat reaches onRefused like a foreground one", async () => {
    const onRefused = jest.fn();
    beatMock.mockRejectedValue(new ApiError(403, "You're offline"));
    const tree = await mount(true, onRefused);

    lockedFor(25_000);
    deliverBackgroundFix(-17.83, 31.05);
    await settle();

    expect(onRefused).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));

    await act(async () => tree.unmount());
  });

  it("going offline (incl. the 403 path) unhooks the bridge and stops the service", async () => {
    const onRefused = jest.fn();
    const tree = await mount(true, onRefused);

    await act(async () => tree.update(<Harness online={false} onRefused={onRefused} />));

    expect(stopUpdatesMock).toHaveBeenCalledWith(RIDER_LOCATION_TASK);
    // A straggler fix racing the async native stop goes nowhere (privacy gate).
    lockedFor(25_000);
    deliverBackgroundFix(-17.83, 31.05);
    expect(beatMock).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  });

  it("signing out stops the service and the beats, even if the board is still mounted", async () => {
    const onRefused = jest.fn();
    const tree = await mount(true, onRefused);

    mockSession = null;
    await act(async () => tree.update(<Harness online onRefused={onRefused} />));

    expect(stopUpdatesMock).toHaveBeenCalledWith(RIDER_LOCATION_TASK);
    lockedFor(25_000);
    deliverBackgroundFix(-17.83, 31.05);
    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));
    expect(beatMock).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  });

  it("re-tries the start on resume when Android refused it (started from the background)", async () => {
    startUpdatesMock.mockRejectedValueOnce(new Error("ForegroundServiceStartNotAllowed"));
    hasStartedMock.mockResolvedValue(false);
    const tree = await mount();
    expect(startUpdatesMock).toHaveBeenCalledTimes(1);

    await act(async () => appStateListener?.("active"));

    expect(startUpdatesMock).toHaveBeenCalledTimes(2);

    await act(async () => tree.unmount());
  });

  it("degrades to the foreground beat when the service can't start (iOS without 'always')", async () => {
    startUpdatesMock.mockRejectedValue(new Error("Missing background permission"));
    const tree = await mount();

    act(() => jest.advanceTimersByTime(HEARTBEAT_MS));

    expect(beatMock).toHaveBeenCalledWith(BOARD_LOC);

    await act(async () => tree.unmount());
  });
});
