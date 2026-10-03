// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import QueuePage from "./page";
import { TOAST_MS, ToastProvider } from "../../components/m/Toast";
import { ApiError, getMyMerchant } from "../../lib/api-client";
import { setBusyMode, setOpen } from "../../lib/menu-api";
import { acceptOrder, cancelPreparing, confirmKitchen, getTodaySummary, listScheduledOrders, proposeSubstitution, rejectOrder } from "../../lib/orders-api";
import { merchantOrder, merchantProfile, RIDER } from "../../testing/fixtures";

vi.mock("../../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");
  return { ...actual, getMyMerchant: vi.fn() };
});
vi.mock("../../lib/menu-api", () => ({ setOpen: vi.fn(), setBusyMode: vi.fn() }));
vi.mock("../../lib/orders-api", () => ({
  acceptOrder: vi.fn(async () => ({})),
  rejectOrder: vi.fn(async () => ({})),
  confirmKitchen: vi.fn(async () => ({})),
  cancelPreparing: vi.fn(async () => ({})),
  proposeSubstitution: vi.fn(async () => ({})),
  listScheduledOrders: vi.fn(async () => []),
  getTodaySummary: vi.fn(),
}));
vi.mock("../../lib/business", () => ({ primeBusiness: vi.fn() }));

// One router object for the whole run: the page's load callback depends on it.
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace, push: vi.fn() };
  return { useRouter: () => router };
});

const poll = vi.hoisted(() => ({
  orders: [] as MerchantOrderResponse[],
  loaded: true,
  error: null as { status: number; message: string } | null,
  refetch: vi.fn(async () => {}),
}));
vi.mock("../../lib/use-queue-poll", () => ({
  useQueuePoll: () => ({ orders: poll.orders, loading: false, loaded: poll.loaded, error: poll.error, refetch: poll.refetch }),
}));

const alarm = vi.hoisted(() => ({ ring: vi.fn(), silence: vi.fn(), testRing: vi.fn() }));
const signOut = vi.fn();
let reachable = true;
vi.mock("../../components/KitchenConnectionProvider", () => ({
  useKitchenConnection: () => ({ alarm, actionsDisabled: false, reachability: { reachable, attempt: 0, unreachableSinceMs: null }, signOut }),
}));
vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const Page = () => (
  <ToastProvider>
    <QueuePage />
  </ToastProvider>
);

// Open all day every day, so "open" doesn't depend on when the test runs.
const ALL_DAY = { open: "00:00", close: "23:59" };
const WEEK = { mon: ALL_DAY, tue: ALL_DAY, wed: ALL_DAY, thu: ALL_DAY, fri: ALL_DAY, sat: ALL_DAY, sun: ALL_DAY };
const kitchen = (over = {}) => merchantProfile({ name: "Sadza Republic", hours: WEEK, pilotEnabled: true, ...over });

beforeEach(() => {
  poll.orders = [];
  poll.loaded = true;
  poll.error = null;
  vi.mocked(getTodaySummary).mockResolvedValue({
    date: "2026-09-30",
    delivered: 6,
    rejected: 0,
    cashTaken: 30,
    walletTaken: 0,
    averagePrepMinutes: 15,
    orders: 7,
    sales: 59.5,
    cashOverdue: 9.5,
    overdue: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  reachable = true;
});

describe("loading the Orders home", () => {
  it("shows a Retry on a failed load, and recovers", async () => {
    vi.mocked(getMyMerchant).mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server.")).mockResolvedValueOnce(kitchen());
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Sadza Republic")).toBeTruthy();
  });

  it("retries by itself the moment the connection comes back — it's the alarm loop", async () => {
    reachable = false;
    vi.mocked(getMyMerchant).mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server.")).mockResolvedValueOnce(kitchen());
    const { rerender } = render(<Page />);
    await screen.findByText("Couldn't reach the server.");
    reachable = true;
    rerender(<Page />);
    expect(await screen.findByText("Sadza Republic")).toBeTruthy();
  });

  it("sends a number that isn't on a business to the sign-up, and a shop to Deliveries", async () => {
    vi.mocked(getMyMerchant).mockRejectedValueOnce(new ApiError(403, "not a member", "not_a_member"));
    render(<Page />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));

    cleanup();
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile({ businessType: "shop", shopKind: "other" }));
    render(<Page />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/deliveries"));
  });

  it("keeps a shop live to customers on its Orders home (Order flow v2, D-59), with Book a rider one tap away", async () => {
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile({ name: "Avondale Fresh", businessType: "shop", shopKind: "grocery", pilotEnabled: true, hours: WEEK }));
    render(<Page />);
    expect(await screen.findByText("Avondale Fresh")).toBeTruthy();
    expect(replace).not.toHaveBeenCalledWith("/deliveries");
    expect(screen.getByRole("link", { name: /Book a rider/ }).getAttribute("href")).toBe("/deliveries");
  });
});

