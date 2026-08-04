import { WS_EVENTS } from "@lynia/shared";
import * as Location from "expo-location";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { handleBackgroundLocations, RIDER_LOCATION_TASK } from "../background-location-task";
import { useRiderLocationStream } from "../use-rider-location";

jest.mock("../../auth/auth-context", () => ({
  useAuth: () => ({ session: { accessToken: "tok" } }),
}));

// background-location-task.ts is used REAL here (it's the bridge under test); only the native
// surfaces beneath it are mocked.
jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
}));

const requestPermMock = Location.requestForegroundPermissionsAsync as jest.Mock;
const watchMock = Location.watchPositionAsync as jest.Mock;
const startUpdatesMock = Location.startLocationUpdatesAsync as jest.Mock;
const stopUpdatesMock = Location.stopLocationUpdatesAsync as jest.Mock;
const hasStartedMock = Location.hasStartedLocationUpdatesAsync as jest.Mock;

type FakeSocket = {
  on: (event: string, cb: (...args: unknown[]) => void) => FakeSocket;
  off: (event: string, cb: (...args: unknown[]) => void) => FakeSocket;
  emit: jest.Mock;
  disconnect: () => void;
  trigger: (event: string, ...args: unknown[]) => void;
};

function mockCreateFakeSocket(): FakeSocket {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const socket: FakeSocket = {
    on(event, cb) {
      (handlers[event] ??= []).push(cb);
      return socket;
    },
    off(event, cb) {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== cb);
      return socket;
    },
    emit: jest.fn(),
    disconnect: () => {},
    trigger: (event, ...args) => (handlers[event] ?? []).forEach((cb) => cb(...args)),
  };
  return socket;
}

let mockLastSocket: FakeSocket;
// A-O17: the hook now acquires/releases a shared connection instead of creating/disconnecting its
// own — see use-rider-board.test.tsx's matching comment.
jest.mock("../socket", () => ({
  acquireSocket: jest.fn(() => {
    mockLastSocket = mockCreateFakeSocket();
    return mockLastSocket;
  }),
  releaseSocket: jest.fn(),
}));

function Harness({ orderId }: { orderId: string | null }): null {
  useRiderLocationStream(orderId);
  return null;
}

/** Deliver a fix the way the OS would wake the background task (headless, batched). */
function deliverBackgroundFix(lat: number, lng: number): void {
  handleBackgroundLocations({
    data: { locations: [{ coords: { latitude: lat, longitude: lng } }] },
    error: null,
    executionInfo: { eventId: "e1", taskName: RIDER_LOCATION_TASK },
  } as unknown as Parameters<typeof handleBackgroundLocations>[0]);
}

async function mountStream(orderId: string): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  // The hook's effect body is async (permission → socket → watch); flush it inside act.
  await act(async () => {
    tree = create(<Harness orderId={orderId} />);
  });
  return tree;
}

beforeEach(() => {
  requestPermMock.mockReset().mockResolvedValue({ status: "granted" });
  watchMock.mockReset().mockResolvedValue({ remove: jest.fn() });
  startUpdatesMock.mockReset().mockResolvedValue(undefined);
  stopUpdatesMock.mockReset().mockResolvedValue(undefined);
  hasStartedMock.mockReset().mockResolvedValue(true);
});

describe("useRiderLocationStream background continuation", () => {
  it("starts background updates alongside the foreground watch when a job goes active", async () => {
    const tree = await mountStream("order-1");

    expect(watchMock).toHaveBeenCalled();
    expect(startUpdatesMock).toHaveBeenCalledWith(RIDER_LOCATION_TASK, expect.any(Object));

    await act(async () => tree.unmount());
  });

  it("routes a headless background fix through the SAME socket path as a foreground fix", async () => {
    const tree = await mountStream("order-1");
    act(() => mockLastSocket.trigger("connect"));

    deliverBackgroundFix(-17.83, 31.05);

    expect(mockLastSocket.emit).toHaveBeenCalledWith(WS_EVENTS.riderLocation, {
      orderId: "order-1",
      lat: -17.83,
      lng: 31.05,
    });

    await act(async () => tree.unmount());
  });

  it("coalesces background fixes while the socket is down and flushes the freshest on reconnect", async () => {
    const tree = await mountStream("order-1");
    // Never triggered "connect" — the link is down; both fixes must be held, not emitted.
    deliverBackgroundFix(-17.83, 31.05);
    deliverBackgroundFix(-17.84, 31.06);
    expect(mockLastSocket.emit).not.toHaveBeenCalled();

    act(() => mockLastSocket.trigger("connect"));

    // Only the FRESHEST held fix flushes (PendingFix semantics), same as the foreground stream.
    expect(mockLastSocket.emit).toHaveBeenCalledTimes(1);
    expect(mockLastSocket.emit).toHaveBeenCalledWith(WS_EVENTS.riderLocation, {
      orderId: "order-1",
      lat: -17.84,
      lng: 31.06,
    });

    await act(async () => tree.unmount());
  });

  it("stops background updates AND unhooks the bridge when the active-job gate closes", async () => {
    const tree = await mountStream("order-1");
    act(() => mockLastSocket.trigger("connect"));
    const emit = mockLastSocket.emit;

    await act(async () => tree.unmount());

    // The service is told to stop…
    expect(stopUpdatesMock).toHaveBeenCalledWith(RIDER_LOCATION_TASK);
    // …and a straggler task invocation racing the async native stop goes nowhere (privacy gate).
    deliverBackgroundFix(-17.85, 31.07);
    expect(emit).not.toHaveBeenCalledWith(WS_EVENTS.riderLocation, expect.objectContaining({ lat: -17.85 }));
  });

  it("never attempts background updates when foreground permission is denied (PR #188 path intact)", async () => {
    requestPermMock.mockResolvedValue({ status: "denied" });

    const tree = await mountStream("order-1");

    expect(startUpdatesMock).not.toHaveBeenCalled();
    expect(watchMock).not.toHaveBeenCalled();

    await act(async () => tree.unmount());
  });

  it("keeps the foreground stream alive when the background start rejects (silent degrade)", async () => {
    startUpdatesMock.mockRejectedValue(new Error("Missing background permission"));

    const tree = await mountStream("order-1");
    act(() => mockLastSocket.trigger("connect"));

    // Foreground watch still streams: replay its callback with a fix and expect a live emit.
    const onFix = watchMock.mock.calls[0][1] as (loc: { coords: { latitude: number; longitude: number } }) => void;
    act(() => onFix({ coords: { latitude: -17.9, longitude: 31.1 } }));
    expect(mockLastSocket.emit).toHaveBeenCalledWith(WS_EVENTS.riderLocation, {
      orderId: "order-1",
      lat: -17.9,
      lng: 31.1,
    });

    await act(async () => tree.unmount());
  });
});
