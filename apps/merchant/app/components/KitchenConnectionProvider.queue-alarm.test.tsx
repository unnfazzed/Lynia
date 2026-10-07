// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import { KitchenConnectionProvider, useKitchenConnection } from "./KitchenConnectionProvider";
import { getAlarmController } from "./alarm-singleton";
import { ToastProvider } from "./m/Toast";
import { RingingHost } from "./queue/RingingHost";
import { listQueue } from "../lib/orders-api";
import { merchantOrder } from "../testing/fixtures";

/**
 * C20 (MJ-B1 + MJ-RH4, MJ-M6, MJ-M10, MJ-M14; owner decision D4, ledger D-86). The queue poll and the
 * alarm used to run only on the Orders board and the tab bar's live bar, so on any pushed screen a new
 * order neither showed nor rang and was cancelled `shop_closed`. The signed-in shell owns both now, and
 * K2 / S2 is presented over whatever screen is open.
 */

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("./alarm-singleton", () => {
  const state = { ringing: false };
  const controller = {
    isArmed: () => true,
    isRinging: () => state.ringing,
    arm: () => {},
    resume: () => {},
    start: vi.fn(() => {
      state.ringing = true;
    }),
    stop: vi.fn(() => {
      state.ringing = false;
    }),
  };
  return { getAlarmController: () => controller };
});

