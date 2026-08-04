import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { act, create } from "react-test-renderer";
import { EARNINGS_SUMMARY_KEY, HISTORY_KEY } from "../../query/use-history-feed";
import { useRiderJobSocket } from "../use-rider-job-socket";

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
  useRiderJobSocket(orderId, () => {});
  return null;
}

function PresenceHarness({
  orderId,
  onCustomerStale,
  onCustomerRecovered,
}: {
  orderId: string;
  onCustomerStale?: () => void;
  onCustomerRecovered?: () => void;
}): null {
  useRiderJobSocket(orderId, () => {}, onCustomerStale, onCustomerRecovered);
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

  // WD-022: a delivered/cancelled/undelivered transition self-healed via this reconnect path (rather
  // than through deliverM/cancelM/undeliverM's own onSuccess) used to invalidate only `["activeJob"]` —
  // Trip History and the earnings aggregate never refreshed, so a rider who'd checked either screen
  // moments earlier saw a stale total/list with no indication anything was stale.
  // Regression guard: connect_error immediately followed by connect (a reconnect flap in a dead
  // zone) used to fire two independent full-cost refetches; the gate should collapse a burst
  // like this into one, and still let a genuine order:status push refetch right after.
  it("only refetches once for a connect_error immediately followed by connect (B-O5)", () => {
    const qc = new QueryClient();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness orderId="order-7" />
        </QueryClientProvider>,
      );
    });

    invalidateSpy.mockClear();
    act(() => {
      mockLastSocket.trigger("connect_error");
      mockLastSocket.trigger("connect");
    });

    const activeJobRefetches = invalidateSpy.mock.calls.filter(
      ([arg]) => JSON.stringify((arg as { queryKey: unknown }).queryKey) === JSON.stringify(["activeJob"]),
    );
    expect(activeJobRefetches).toHaveLength(1);
  });

  it("still refetches on a genuine order:status push even right after a connect (B-O5, not reconnect noise)", () => {
    const qc = new QueryClient();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness orderId="order-8" />
        </QueryClientProvider>,
      );
    });

    act(() => {
      mockLastSocket.trigger("connect");
    });

    invalidateSpy.mockClear();
    act(() => {
      mockLastSocket.trigger("order:status");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["activeJob"] });
  });

  it("also invalidates Trip History and the earnings summary on connect", () => {
    const qc = new QueryClient();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness orderId="order-6" />
        </QueryClientProvider>,
      );
    });

    invalidateSpy.mockClear();
    act(() => {
      mockLastSocket.trigger("connect");
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: HISTORY_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: EARNINGS_SUMMARY_KEY });
  });
});

// Wire payloads run through PresenceStaleEvent/PresenceRecoveredEvent's zod parse (orderId: uuid()) —
// real UUIDs, not the short "order-N" labels used elsewhere in this file for the untyped mock calls.
const ORDER_3 = "11111111-1111-4111-8111-111111111113";
const ORDER_4 = "11111111-1111-4111-8111-111111111114";
const ORDER_5 = "11111111-1111-4111-8111-111111111115";
const OTHER_ORDER = "22222222-2222-4222-8222-222222222222";

describe("useRiderJobSocket customer presence (BH-08)", () => {
  it("fires onCustomerStale only for a matching order's role:customer escalation", () => {
    const qc = new QueryClient();
    const stale = jest.fn();
    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <PresenceHarness orderId={ORDER_3} onCustomerStale={stale} />
        </QueryClientProvider>,
      );
    });
    act(() => {
      mockLastSocket.trigger("presence:stale", { orderId: ORDER_3, role: "customer", lastSeenAt: null, at: "t" });
    });
    expect(stale).toHaveBeenCalledTimes(1);

    stale.mockClear();
    // role:"rider" is the RIDER's OWN staleness, meant for the customer's app — must not self-escalate.
    act(() => {
      mockLastSocket.trigger("presence:stale", { orderId: ORDER_3, role: "rider", lastSeenAt: null, at: "t" });
    });
    expect(stale).not.toHaveBeenCalled();
  });

  it("fires onCustomerRecovered on a matching presence:recovered role:customer, clearing the warning", () => {
    const qc = new QueryClient();
    const recovered = jest.fn();
    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <PresenceHarness orderId={ORDER_4} onCustomerRecovered={recovered} />
        </QueryClientProvider>,
      );
    });
    act(() => {
      mockLastSocket.trigger("presence:recovered", { orderId: ORDER_4, role: "customer", at: "t" });
    });
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it("ignores a presence:recovered for a different order or the rider's own role", () => {
    const qc = new QueryClient();
    const recovered = jest.fn();
    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <PresenceHarness orderId={ORDER_5} onCustomerRecovered={recovered} />
        </QueryClientProvider>,
      );
    });
    act(() => {
      mockLastSocket.trigger("presence:recovered", { orderId: OTHER_ORDER, role: "customer", at: "t" });
      mockLastSocket.trigger("presence:recovered", { orderId: ORDER_5, role: "rider", at: "t" });
    });
    expect(recovered).not.toHaveBeenCalled();
  });
});