describe("a failed queue poll is never a lasting red line (Order flow v2's rule, ledger D-74)", () => {
  const SERVER = "Something went wrong on our side.";

  it("before the first load: the calm '↻ Try again', not a false 'No orders yet'", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.loaded = false;
    poll.error = new ApiError(500, SERVER);
    const { container } = render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(poll.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Check your data connection and try again.")).toBeTruthy();
    expect(screen.queryByText("No orders yet")).toBeNull();
    expect(container.querySelector(".m-err")).toBeNull();
  });

  it("after it: the board keeps its orders and the failure is said once, in the ink toast", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
      poll.orders = [merchantOrder({ merchantPhase: "ready_for_pickup", status: "open_for_offers" })];
      poll.error = new ApiError(500, SERVER);
      const { container, rerender } = render(<Page />);
      expect((await screen.findByRole("status")).textContent).toBe(SERVER);
      expect(screen.getAllByText(SERVER)).toHaveLength(1);
      expect(screen.getByText("Finding a rider")).toBeTruthy();
      expect(container.querySelector(".m-err")).toBeNull();

      act(() => vi.advanceTimersByTime(TOAST_MS + 100));
      expect(screen.queryByRole("status")).toBeNull();
      // The next poll fails too: still nothing new to say.
      poll.error = new ApiError(500, SERVER);
      rerender(<Page />);
      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a lost connection is the shell's offline bar to say, not a toast or a line", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [merchantOrder({ merchantPhase: "ready_for_pickup", status: "open_for_offers" })];
    poll.error = new ApiError(0, "Couldn't reach the server.");
    render(<Page />);
    expect(await screen.findByText("Finding a rider")).toBeTruthy();
    expect(screen.queryByText("Couldn't reach the server.")).toBeNull();
  });
});

