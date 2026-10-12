import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as task from "../background-location-task";
import { RP } from "../../ui/firstrun/copy";

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
  // first test asserts on) and unhook both bridges.
  startMock.mockReset().mockResolvedValue(undefined);
  stopMock.mockReset().mockResolvedValue(undefined);
  hasStartedMock.mockReset().mockResolvedValue(true);
  task.setBackgroundFixForwarder(null);
  task.setOnlineFixForwarder(null);
});

// The module's intent flags outlive a test: drop every intent with nothing "running" so the next test
// starts from stopped (hasStarted=false keeps these stops off the native stop call).
afterEach(async () => {
  hasStartedMock.mockReset().mockResolvedValue(false);
  await task.stopRiderOnlineUpdates();
  await task.stopRiderBackgroundUpdates();
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

  it("stops an orphaned task: a wake-up with no forwarder and no intent (a headless restart)", async () => {
    // Android persisted the registration; the process came back headless with fresh, empty state.
    task.handleBackgroundLocations(body([[-17.83, 31.05]]));
    await new Promise((r) => setImmediate(r));

    expect(stopMock).toHaveBeenCalledWith(task.RIDER_LOCATION_TASK);
  });

  it("forwards to the online (heartbeat) forwarder while the rider is online", () => {
    const beats: Array<{ lat: number; lng: number }> = [];
    task.setOnlineFixForwarder((c) => beats.push(c));

    task.handleBackgroundLocations(body([[-17.83, 31.05], [-17.84, 31.06]]));

    expect(beats).toEqual([{ lat: -17.84, lng: 31.06 }]);
  });

  it("during a job feeds BOTH the job stream and the heartbeat the same freshest fix", () => {
    const stream: Array<{ lat: number; lng: number }> = [];
    const beats: Array<{ lat: number; lng: number }> = [];
    task.setBackgroundFixForwarder((c) => stream.push(c));
    task.setOnlineFixForwarder((c) => beats.push(c));

    task.handleBackgroundLocations(body([[-17.85, 31.07]]));

    expect(stream).toEqual([{ lat: -17.85, lng: 31.07 }]);
    expect(beats).toEqual([{ lat: -17.85, lng: 31.07 }]);
  });

  it("stops forwarding to the heartbeat once the rider goes offline (the online privacy gate)", () => {
    const beats: Array<{ lat: number; lng: number }> = [];
    task.setOnlineFixForwarder((c) => beats.push(c));
    task.setOnlineFixForwarder(null);

    task.handleBackgroundLocations(body([[-17.83, 31.05]]));

    expect(beats).toEqual([]);
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

  it("shows the drawn First Run v2 notification (RP.fgsTitle / RP.fgsBody)", async () => {
    await task.startRiderBackgroundUpdates();

    expect(startMock.mock.calls[0][1].foregroundService).toEqual(
      expect.objectContaining({ notificationTitle: RP.fgsTitle, notificationBody: RP.fgsBody }),
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

describe("idle-online mode (one task, one service)", () => {
  it("starts the low online rate: 25 s, no distance filter (a parked rider must still beat), same notification", async () => {
    await task.startRiderOnlineUpdates();

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledWith(
      task.RIDER_LOCATION_TASK,
      expect.objectContaining({
        timeInterval: 25_000,
        distanceInterval: 0,
        foregroundService: expect.objectContaining({ notificationTitle: RP.fgsTitle, notificationBody: RP.fgsBody }),
      }),
    );
  });

  it("a job switches the SAME task to the job rate, and its end switches back — never a second task, never a stop", async () => {
    await task.startRiderOnlineUpdates();
    await task.startRiderBackgroundUpdates();
    await task.stopRiderBackgroundUpdates();

    const rates = startMock.mock.calls.map(([name, opts]) => [name, opts.timeInterval]);
    expect(rates).toEqual([
      [task.RIDER_LOCATION_TASK, 25_000],
      [task.RIDER_LOCATION_TASK, 10_000],
      [task.RIDER_LOCATION_TASK, 25_000],
    ]);
    expect(stopMock).not.toHaveBeenCalled();
  });

  it("going offline mid-job leaves the job stream untouched", async () => {
    await task.startRiderOnlineUpdates();
    await task.startRiderBackgroundUpdates();
    startMock.mockClear();

    await task.stopRiderOnlineUpdates();

    expect(startMock).not.toHaveBeenCalled();
    expect(stopMock).not.toHaveBeenCalled();
  });

  it("stops the service when the rider goes offline with no job", async () => {
    await task.startRiderOnlineUpdates();
    await task.stopRiderOnlineUpdates();

    expect(stopMock).toHaveBeenCalledWith(task.RIDER_LOCATION_TASK);
  });

  it("a job that ends while not online stops the service (no online rate to fall back to)", async () => {
    await task.startRiderBackgroundUpdates();
    await task.stopRiderBackgroundUpdates();

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(stopMock).toHaveBeenCalledWith(task.RIDER_LOCATION_TASK);
  });

  it("on resume, re-tries a start Android refused in the background", async () => {
    // Android won't start a location foreground service from the background (ForegroundServiceStartNotAllowed).
    startMock.mockRejectedValueOnce(new Error("ForegroundServiceStartNotAllowed"));
    hasStartedMock.mockResolvedValue(false);
    await task.startRiderOnlineUpdates();

    await task.resumeRiderBackgroundUpdates();

    expect(startMock).toHaveBeenCalledTimes(2);
    expect(startMock.mock.calls[1][1]).toEqual(expect.objectContaining({ timeInterval: 25_000 }));
  });

  it("on resume, finishes a job → online switch that was refused in the background", async () => {
    await task.startRiderOnlineUpdates();
    await task.startRiderBackgroundUpdates();
    // The job ends behind Google Maps: the switch back to the online rate is refused.
    startMock.mockRejectedValueOnce(new Error("ForegroundServiceStartNotAllowed"));
    await task.stopRiderBackgroundUpdates();
    startMock.mockClear();

    await task.resumeRiderBackgroundUpdates();

    expect(startMock).toHaveBeenCalledWith(task.RIDER_LOCATION_TASK, expect.objectContaining({ timeInterval: 25_000 }));
  });

  it("on resume, leaves a service already in the right mode alone", async () => {
    await task.startRiderOnlineUpdates();
    startMock.mockClear();

    await task.resumeRiderBackgroundUpdates();

    expect(startMock).not.toHaveBeenCalled();
  });

  it("on resume, does nothing when the rider is neither online nor on a job", async () => {
    await task.resumeRiderBackgroundUpdates();

    expect(startMock).not.toHaveBeenCalled();
  });

  it("an offline that lands while the online start is in flight leaves the task STOPPED", async () => {
    let resolveStart!: () => void;
    startMock.mockReturnValue(new Promise<void>((r) => (resolveStart = r)));
    hasStartedMock.mockResolvedValue(false);

    const startP = task.startRiderOnlineUpdates();
    await task.stopRiderOnlineUpdates();

    hasStartedMock.mockResolvedValue(true);
    resolveStart();
    await startP;

    expect(stopMock).toHaveBeenCalledWith(task.RIDER_LOCATION_TASK);
  });
});
