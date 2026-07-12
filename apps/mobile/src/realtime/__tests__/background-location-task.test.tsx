import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as task from "../background-location-task";

// Pure mocks (no jest-expo native shims needed): the module under test only touches these calls.
jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
}));

const startMock = Location.startLocationUpdatesAsync as jest.Mock;
const stopMock = Location.stopLocationUpdatesAsync as jest.Mock;
const hasStartedMock = Location.hasStartedLocationUpdatesAsync as jest.Mock;

beforeEach(() => {
  // Reset ONLY the location mocks (not defineTask — its call record is the module-load evidence the
  // first test asserts on) and unhook the bridge. The module's start/stop intent flag deliberately
  // isn't reset: every test below establishes its own intent via start/stop before asserting.
  startMock.mockReset().mockResolvedValue(undefined);
  stopMock.mockReset().mockResolvedValue(undefined);
  hasStartedMock.mockReset().mockResolvedValue(true);
  task.setBackgroundFixForwarder(null);
});

/** Build a minimal task body; expo delivers `{ locations }` batches for location tasks. */
function body(coords: Array<[number, number]>, error: { code: string; message: string } | null = null) {
  return {
    // Only the fields the handler reads are realistic; the rest of LocationObject is irrelevant here.
    data: { locations: coords.map(([lat, lng]) => ({ coords: { latitude: lat, longitude: lng } })) },
    error,
    executionInfo: { eventId: "e1", taskName: task.RIDER_LOCATION_TASK },
  } as unknown as Parameters<typeof task.handleBackgroundLocations>[0];
}

describe("background location task definition", () => {
  it("defines the task at module scope (Expo requires definition outside the React lifecycle)", () => {
    expect(TaskManager.defineTask).toHaveBeenCalledWith(task.RIDER_LOCATION_TASK, expect.any(Function));
  });
});

describe("headless fix forwarding bridge", () => {
  it("forwards only the FRESHEST fix from a batched wake-up (breadcrumb trail dropped)", () => {
    const fixes: Array<{ lat: number; lng: number }> = [];
    task.setBackgroundFixForwarder((c) => fixes.push(c));

    task.handleBackgroundLocations(body([[-17.83, 31.05], [-17.84, 31.06], [-17.85, 31.07]]));

    expect(fixes).toEqual([{ lat: -17.85, lng: 31.07 }]);
  });

  it("drops fixes when no forwarder is registered — no active job means nothing may be streamed", () => {
    // No registration at all: must not throw when the OS wakes the task anyway.
    expect(() => task.handleBackgroundLocations(body([[-17.83, 31.05]]))).not.toThrow();
  });

  it("stops forwarding after the hook unregisters (the cleanup half of the privacy gate)", () => {
    const fixes: Array<{ lat: number; lng: number }> = [];
    task.setBackgroundFixForwarder((c) => fixes.push(c));
    task.setBackgroundFixForwarder(null);

    task.handleBackgroundLocations(body([[-17.83, 31.05]]));

    expect(fixes).toEqual([]);
  });

  it("ignores errored invocations and empty batches", () => {
    const fixes: Array<{ lat: number; lng: number }> = [];
    task.setBackgroundFixForwarder((c) => fixes.push(c));

    task.handleBackgroundLocations(body([[-17.83, 31.05]], { code: "E_X", message: "gps off" }));
    task.handleBackgroundLocations(body([]));

    expect(fixes).toEqual([]);
  });
});

describe("startRiderBackgroundUpdates", () => {
  it("starts the task with the foreground-service options and the foreground stream's throttling", async () => {
    await task.startRiderBackgroundUpdates();

    expect(startMock).toHaveBeenCalledWith(
      task.RIDER_LOCATION_TASK,
      expect.objectContaining({
        distanceInterval: 25,
        timeInterval: 10_000,
        pausesUpdatesAutomatically: false,
        foregroundService: expect.objectContaining({
          notificationTitle: expect.any(String),
          notificationBody: expect.any(String),
        }),
      }),
    );
  });

  it("degrades silently when the native start rejects (iOS without background permission, Expo Go)", async () => {
    startMock.mockRejectedValue(new Error("Missing background permission"));

    await expect(task.startRiderBackgroundUpdates()).resolves.toBeUndefined();
  });
});

describe("stopRiderBackgroundUpdates", () => {
  it("stops the task when it is running", async () => {
    await task.startRiderBackgroundUpdates();
    await task.stopRiderBackgroundUpdates();

    expect(stopMock).toHaveBeenCalledWith(task.RIDER_LOCATION_TASK);
  });

  it("no-ops when the task never started (hasStartedLocationUpdatesAsync guard)", async () => {
    hasStartedMock.mockResolvedValue(false);

    await task.stopRiderBackgroundUpdates();

    expect(stopMock).not.toHaveBeenCalled();
  });

  it("swallows a native stop failure — teardown must never crash the job flow", async () => {
    await task.startRiderBackgroundUpdates();
    stopMock.mockRejectedValue(new Error("native"));

    await expect(task.stopRiderBackgroundUpdates()).resolves.toBeUndefined();
  });
});

describe("start/stop races (last intent wins, tie-break = stopped)", () => {
  it("a stop issued while the start is still in flight leaves the task STOPPED", async () => {
    // The job gets cancelled right as it went active: effect cleanup fires stop while the native
    // start promise is unresolved. The privacy-critical outcome is that streaming ends up OFF.
    let resolveStart!: () => void;
    startMock.mockReturnValue(new Promise<void>((r) => (resolveStart = r)));
    // Until the deferred start resolves, nothing is running yet.
    hasStartedMock.mockResolvedValue(false);

    const startP = task.startRiderBackgroundUpdates();
    await task.stopRiderBackgroundUpdates(); // saw hasStarted=false → nothing to stop *yet*

    hasStartedMock.mockResolvedValue(true);
    resolveStart();
    await startP; // start notices the stop intent expressed after it and cleans itself up

    expect(stopMock).toHaveBeenCalledWith(task.RIDER_LOCATION_TASK);
  });

  it("a start issued while the old stop's hasStarted check is in flight is NOT killed", async () => {
    // New job accepted immediately after the old one closed: the old cleanup's async stop must not
    // shoot down the new job's freshly-started stream.
    await task.startRiderBackgroundUpdates();
    let resolveHasStarted!: (v: boolean) => void;
    hasStartedMock.mockReturnValue(new Promise<boolean>((r) => (resolveHasStarted = r)));

    const stopP = task.stopRiderBackgroundUpdates(); // old job's cleanup, check in flight
    await task.startRiderBackgroundUpdates(); // new job's start lands meanwhile
    resolveHasStarted(true);
    await stopP;

    expect(stopMock).not.toHaveBeenCalled();
  });
});