describe("B1 · Orders home (merchant mobile, D-48)", () => {
  it("draws the header: name, open line, switch, and the owner's Orders · Sales · Cash overdue tiles", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    render(<Page />);
    expect(await screen.findByText("Sadza Republic")).toBeTruthy();
    expect(screen.getByText("● Open until 23:59")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Open for orders" }).getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByText("$59.50")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Cash overdue/ }).getAttribute("href")).toBe("/statement");
    expect(screen.queryByText(/Book a rider/)).toBeNull();
    expect(screen.queryByText(/alarm/i)).toBeNull();
  });

  it("staff see no money tiles", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen({ myRole: "staff" }));
    render(<Page />);
    await screen.findByText("Sadza Republic");
    expect(screen.queryByText("Sales")).toBeNull();
    expect(getTodaySummary).not.toHaveBeenCalled();
  });

  it("with nothing on, says so", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    render(<Page />);
    expect(await screen.findByText("No orders yet")).toBeTruthy();
  });

  it("counts New · Cooking · Ready and lists waiting-for-rider and out-for-delivery orders below", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [
      merchantOrder({ id: "a2220000-0000-4000-8000-000000000000", merchantPhase: "preparing" }),
      merchantOrder({ id: "a4440000-0000-4000-8000-000000000000", merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER }),
      merchantOrder({ id: "a1110000-0000-4000-8000-000000000000", merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open", debtAmount: 12 }),
    ];
    render(<Page />);
    const tabs = await screen.findByRole("tablist", { name: "Orders" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["New0", "Cooking1", "Ready1"]);
    expect(screen.getByText("Waiting for rider")).toBeTruthy();
    expect(screen.getByText("Blessing M. coming to your counter")).toBeTruthy();
    expect(screen.getByText("Out for delivery")).toBeTruthy();
    expect(screen.getByText("#A111 · Blessing M.")).toBeTruthy();
    expect(screen.getByText("On the way · cash back $12.00")).toBeTruthy();

    fireEvent.click(within(tabs).getByRole("tab", { name: /Cooking/ }));
    expect(screen.getByRole("link", { name: /#A222/ }).getAttribute("href")).toBe("/queue/a2220000-0000-4000-8000-000000000000");
  });
});

describe("B2 · a ringing order takes over, and the alarm rings until it's answered", () => {
  it("rings, and accepting with a chip tells the customer the time", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [merchantOrder()];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    expect(alarm.ring).toHaveBeenCalled();
    fireEvent.click(within(takeover).getByRole("radio", { name: "20" }));
    fireEvent.click(within(takeover).getByRole("button", { name: "Accept · ready in 20 min" }));
    await vi.waitFor(() => expect(acceptOrder).toHaveBeenCalledWith("a1110000-0000-4000-8000-000000000001", { prepMinutes: 20, unavailableDishIds: undefined }));
    expect(await screen.findByText("Accepted · customer told 20 min")).toBeTruthy();
  });

  it("declining goes through the confirm sheet", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [merchantOrder()];
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Can’t take it" }));
    expect(screen.getByText("The customer is told straight away.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Decline order" }));
    await vi.waitFor(() => expect(rejectOrder).toHaveBeenCalledWith("a1110000-0000-4000-8000-000000000001", "other"));
  });

  it("U1a: tapping a line offers Remove it / Swap for…; 'Send 1 change to customer' accepts with the change", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    const BREAD = "b0000001-0000-4000-8000-000000000000";
    poll.orders = [
      merchantOrder({
        items: [
          { itemId: BREAD, dishId: "d0000001-0000-4000-8000-000000000000", name: "Bread (Lobels 700g)", priceUsd: 1.1, quantity: 1, note: null, available: null },
          { itemId: "b0000002-0000-4000-8000-000000000000", dishId: null, name: "Eggs (tray of 30)", priceUsd: 5.5, quantity: 1, note: null, available: null },
        ],
      }),
    ];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    expect(within(takeover).getByText("Tap an item you can’t supply.")).toBeTruthy();
    fireEvent.click(within(takeover).getByRole("button", { name: /Bread/ }));
    expect(within(takeover).getByRole("button", { name: "Swap for…" })).toBeTruthy();
    fireEvent.click(within(takeover).getByRole("button", { name: "Remove it" }));
    expect(within(takeover).getByText("$6.60 → $5.50")).toBeTruthy();
    fireEvent.click(within(takeover).getByRole("button", { name: "Send 1 change to customer" }));
    await vi.waitFor(() =>
      expect(proposeSubstitution).toHaveBeenCalledWith("a1110000-0000-4000-8000-000000000001", { lines: [{ action: "remove", itemId: BREAD }], prepMinutes: 15 }),
    );
  });

  it("a customer who chose 'Remove it' for missing items gets no swaps", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [
      merchantOrder({
        outOfStockPref: "remove",
        items: [{ itemId: "b0000001-0000-4000-8000-000000000000", dishId: null, name: "Bread (Lobels 700g)", priceUsd: 1.1, quantity: 1, note: null, available: null }],
      }),
    ];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    fireEvent.click(within(takeover).getByRole("button", { name: /Bread/ }));
    expect(within(takeover).getByRole("button", { name: "Remove it" })).toBeTruthy();
    expect(within(takeover).queryByRole("button", { name: "Swap for…" })).toBeNull();
  });

  it("M1c: a scheduled order rings at its start with 'SCHEDULED · START NOW'", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [merchantOrder({ scheduledFor: new Date(Date.now() + 40 * 60_000).toISOString(), scheduleStartedAt: new Date().toISOString() })];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    expect(within(takeover).getByText("SCHEDULED · START NOW")).toBeTruthy();
    expect(within(takeover).getByText(/^Scheduled for \d\d:\d\d–\d\d:\d\d today$/)).toBeTruthy();
  });

  it("goes quiet when nothing is waiting", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    render(<Page />);
    await screen.findByText("Sadza Republic");
    expect(alarm.silence).toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("M7a · the Scheduled segment (Order flow v2, D-59)", () => {
  it("adds 'Scheduled n' with each order's slot and ring time", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    const at = new Date();
    at.setDate(at.getDate() + 1);
    at.setHours(12, 30, 0, 0);
    vi.mocked(listScheduledOrders).mockResolvedValue([
      merchantOrder({ id: "a1b20000-0000-4000-8000-000000000000", merchantGoodsTotal: 15, scheduledFor: at.toISOString(), ringsAt: new Date(at.getTime() - 25 * 60_000).toISOString(), scheduleStartedAt: null }),
    ]);
    poll.orders = [merchantOrder({ id: "a2220000-0000-4000-8000-000000000000", merchantPhase: "preparing", prepMinutes: 15, prepStartedAt: new Date().toISOString() })];
    render(<Page />);
    const tab = await screen.findByRole("tab", { name: /Scheduled/ });
    fireEvent.click(tab);
    expect(screen.getByText("Tomorrow 12:30–13:00")).toBeTruthy();
    expect(screen.getByText("1 dish · Rings at 12:05 like a new order")).toBeTruthy();
    expect(screen.getByRole("link", { name: /#A1B2/ }).getAttribute("href")).toBe("/queue/a1b20000-0000-4000-8000-000000000000");
  });
});

describe("M1a · an auto-accepted order rings until the kitchen confirms it (Order flow v2, D-59)", () => {
  const auto = () =>
    merchantOrder({
      merchantPhase: "preparing",
      autoAccepted: true,
      kitchenConfirmedAt: null,
      prepMinutes: 20,
      prepStartedAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    });

  it("takes over with 'LyniaGo accepted this for you', the time left, the total and 'Ready in 20 min'; 'Got it' confirms", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [auto()];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    expect(alarm.ring).toHaveBeenCalled();
    expect(within(takeover).getByText("NEW ORDER")).toBeTruthy();
    expect(within(takeover).getByText("LyniaGo accepted this for you")).toBeTruthy();
    expect(within(takeover).getByText("Ready in 20 min")).toBeTruthy();
    expect(within(takeover).getByLabelText("Time left to confirm").textContent).toMatch(/^5[78]:\d\d$/);
    fireEvent.click(within(takeover).getByRole("button", { name: "Got it, we’re making it" }));
    await vi.waitFor(() => expect(confirmKitchen).toHaveBeenCalledWith("a1110000-0000-4000-8000-000000000001"));
  });

  it("'Can’t take it' cancels behind the confirm sheet", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [auto()];
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Can’t take it" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    await vi.waitFor(() => expect(cancelPreparing).toHaveBeenCalledWith("a1110000-0000-4000-8000-000000000001"));
  });

  it("a new order still rings first", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [auto(), merchantOrder({ id: "a2220000-0000-4000-8000-000000000000" })];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A222" });
    expect(within(takeover).queryByText("LyniaGo accepted this for you")).toBeNull();
  });
});

