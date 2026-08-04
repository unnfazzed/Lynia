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
// own — the mock doesn't need real ref-counting, just a socket per acquire and a no-op release, so
// existing assertions against `mockLastSocket` keep working unchanged.
jest.mock("../socket", () => ({
  acquireSocket: jest.fn(() => {
    mockLastSocket = mockCreateFakeSocket();
    return mockLastSocket;
  }),
  releaseSocket: jest.fn(),
}));

function Harness({ online }: { online: boolean }): null {
  useRiderBoard(online, null);
  return null;
}

function FoodOfferHarness({ online, onFoodOffer }: { online: boolean; onFoodOffer: (orderId: string) => void }): null {
  useRiderBoard(online, null, undefined, onFoodOffer);
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

// B-O12: nothing bounded the ["openOrders"] cache while the board socket stayed connected — the 15s
// REST poll that would otherwise reset it to the server's own capped snapshot (`take: 50` in
// orders.service.ts) is disabled the whole time `board.connected` is true, so `boardNewOrder`'s
// unbounded prepend was the one write path a very long, unbroken online shift could grow forever.
describe("useRiderBoard openOrders cache cap (B-O12)", () => {
  function validBoardOrder(id: string): Record<string, unknown> {
    return {
      id,
      pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Sadza Republic" },
      dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avondale" },
      itemDesc: "A parcel",
      suggestedFare: "5.00",
      proposedFare: "5.00",
      distanceKm: 3.2,
      createdAt: "2026-08-03T10:00:00Z",
    };
  }

  it("never grows the cache past 50 entries no matter how many board:new-order pushes land", () => {
    const qc = new QueryClient();

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <Harness online={true} />
        </QueryClientProvider>,
      );
    });

    act(() => {
      for (let i = 0; i < 80; i++) {
        mockLastSocket.trigger(
          "board:new-order",
          validBoardOrder(`11111111-1111-4111-8111-${String(i).padStart(12, "0")}`),
        );
      }
    });

    const cached = qc.getQueryData<Array<{ id: string }>>(["openOrders"]);
    expect(cached).toBeDefined();
    expect(cached!.length).toBe(50);
    // The cap keeps the MOST RECENT orders (each push prepends), not an arbitrary truncation —
    // the last-pushed order (i=79) must still be present, the first-pushed (i=0) must have fallen off.
    expect(cached!.some((o) => o.id.endsWith(String(79).padStart(12, "0")))).toBe(true);
    expect(cached!.some((o) => o.id.endsWith(String(0).padStart(12, "0")))).toBe(false);
  });
});

// D5/C5: a live food-dispatch offer lands on the same board socket — no separate subscribe, since
// emitToRider targets this authenticated socket directly (see tracking.gateway.ts).
describe("useRiderBoard food:offer", () => {
  const validOffer = {
    orderId: "11111111-1111-4111-8111-111111111111",
    merchantId: "22222222-2222-4222-8222-222222222222",
    pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Sadza Republic" },
    dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avondale" },
    itemDesc: "2x Sadza",
    merchantGoodsTotal: 13.0,
    deliveryFee: 2.5,
    distanceKm: 3.2,
    expiresAt: "2026-07-31T10:15:00Z",
    merchantPaymentMethod: "cash",
    merchantCashRule: "collect_and_return",
  };

  it("fires onFoodOffer with the order id on a valid food:offer push", () => {
    const qc = new QueryClient();
    const onFoodOffer = jest.fn();

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <FoodOfferHarness online={true} onFoodOffer={onFoodOffer} />
        </QueryClientProvider>,
      );
    });

    act(() => {
      mockLastSocket.trigger("food:offer", validOffer);
    });

    expect(onFoodOffer).toHaveBeenCalledWith(validOffer.orderId);
  });

  it("ignores a malformed food:offer payload rather than crashing or firing the callback", () => {
    const qc = new QueryClient();
    const onFoodOffer = jest.fn();

    act(() => {
      create(
        <QueryClientProvider client={qc}>
          <FoodOfferHarness online={true} onFoodOffer={onFoodOffer} />
        </QueryClientProvider>,
      );
    });

    act(() => {
      mockLastSocket.trigger("food:offer", { garbage: true });
    });

    expect(onFoodOffer).not.toHaveBeenCalled();
  });
});
