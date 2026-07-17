import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { act, create } from "react-test-renderer";
import type { OrderSnapshot } from "../../api/orders";
import { orderKey } from "../../query/client";
import { HISTORY_KEY } from "../../query/use-history-feed";
import { useOrderSocket } from "../use-order-socket";

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
  useOrderSocket(orderId);
  return null;
}

const baseSnapshot: OrderSnapshot = {
  id: "order-1",
  status: "assigned",
  agreedFare: "5.00",
  proposedFare: "5.00",
  pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" },
  dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" },
  rider: { profileId: "r1", currentLat: 0, currentLng: 0, updatedAt: null },
  events: [],
  counterpartyPhone: null,
  expiresAt: null,
};

describe("useOrderSocket tracking (out-of-order position vs. REST refetch)", () => {
  // Regression guard: a slow REST refetch resolving AFTER a fresher live "position" push used to
  // unconditionally overwrite the cache, rolling the rider's pin backward on a flaky connection — the
  // exact profile this app targets. A refetch must never regress a position we've already applied.
  it("re-applies the freshest live position after a refetch settles with an older one", async () => {
    const qc = new QueryClient();
    qc.setQueryData(orderKey("order-1"), baseSnapshot);

    await act(async () => {
      create(
        <QueryClientProvider client={qc}>
          <Harness orderId="order-1" />
        </QueryClientProvider>,
      );
    });

    // A fresh live position streams in over the socket.
    await act(async () => {
      mockLastSocket.trigger("position", { lat: 10, lng: 10, at: "2026-07-12T00:05:00.000Z" });
    });
    expect(qc.getQueryData<OrderSnapshot>(orderKey("order-1"))?.rider?.updatedAt).toBe("2026-07-12T00:05:00.000Z");

    // Simulate the in-flight REST refetch (triggered by "connect") resolving with an OLDER position —
    // a slow response racing the push above. invalidateQueries has no active observer in this harness
    // (no useQuery mounted), so it resolves as a no-op; the stale write below stands in for what a real
    // REST response would otherwise clobber the cache with.
    qc.setQueryData<OrderSnapshot>(orderKey("order-1"), (prev) => ({
      ...prev!,
      rider: { ...prev!.rider!, currentLat: 2, currentLng: 2, updatedAt: "2026-07-12T00:03:00.000Z" },
    }));

    await act(async () => {
      mockLastSocket.trigger("connect");
      await Promise.resolve();
      await Promise.resolve();
    });

    const final = qc.getQueryData<OrderSnapshot>(orderKey("order-1"));
    expect(final?.rider?.updatedAt).toBe("2026-07-12T00:05:00.000Z");
    expect(final?.rider?.currentLat).toBe(10);
    expect(final?.rider?.currentLng).toBe(10);
  });
});

describe("useOrderSocket Trip History self-heal (WD-022)", () => {
  // Regression guard: a delivered/cancelled/undelivered transition self-healed via this socket's
  // connect/order:status handlers (rather than through the party's own mutation onSuccess) used to
  // invalidate only the order snapshot — Trip History never refreshed, so a customer who'd checked it
  // moments earlier saw a stale list.
  it("also invalidates Trip History on connect", () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness orderId="order-2" />
        </QueryClientProvider>,
      );
    });

    spy.mockClear();
    act(() => {
      mockLastSocket.trigger("connect");
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: HISTORY_KEY });
  });

  it("also invalidates Trip History on order:status", () => {
    const qc = new QueryClient();

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness orderId="order-3" />
        </QueryClientProvider>,
      );
    });

    const spy = jest.spyOn(qc, "invalidateQueries");
    act(() => {
      mockLastSocket.trigger("order:status");
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: HISTORY_KEY });
  });
});