describe("the open/closed switch (B1 → B5)", () => {
  it("closing greys the header and shows B5; Open now and busy mode open again", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    const closedUntil = new Date(Date.now() + 3_600_000).toISOString();
    vi.mocked(setOpen).mockResolvedValueOnce(kitchen({ closedUntil }));
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Open for orders" }));
    expect(await screen.findByText("You’re closed")).toBeTruthy();
    expect(setOpen).toHaveBeenCalledWith(false);
    expect(screen.getByRole("switch", { name: "Closed" }).getAttribute("aria-checked")).toBe("false");

    vi.mocked(setOpen).mockResolvedValueOnce(kitchen({ closedUntil: null }));
    vi.mocked(setBusyMode).mockResolvedValueOnce(kitchen({ closedUntil: null, busy: true }));
    fireEvent.click(screen.getByRole("button", { name: "Open in busy mode (+10 min)" }));
    await vi.waitFor(() => expect(setBusyMode).toHaveBeenCalledWith({ active: true }));
    expect(setOpen).toHaveBeenLastCalledWith(true);
    expect(await screen.findByText("Open · busy mode +10 min")).toBeTruthy();
  });

  it("outside hours the switch says to change the hours instead", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen({ hours: {} }));
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Closed" }));
    expect(await screen.findByText("Outside your opening hours · change them in Account")).toBeTruthy();
    expect(setOpen).not.toHaveBeenCalled();
  });
});
