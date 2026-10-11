// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenConnectionProvider, QUEUE_JOIN_ACK_TIMEOUT_MS, QUEUE_PUSH_DEBOUNCE_MS } from "./KitchenConnectionProvider";
import { listQueue } from "../lib/orders-api";
import { POLL_INTERVAL_MS, SOCKET_POLL_INTERVAL_MS } from "../lib/use-queue-poll";

/**
 * MJ-P1 (2026-10-07): the server pushes `food:queue-changed` the moment an order changes, and the web
 * ignored it — a 5 s full-queue poll ran all day (19 requests and ~24 KB per idle minute with three
 * orders), and a new order still took a poll tick to show. The shell now re-reads the queue on the push
 * (debounced), and polls only as a 15 s backstop — but only while the server has ANSWERED that this
 * tablet is in its queue room (review of MJ-P1: a connected socket can be out of the room — a refused or
 * thrown join, a teammate's branch switch evicting it, lost pub/sub — and orders would ring late).
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

/** How the fake server answers `merchant:queue-subscribe`: joined, refused, or never (a throw / a lost ack). */
const server = vi.hoisted(() => ({ reply: { joined: "m1" } as unknown }));
const NO_ANSWER = Symbol("no answer");

type Handler = (...args: unknown[]) => void;
const handlers: Record<string, Handler[]> = {};
const socket = {
  on: (event: string, cb: Handler) => {
    (handlers[event] ??= []).push(cb);
    return socket;
  },
  emit: vi.fn((event: string, ack?: (res: unknown) => void) => {
    if (event === "merchant:queue-subscribe" && ack && server.reply !== NO_ANSWER) ack(server.reply);
    return socket;
  }),
  connect: vi.fn(),
  disconnect: vi.fn(),
};
const trigger = (event: string, ...args: unknown[]) => (handlers[event] ?? []).forEach((cb) => cb(...args));
vi.mock("../lib/queue-socket", () => ({ createMerchantQueueSocket: () => socket }));
const joins = () => socket.emit.mock.calls.filter(([event]) => event === "merchant:queue-subscribe").length;

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

async function connect() {
  await act(async () => {
    trigger("connect");
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  server.reply = { joined: "m1" };
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
    await connect();
    vi.mocked(listQueue).mockClear();

    await act(async () => {
      trigger("food:queue-changed", { orderId: "o1", at: "now" });
      trigger("food:queue-changed", { orderId: "o1", at: "now" });
      trigger("food:queue-changed", { orderId: "o2", at: "now" });
    });
    expect(listQueue).not.toHaveBeenCalled();
    await advance(QUEUE_PUSH_DEBOUNCE_MS);
    expect(listQueue).toHaveBeenCalledTimes(1);

    // A later change is a later read.
    await act(async () => trigger("food:queue-changed", { orderId: "o3", at: "now" }));
    await advance(QUEUE_PUSH_DEBOUNCE_MS);
    expect(listQueue).toHaveBeenCalledTimes(2);
  });

  it("a joined ack re-reads the queue (closing the gap before the join), then polls every 15 s", async () => {
    await mount();
    expect(listQueue).toHaveBeenCalledTimes(1); // the session's first read
    await connect();
    expect(joins()).toBe(1);
    expect(listQueue).toHaveBeenCalledTimes(2); // read again once the server answered the join

    vi.mocked(listQueue).mockClear();
    await advance(POLL_INTERVAL_MS * 2);
    expect(listQueue).not.toHaveBeenCalled();
    await advance(SOCKET_POLL_INTERVAL_MS - POLL_INTERVAL_MS * 2);
    expect(listQueue).toHaveBeenCalledTimes(1);
  });

  it("a refused join keeps the 5 s poll, and doesn't count as a join to read after", async () => {
    server.reply = { error: "forbidden" };
    await mount();
    await connect();
    expect(listQueue).toHaveBeenCalledTimes(1);
    vi.mocked(listQueue).mockClear();
    await advance(POLL_INTERVAL_MS);
    expect(listQueue).toHaveBeenCalledTimes(1);
    await advance(POLL_INTERVAL_MS);
    expect(listQueue).toHaveBeenCalledTimes(2);
  });

  it("an unanswered join (the gateway threw, the ack was lost) keeps the 5 s poll", async () => {
    server.reply = NO_ANSWER;
    await mount();
    await connect();
    await advance(QUEUE_JOIN_ACK_TIMEOUT_MS);
    vi.mocked(listQueue).mockClear();
    await advance(POLL_INTERVAL_MS + QUEUE_JOIN_ACK_TIMEOUT_MS);
    expect(listQueue).toHaveBeenCalledTimes(1);
  });

  it("re-joins on every backstop tick, and drops back to 5 s when a re-join isn't answered as joined (eviction, lost pub/sub)", async () => {
    await mount();
    await connect();
    expect(joins()).toBe(1);

    // A teammate's branch switch evicted this tablet; this time the re-join is refused.
    server.reply = { error: "forbidden" };
    await advance(SOCKET_POLL_INTERVAL_MS);
    expect(joins()).toBe(2);

    vi.mocked(listQueue).mockClear();
    await advance(POLL_INTERVAL_MS);
    expect(listQueue).toHaveBeenCalledTimes(1);
    expect(joins()).toBe(3); // and it keeps trying to get back in

    // Back in the room: the 15 s backstop again.
    server.reply = { joined: "m1" };
    await advance(POLL_INTERVAL_MS);
    vi.mocked(listQueue).mockClear();
    await advance(POLL_INTERVAL_MS * 2);
    expect(listQueue).not.toHaveBeenCalled();
  });

  it("polls every 5 s until the socket first joins, and again once it drops", async () => {
    await mount();
    vi.mocked(listQueue).mockClear();
    await advance(POLL_INTERVAL_MS * 2);
    expect(listQueue).toHaveBeenCalledTimes(2);

    await connect();
    await act(async () => trigger("disconnect", "transport close"));
    vi.mocked(listQueue).mockClear();
    await advance(POLL_INTERVAL_MS);
    expect(listQueue).toHaveBeenCalledTimes(1);
  });

  it("re-reads the queue on every reconnect, once the re-join is answered", async () => {
    await mount();
    await connect();
    await act(async () => trigger("disconnect", "transport close"));
    vi.mocked(listQueue).mockClear();
    server.reply = NO_ANSWER;
    await connect();
    expect(listQueue).not.toHaveBeenCalled(); // not on `connect` itself
    server.reply = { joined: "m1" };
    await connect();
    expect(listQueue).toHaveBeenCalledTimes(1);
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
