import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { act, create } from "react-test-renderer";
import { useRiderJobSocket } from "../use-rider-job-socket";

jest.mock("../../auth/auth-context", () => ({
  useAuth: () => ({ session: { accessToken: "tok" } }),
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

function Harness({ orderId }: { orderId: string }): null {
  useRiderJobSocket(orderId, () => {});
  return null;
}

describe("useRiderJobSocket reconnect self-heal", () => {
  // Regression guard: a push missed while the rider's socket was down used to only self-heal via
  // the order:status event — the connect/connect_error handlers didn't refetch, so a rider who
  // reconnected without an intervening status push saw a stale activeJob until the next 6s poll.
  it("invalidates the activeJob query on connect", () => {
    const qc = new QueryClient();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness orderId="order-1" />
        </QueryClientProvider>,
      );
    });

    invalidateSpy.mockClear();
    act(() => {
      mockLastSocket.trigger("connect");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["activeJob"] });
  });

  it("also self-heals on connect_error, not just a clean connect", () => {
    const qc = new QueryClient();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness orderId="order-2" />
        </QueryClientProvider>,
      );
    });

    invalidateSpy.mockClear();
    act(() => {
      mockLastSocket.trigger("connect_error");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["activeJob"] });
  });
});
