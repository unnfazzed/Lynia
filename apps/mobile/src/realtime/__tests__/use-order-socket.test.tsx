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
  off: (event: string, cb: (...args: unknown[]) => void) => FakeSocket;
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
    off(event, cb) {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== cb);
      return socket;
    },
    emit: () => socket,
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

describe("useOrderSocket rider presence recovery (BH-25)", () => {
  // Regression guard: the server now pushes presence:recovered role:"rider" when a previously-escalated
  // rider is no longer dark (either a fresh GPS fix resumed, already handled by the `position` handler,
  // or a heartbeat-lag self-heal with NO fresh GPS push coming at all). Before this fix the customer's
  // socket hook had no listener for it, so a self-healed order's "rider offline" card stayed stuck until
  // the ride's next status change.
  // PresenceRecoveredEvent.orderId is a strict `z.string().uuid()` (unlike this file's other fixtures'
  // "order-N" ids) — a non-UUID payload fails safeParse and the handler no-ops before ever reaching the
  // role/orderId checks, so these need real UUIDs to actually exercise the listener.
  const ORDER_4 = "44444444-4444-4444-8444-444444444444";
  const ORDER_5 = "55555555-5555-4555-8555-555555555555";
  const ORDER_6 = "66666666-6666-4666-8666-666666666666";

  it("refetches the order snapshot on presence:recovered role:rider for THIS order", () => {
    const qc = new QueryClient();

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness orderId={ORDER_4} />
        </QueryClientProvider>,
      );
    });

    const spy = jest.spyOn(qc, "invalidateQueries");
    act(() => {
      mockLastSocket.trigger("presence:recovered", { orderId: ORDER_4, role: "rider", at: "2026-07-25T00:00:00Z" });
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: orderKey(ORDER_4) });
  });

  it("ignores presence:recovered role:customer (that's this app's OWN staleness, not the rider's)", () => {
    const qc = new QueryClient();

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness orderId={ORDER_5} />
        </QueryClientProvider>,
      );
    });

    const spy = jest.spyOn(qc, "invalidateQueries");
    spy.mockClear();
    act(() => {
      mockLastSocket.trigger("presence:recovered", { orderId: ORDER_5, role: "customer", at: "2026-07-25T00:00:00Z" });
    });

    expect(spy).not.toHaveBeenCalledWith({ queryKey: orderKey(ORDER_5) });
  });

  it("ignores presence:recovered for a DIFFERENT order id (a leaked cross-order event)", () => {
    const qc = new QueryClient();

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness orderId={ORDER_6} />
        </QueryClientProvider>,
      );
    });

    const spy = jest.spyOn(qc, "invalidateQueries");
    spy.mockClear();
    act(() => {
      mockLastSocket.trigger("presence:recovered", { orderId: "77777777-7777-4777-8777-777777777777", role: "rider", at: "2026-07-25T00:00:00Z" });
    });

    expect(spy).not.toHaveBeenCalledWith({ queryKey: orderKey(ORDER_6) });
  });
});
