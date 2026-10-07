// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KitchenConnectionProvider } from "./KitchenConnectionProvider";

/**
 * LC-C C-T4 regression (2026-08-03): before this fix, no merchant-app code ever called
 * `createMerchantQueueSocket`/emitted `WS_EVENTS.merchantQueueSubscribe` — `use-queue-poll.ts` was
 * (and remains) poll-only for new-order delivery, but that also meant the server's
 * `TrackingGateway.isMerchantOnline` presence check (which `sweepExpiredAcceptWindows` consults
 * before auto-cancelling a past-deadline `awaiting_accept` order) could never see ANY tablet as
 * connected, silently defeating the N-03 "never a silent hang" guarantee for every merchant, not
 * just genuinely offline ones. These tests pin the provider actually opening the presence socket and
 * joining the room on every connect (including reconnects), and tearing it down on unmount/sign-out.
 */

const { replace, refreshMerchantSession } = vi.hoisted(() => ({
  replace: vi.fn(),
  refreshMerchantSession: vi.fn(async (): Promise<"refreshed" | "dead" | "transient"> => "refreshed"),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));
vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return { ...actual, refreshMerchantSession: () => refreshMerchantSession() };
});
// The shell's queue poll (C20) is not under test here.
vi.mock("../lib/orders-api", () => ({ listQueue: vi.fn(() => new Promise(() => {})) }));

vi.mock("./alarm-singleton", () => {
  const controller = {
    isArmed: () => false,
    isRinging: () => false,
    arm: () => {},
    resume: () => {},
    start: () => {},
    stop: () => {},
  };
  return { getAlarmController: () => controller };
});

vi.mock("../lib/session", () => ({
  loadMerchantSession: () => ({
    accessToken: "tok",
    refreshToken: "rtok",
    expiresIn: 3600,
    issuedAt: 0,
    profileId: "merchant-1",
    role: "merchant",
  }),
  clearMerchantSession: vi.fn(),
}));

type FakeSocket = {
  on: (event: string, cb: (...args: unknown[]) => void) => FakeSocket;
  emit: (...args: unknown[]) => FakeSocket;
  disconnect: () => void;
  connect: () => void;
  trigger: (event: string, ...args: unknown[]) => void;
};

function makeFakeSocket(): FakeSocket {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const socket: FakeSocket = {
    on(event, cb) {
      (handlers[event] ??= []).push(cb);
      return socket;
    },
    emit: vi.fn(() => socket),
    disconnect: vi.fn(),
    connect: vi.fn(),
    trigger: (event, ...args) => (handlers[event] ?? []).forEach((cb) => cb(...args)),
  };
  return socket;
}

let lastSocket: FakeSocket;
const createMerchantQueueSocket = vi.fn(() => {
  lastSocket = makeFakeSocket();
  return lastSocket;
});
vi.mock("../lib/queue-socket", () => ({
  createMerchantQueueSocket: () => createMerchantQueueSocket(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("KitchenConnectionProvider queue-socket presence (LC-C C-T4)", () => {
  it("opens the queue socket once signed in and joins the merchant queue room on connect", async () => {
    await act(async () => {
      render(<KitchenConnectionProvider>{null}</KitchenConnectionProvider>);
    });
    expect(createMerchantQueueSocket).toHaveBeenCalledTimes(1);
    expect(lastSocket.emit).not.toHaveBeenCalled();

    await act(async () => {
      lastSocket.trigger("connect");
    });
    expect(lastSocket.emit).toHaveBeenCalledWith("merchant:queue-subscribe");
  });

  it("re-joins the room on every reconnect, not only the first connect", async () => {
    await act(async () => {
      render(<KitchenConnectionProvider>{null}</KitchenConnectionProvider>);
    });

    await act(async () => {
      lastSocket.trigger("connect");
      lastSocket.trigger("connect"); // Socket.IO re-fires `connect` on every reconnect, not just once
    });

    expect((lastSocket.emit as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      ["merchant:queue-subscribe"],
      ["merchant:queue-subscribe"],
    ]);
  });

  it("disconnects the socket on unmount so a closed tablet stops reporting itself online", async () => {
    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(<KitchenConnectionProvider>{null}</KitchenConnectionProvider>));
    });

    act(() => {
      unmount();
    });

    expect(lastSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  // MJ-M7 (2026-10-07): the server drops a handshake carrying an expired token with
  // `client.disconnect(true)` ("io server disconnect"), which Socket.IO never retries by itself — the
  // tablet read as dark for the rest of the shift.
  it("refreshes the session and reconnects after the server drops it (an expired token)", async () => {
    await act(async () => {
      render(<KitchenConnectionProvider>{null}</KitchenConnectionProvider>);
    });
    await act(async () => {
      lastSocket.trigger("disconnect", "io server disconnect");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(refreshMerchantSession).toHaveBeenCalledTimes(1);
    expect(lastSocket.connect).toHaveBeenCalledTimes(1);
  });

  it("leaves ordinary drops to Socket.IO's own reconnect", async () => {
    await act(async () => {
      render(<KitchenConnectionProvider>{null}</KitchenConnectionProvider>);
    });
    await act(async () => {
      lastSocket.trigger("disconnect", "transport close");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(refreshMerchantSession).not.toHaveBeenCalled();
    expect(lastSocket.connect).not.toHaveBeenCalled();
  });

  it("backs off when the server keeps refusing it", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => {
        render(<KitchenConnectionProvider>{null}</KitchenConnectionProvider>);
      });
      await act(async () => {
        lastSocket.trigger("disconnect", "io server disconnect");
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(lastSocket.connect).toHaveBeenCalledTimes(1);
      await act(async () => {
        lastSocket.trigger("disconnect", "io server disconnect");
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(lastSocket.connect).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(lastSocket.connect).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("signs out when the refresh token is dead", async () => {
    refreshMerchantSession.mockResolvedValueOnce("dead");
    await act(async () => {
      render(<KitchenConnectionProvider>{null}</KitchenConnectionProvider>);
    });
    await act(async () => {
      lastSocket.trigger("disconnect", "io server disconnect");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(lastSocket.connect).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
