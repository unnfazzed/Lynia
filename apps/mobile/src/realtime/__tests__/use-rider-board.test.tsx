import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { act, create } from "react-test-renderer";
import { useRiderBoard } from "../use-rider-board";

jest.mock("../../auth/auth-context", () => ({
  useAuth: () => ({ session: { accessToken: "tok" } }),
}));

jest.mock("../../telemetry/rum", () => ({
  clampGlassSample: jest.fn(() => null),
  enqueue: jest.fn(),
  noteDropped: jest.fn(),
  setActiveRole: jest.fn(),
}));

type FakeSocket = {
  on: (event: string, cb: (...args: unknown[]) => void) => FakeSocket;
  emit: () => FakeSocket;
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
    emit: () => socket,
    disconnect: () => {},
    trigger: (event, ...args) => (handlers[event] ?? []).forEach((cb) => cb(...args)),
  };
  return socket;
}

let mockLastSocket: FakeSocket;
jest.mock("../socket", () => ({
  createSocket: jest.fn(() => {
    mockLastSocket = mockCreateFakeSocket();
    return mockLastSocket;
  }),
}));

function Harness({ online }: { online: boolean }): null {
  useRiderBoard(online, null);
  return null;
}

// Regression guard (bug-hunt 2026-07-16): a rider who wins a bid (`order:taken`) while backgrounded
// with the board socket down used to only self-heal ["openOrders"] on reconnect — ["activeJob"] (the
// query that surfaces "you have an active job") was never invalidated, so the missed win stayed
// invisible until an app kill/relaunch or a tapped FCM push.
describe("useRiderBoard reconnect self-heal", () => {
  it("invalidates BOTH openOrders and activeJob on connect", () => {
    const qc = new QueryClient();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness online={true} />
        </QueryClientProvider>,
      );
    });

    invalidateSpy.mockClear();
    act(() => {
      mockLastSocket.trigger("connect");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["openOrders"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["activeJob"] });
  });

  it("also self-heals both queries on connect_error, not just a clean connect", () => {
    const qc = new QueryClient();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness online={true} />
        </QueryClientProvider>,
      );
    });

    invalidateSpy.mockClear();
    act(() => {
      mockLastSocket.trigger("connect_error");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["openOrders"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["activeJob"] });
  });
});
