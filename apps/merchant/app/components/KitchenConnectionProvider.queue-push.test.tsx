// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenConnectionProvider, QUEUE_PUSH_DEBOUNCE_MS } from "./KitchenConnectionProvider";
import { listQueue } from "../lib/orders-api";
import { POLL_INTERVAL_MS, SOCKET_POLL_INTERVAL_MS } from "../lib/use-queue-poll";

/**
 * MJ-P1 (2026-10-07): the server pushes `food:queue-changed` the moment an order changes, and the web
 * ignored it — a 5 s full-queue poll ran all day (19 requests and ~24 KB per idle minute with three
 * orders), and a new order still took a poll tick to show. The shell now re-reads the queue on the push
 * (debounced), once after a reconnect, and polls only as a 30 s backstop while the socket is up.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("./alarm-singleton", () => {
  const controller = { isArmed: () => true, isRinging: () => false, arm: () => {}, resume: () => {}, start: () => {}, stop: () => {} };
  return { getAlarmController: () => controller };
});
vi.mock("../lib/session", () => ({
  loadMerchantSession: () => ({ accessToken: "at", refreshToken: "rt", expiresIn: 900, issuedAt: 0, profileId: "p", role: "merchant" }),
  clearMerchantSession: vi.fn(),
  saveMerchantSession: vi.fn(),
}));
vi.mock("../lib/reachability", () => {
  const store = {
    getState: () => ({ reachable: true, attempt: 0, unreachableSinceMs: null }),
    subscribe: () => () => {},
    start: () => {},
    stop: () => {},
    reportReachable: () => {},
    reportUnreachable: () => {},
  };
  return { getReachabilityStore: () => store };
});
vi.mock("../lib/orders-api", () => ({ listQueue: vi.fn(async () => []) }));
vi.mock("../lib/business", () => ({ clearBusinessCache: vi.fn(), hasKnownBusiness: () => true }));
vi.mock("./use-wake-lock", () => ({ useWakeLock: () => ({ supported: false, active: false }) }));

type Handler = (...args: unknown[]) => void;
const handlers: Record<string, Handler[]> = {};
const socket = {
  on: (event: string, cb: Handler) => {
    (handlers[event] ??= []).push(cb);
    return socket;
  },
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
};
const trigger = (event: string, ...args: unknown[]) => (handlers[event] ?? []).forEach((cb) => cb(...args));
vi.mock("../lib/queue-socket", () => ({ createMerchantQueueSocket: () => socket }));

async function mount() {
  await act(async () => {
    render(<KitchenConnectionProvider>{null}</KitchenConnectionProvider>);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const key of Object.keys(handlers)) delete handlers[key];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("the shell's queue follows the server's push (MJ-P1)", () => {
  it("re-reads the queue on food:queue-changed — once for a burst, shortly after the first push", async () => {
    await mount();
    await act(async () => trigger("connect"));
    expect(listQueue).toHaveBeenCalledTimes(1); // the session's first read

    await act(async () => {
      trigger("food:queue-changed", { orderId: "o1", at: "now" });
      trigger("food:queue-changed", { orderId: "o1", at: "now" });
      trigger("food:queue-changed", { orderId: "o2", at: "now" });
    });
    expect(listQueue).toHaveBeenCalledTimes(1);
    await advance(QUEUE_PUSH_DEBOUNCE_MS);
    expect(listQueue).toHaveBeenCalledTimes(2);

    // A later change is a later read.
    await act(async () => trigger("food:queue-changed", { orderId: "o3", at: "now" }));
    await advance(QUEUE_PUSH_DEBOUNCE_MS);
    expect(listQueue).toHaveBeenCalledTimes(3);
  });

  it("polls every 30 s while the socket is up, and every 5 s again once it drops", async () => {
    await mount();
    await act(async () => trigger("connect"));
    vi.mocked(listQueue).mockClear();

    await advance(POLL_INTERVAL_MS * 3);
    expect(listQueue).not.toHaveBeenCalled();
    await advance(SOCKET_POLL_INTERVAL_MS - POLL_INTERVAL_MS * 3);
    expect(listQueue).toHaveBeenCalledTimes(1);

    vi.mocked(listQueue).mockClear();
    await act(async () => trigger("disconnect", "transport close"));
    await advance(POLL_INTERVAL_MS);
    expect(listQueue).toHaveBeenCalledTimes(1);
    await advance(POLL_INTERVAL_MS);
    expect(listQueue).toHaveBeenCalledTimes(2);
  });

  it("polls every 5 s until the socket first connects", async () => {
    await mount();
    vi.mocked(listQueue).mockClear();
    await advance(POLL_INTERVAL_MS * 2);
    expect(listQueue).toHaveBeenCalledTimes(2);
  });

  it("re-reads the queue once on a reconnect (pushes sent while it was down are gone), not on the first connect", async () => {
    await mount();
    await act(async () => trigger("connect"));
    expect(listQueue).toHaveBeenCalledTimes(1);
    await act(async () => trigger("disconnect", "transport close"));
    await act(async () => trigger("connect"));
    expect(listQueue).toHaveBeenCalledTimes(2);
  });

  it("drops a pending push read when the shell goes away", async () => {
    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(<KitchenConnectionProvider>{null}</KitchenConnectionProvider>));
    });
    await act(async () => trigger("food:queue-changed", { orderId: "o1", at: "now" }));
    vi.mocked(listQueue).mockClear();
    act(() => unmount());
    await advance(QUEUE_PUSH_DEBOUNCE_MS * 2);
    expect(listQueue).not.toHaveBeenCalled();
  });
});