vi.mock("../lib/session", () => ({
  loadMerchantSession: () => ({ accessToken: "at", refreshToken: "rt", expiresIn: 900, issuedAt: 0, profileId: "p", role: "merchant" }),
  clearMerchantSession: vi.fn(),
  saveMerchantSession: vi.fn(),
}));
vi.mock("../lib/queue-socket", () => ({
  createMerchantQueueSocket: () => ({ on: vi.fn(), emit: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), connected: false }),
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
vi.mock("../lib/orders-api", () => ({
  listQueue: vi.fn(),
  acceptOrder: vi.fn(async () => ({})),
  rejectOrder: vi.fn(async () => ({})),
  confirmKitchen: vi.fn(async () => ({})),
  cancelPreparing: vi.fn(async () => ({})),
  proposeSubstitution: vi.fn(async () => ({})),
}));
vi.mock("../lib/business", () => ({
  useBusiness: () => null,
  clearBusinessCache: vi.fn(),
  hasKnownBusiness: () => true,
  primeBusiness: vi.fn(),
}));
vi.mock("./use-wake-lock", () => ({ useWakeLock: () => ({ supported: false, active: false }) }));

const A = "a1110000-0000-4000-8000-000000000001";
const S = "5c4e0000-0000-4000-8000-000000000001";

/** A pushed screen that has nothing to do with orders (Opening hours, a cooking ticket, Team…). */
let shell: ReturnType<typeof useKitchenConnection>;
function HoursScreen() {
  shell = useKitchenConnection();
  return (
    <button type="button" onClick={() => shell.signOut()}>
      Sign out
    </button>
  );
}

function renderShell() {
  return render(
    <ToastProvider>
      <KitchenConnectionProvider>
        <h1>Opening hours</h1>
        <HoursScreen />
        <RingingHost />
      </KitchenConnectionProvider>
    </ToastProvider>,
  );
}

const controller = () => getAlarmController() as unknown as { isRinging: () => boolean; start: ReturnType<typeof vi.fn<() => void>>; stop: ReturnType<typeof vi.fn<() => void>> };

beforeEach(() => {
  controller().stop();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

describe("C20 / MJ-B1: a new order rings over any screen", () => {
  it("polls the queue from the session (not after /merchant/me, MJ-RH4), rings, and presents K2 over Opening hours", async () => {
    vi.mocked(listQueue).mockResolvedValue([merchantOrder()]);
    renderShell();
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    expect(within(takeover).getByText("NEW ORDER · #A111")).toBeTruthy();
    expect(listQueue).toHaveBeenCalled();
    // The alarm sync is an effect that runs after the takeover renders; wait for it rather than race it.
    await waitFor(() => expect(controller().isRinging()).toBe(true));
    expect(screen.getByText("Opening hours")).toBeTruthy();
  });

  it("goes quiet and takes K2 down once the order is answered", async () => {
    vi.mocked(listQueue).mockResolvedValueOnce([merchantOrder()]).mockResolvedValue([]);
    renderShell();
    await screen.findByRole("alertdialog");
    await act(async () => {
      await shell.queue.refetch();
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(controller().isRinging()).toBe(false);
  });

  it("doesn't cover the screen answering that order itself (the Rx check), but still rings (D-05)", async () => {
    vi.mocked(listQueue).mockResolvedValue([merchantOrder()]);
    renderShell();
    await screen.findByRole("alertdialog");
    let release!: () => void;
    act(() => {
      release = shell.holdTakeover(A);
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(controller().isRinging()).toBe(true);
    act(() => release());
    expect(screen.getByRole("alertdialog", { name: "New order #A111" })).toBeTruthy();
  });
});

describe("MJ-M6: the alarm never outlives the session", () => {
  it("signing out while an order rings stops the alarm", async () => {
    vi.mocked(listQueue).mockResolvedValue([merchantOrder()]);
    renderShell();
    await screen.findByRole("alertdialog");
    await waitFor(() => expect(controller().isRinging()).toBe(true));
    // K2 covers the screen; sign-out here stands for the membership-lost / session-expired paths too.
    act(() => shell.signOut());
    expect(controller().isRinging()).toBe(false);
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("the shell unmounting stops it too", async () => {
    vi.mocked(listQueue).mockResolvedValue([merchantOrder()]);
    const { unmount } = renderShell();
    await screen.findByRole("alertdialog");
    unmount();
    expect(controller().isRinging()).toBe(false);
  });
});

describe("MJ-M14: no silence before the first queue read has landed", () => {
  it("an alarm already ringing keeps ringing while the first read is in flight", async () => {
    vi.mocked(listQueue).mockReturnValue(new Promise<MerchantOrderResponse[]>(() => {}));
    controller().start();
    controller().stop.mockClear();
    renderShell();
    await act(async () => {
      await Promise.resolve();
    });
    expect(controller().stop).not.toHaveBeenCalled();
    expect(controller().isRinging()).toBe(true);
  });

  it("and with nothing waiting it never cuts a ring it didn't start (Account's Test the alarm)", async () => {
    vi.mocked(listQueue).mockResolvedValue([]);
    controller().start();
    controller().stop.mockClear();
    renderShell();
    await vi.waitFor(() => expect(listQueue).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(controller().stop).not.toHaveBeenCalled();
  });
});

describe("MJ-M10: the order being answered keeps the screen", () => {
  it("an older scheduled order that starts ringing waits its turn instead of remounting K2 mid-tap", async () => {
    vi.mocked(listQueue).mockResolvedValueOnce([merchantOrder({ id: A })]);
    renderShell();
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    fireEvent.click(within(takeover).getByRole("radio", { name: "20" }));

    // The scheduled order sorts first in the queue now.
    vi.mocked(listQueue).mockResolvedValueOnce([merchantOrder({ id: S, scheduledFor: new Date().toISOString(), scheduleStartedAt: new Date().toISOString() }), merchantOrder({ id: A })]);
    await act(async () => {
      await shell.queue.refetch();
    });
    const still = screen.getByRole("alertdialog", { name: "New order #A111" });
    expect(within(still).getByRole("radio", { name: "20" }).getAttribute("aria-checked")).toBe("true");

    // Answered: the next one takes the screen.
    vi.mocked(listQueue).mockResolvedValueOnce([merchantOrder({ id: S, scheduledFor: new Date().toISOString(), scheduleStartedAt: new Date().toISOString() })]);
    await act(async () => {
      await shell.queue.refetch();
    });
    expect(screen.getByRole("alertdialog", { name: "New order #5C4E" })).toBeTruthy();
  });
});
