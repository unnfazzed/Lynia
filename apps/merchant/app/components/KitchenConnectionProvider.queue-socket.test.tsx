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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

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
});
