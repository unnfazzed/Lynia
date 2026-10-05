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
vi.mock("../../lib/business", () => ({ primeBusiness: vi.fn(), useBusiness: () => null }));

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

  it("keeps a shop live to customers on its Orders home (Order flow v2, D-59), with Book a rider on the top card (S1, D-77)", async () => {
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile({ name: "Avondale Fresh", businessType: "shop", shopKind: "grocery", pilotEnabled: true, hours: WEEK }));
    render(<Page />);
    expect(await screen.findByText("Avondale Fresh")).toBeTruthy();
    expect(replace).not.toHaveBeenCalledWith("/deliveries");
    expect(screen.getByRole("link", { name: /Book a rider/ }).getAttribute("href")).toBe("/deliveries/new");
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
      expect(screen.getByText(/finding a rider/)).toBeTruthy();
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
    expect(await screen.findByText(/finding a rider/)).toBeTruthy();
    expect(screen.queryByText("Couldn't reach the server.")).toBeNull();
  });
});

describe("B1 · Orders home (merchant mobile, D-48)", () => {
  it("draws the top card: name, open line, open pill, and the owner's Orders · Sales · Cash due strip (Merchant v2, D-77)", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    render(<Page />);
    expect(await screen.findByText("Sadza Republic")).toBeTruthy();
    expect(screen.getByText("Open · until 23:59")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Open" }).getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByText("$59.50")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Cash due/ }).getAttribute("href")).toBe("/statement");
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

  it("draws one board sorted by urgency (Merchant v2 K1, D-77): needs you, cooking, on the way", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    const started = new Date(Date.now() - 7 * 60_000).toISOString();
    poll.orders = [
      merchantOrder({ id: "a2220000-0000-4000-8000-000000000000", merchantPhase: "preparing", prepMinutes: 15, prepStartedAt: started }),
      merchantOrder({ id: "a4440000-0000-4000-8000-000000000000", merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER }),
      merchantOrder({ id: "a1110000-0000-4000-8000-000000000000", merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open", debtAmount: 12 }),
    ];
    render(<Page />);
    expect(await screen.findByText("NEEDS YOU")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["NEEDS YOU", "COOKING · 1", "ON THE WAY · 1"]);
    const counter = screen.getByRole("link", { name: /Blessing M\. is coming to your counter/ });
    expect(counter.getAttribute("href")).toBe("/queue/a4440000-0000-4000-8000-000000000000");
    expect(within(counter).getByText("Hand over")).toBeTruthy();
    expect(screen.getByText("8 min")).toBeTruthy();
    expect(screen.getByRole("link", { name: /#A222/ }).getAttribute("href")).toBe("/queue/a2220000-0000-4000-8000-000000000000");
    expect(screen.getByText("#A111 · Blessing M.")).toBeTruthy();
    expect(screen.getByText("On the way · then brings you $12.00")).toBeTruthy();
  });

});

describe("K2 / S2 · the order rings full screen until it's answered (Merchant v2, D-77)", () => {
  const BREAD = "b0000001-0000-4000-8000-000000000000";
  const shopOrder = (over = {}) =>
    merchantOrder({
      venue: { name: "Avondale Fresh", businessType: "shop", shopKind: "grocery" },
      customerFirstName: "Rudo",
      items: [
        { itemId: BREAD, dishId: "d0000001-0000-4000-8000-000000000000", name: "Bread (Lobels 700g)", priceUsd: 1.1, quantity: 1, note: null, available: null },
        { itemId: "b0000002-0000-4000-8000-000000000000", dishId: null, name: "Eggs (tray of 30)", priceUsd: 5.5, quantity: 1, note: null, available: null },
      ],
      ...over,
    });

  it("K2: the banner, the ready-in chips, and 'Accept · ready 07:36' says the clock time", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [merchantOrder()];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    expect(alarm.ring).toHaveBeenCalled();
    expect(within(takeover).getByText("NEW ORDER · #A111")).toBeTruthy();
    expect(within(takeover).getByText("to answer")).toBeTruthy();
    expect(within(takeover).getByText("min · we book the rider to arrive as it's ready")).toBeTruthy();
    fireEvent.click(within(takeover).getByRole("radio", { name: "20" }));
    fireEvent.click(within(takeover).getByRole("button", { name: /^Accept · ready \d\d:\d\d$/ }));
    await vi.waitFor(() => expect(acceptOrder).toHaveBeenCalledWith("a1110000-0000-4000-8000-000000000001", { prepMinutes: 20, unavailableDishIds: undefined }));
    expect(await screen.findByText(/^Accepted · ready \d\d:\d\d$/)).toBeTruthy();
  });

  it("'Can’t take it' asks why, and the reason is what the customer is told", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [merchantOrder()];
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Can’t take it" }));
    const sheet = screen.getByRole("dialog", { name: "Why can't you take it?" });
    expect(within(sheet).getByText("We tell the customer straight away.")).toBeTruthy();
    expect((within(sheet).getByRole("button", { name: "Turn down #A111" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(sheet).getByRole("radio", { name: "Too busy right now" }));
    // K2a: the busy-mode hint, for a kitchen with "Too busy" picked.
    expect(within(sheet).getByText(/adds 10 min to new orders instead of turning them away/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Turn down #A111" }));
    await vi.waitFor(() => expect(rejectOrder).toHaveBeenCalledWith("a1110000-0000-4000-8000-000000000001", "too_busy", undefined));
  });

  it("S2a: a shop says 'Out of stock', names the customer, and 'Something else' sends the note they see (D-77)", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [shopOrder({ customerFirstName: "Rudo" })];
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Can’t take it" }));
    const sheet = screen.getByRole("dialog", { name: "Why can't you take it?" });
    expect(within(sheet).getByText("We tell Rudo straight away.")).toBeTruthy();
    expect(within(sheet).getByRole("radio", { name: "Out of stock" })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("radio", { name: "Too busy right now" }));
    expect(within(sheet).queryByText(/Open, but busy/)).toBeNull();
    fireEvent.click(within(sheet).getByRole("radio", { name: "Something else" }));
    expect(within(sheet).getByText("Rudo sees this note.")).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText(/Add a note/), { target: { value: "Closing early for stock-take" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Turn down #A111" }));
    await vi.waitFor(() => expect(rejectOrder).toHaveBeenCalledWith("a1110000-0000-4000-8000-000000000001", "other", "Closing early for stock-take"));
  });

  it("K2: a kitchen taps a dish to remove it (Undo puts it back), and accepts with the change in one step", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [shopOrder({ venue: undefined })];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    expect(within(takeover).getByText("Out of something? Tap a dish to remove it.")).toBeTruthy();
    fireEvent.click(within(takeover).getByRole("button", { name: /Bread/ }));
    expect(within(takeover).getByText("Removed · Undo")).toBeTruthy();
    fireEvent.click(within(takeover).getByRole("button", { name: /Bread/ }));
    expect(within(takeover).queryByText("Removed · Undo")).toBeNull();
    fireEvent.click(within(takeover).getByRole("button", { name: /Bread/ }));
    expect(within(takeover).getByText("New total")).toBeTruthy();
    fireEvent.click(within(takeover).getByRole("button", { name: "Accept with 1 change" }));
    await vi.waitFor(() =>
      expect(proposeSubstitution).toHaveBeenCalledWith("a1110000-0000-4000-8000-000000000001", { lines: [{ action: "remove", itemId: BREAD }], prepMinutes: 15 }),
    );
  });

  it("S2: a shop's banner names the customer; a tapped item offers Remove it / Swap for…, and no ready-in picker", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen({ businessType: "shop" }));
    poll.orders = [shopOrder()];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    expect(within(takeover).getByText("2 items · Rudo · cash")).toBeTruthy();
    expect(within(takeover).getByText("Missing something? Tap it to swap or remove.")).toBeTruthy();
    expect(within(takeover).queryByRole("radiogroup", { name: "Ready in" })).toBeNull();
    fireEvent.click(within(takeover).getByRole("button", { name: /Bread/ }));
    expect(within(takeover).getByRole("button", { name: "Swap for…" })).toBeTruthy();
    fireEvent.click(within(takeover).getByRole("button", { name: "Remove it" }));
    expect(within(takeover).getByText("Rudo has 3 min to OK the changes. Start packing now.")).toBeTruthy();
    fireEvent.click(within(takeover).getByRole("button", { name: "Accept with 1 change" }));
    await vi.waitFor(() =>
      expect(proposeSubstitution).toHaveBeenCalledWith("a1110000-0000-4000-8000-000000000001", { lines: [{ action: "remove", itemId: BREAD }], prepMinutes: 15 }),
    );
  });

  it("a customer who chose 'Remove it' for missing items gets no swaps", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [shopOrder({ outOfStockPref: "remove" })];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    fireEvent.click(within(takeover).getByRole("button", { name: /Bread/ }));
    expect(within(takeover).getByRole("button", { name: "Remove it" })).toBeTruthy();
    expect(within(takeover).queryByRole("button", { name: "Swap for…" })).toBeNull();
  });

  it("M1c: a scheduled order rings at its start — only the banner line changes", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [merchantOrder({ scheduledFor: new Date(Date.now() + 40 * 60_000).toISOString(), scheduleStartedAt: new Date().toISOString() })];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    expect(within(takeover).getByText("SCHEDULED · START NOW · #A111")).toBeTruthy();
  });

  it("goes quiet when nothing is waiting", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    render(<Page />);
    await screen.findByText("Sadza Republic");
    expect(alarm.silence).toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("M7a · scheduled orders (Order flow v2, D-59)", () => {
  it("adds a 'SCHEDULED · n' section under the board, with each order's slot and ring time", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    const at = new Date();
    at.setDate(at.getDate() + 1);
    at.setHours(12, 30, 0, 0);
    vi.mocked(listScheduledOrders).mockResolvedValue([
      merchantOrder({ id: "a1b20000-0000-4000-8000-000000000000", merchantGoodsTotal: 15, scheduledFor: at.toISOString(), ringsAt: new Date(at.getTime() - 25 * 60_000).toISOString(), scheduleStartedAt: null }),
    ]);
    poll.orders = [merchantOrder({ id: "a2220000-0000-4000-8000-000000000000", merchantPhase: "preparing", prepMinutes: 15, prepStartedAt: new Date().toISOString() })];
    render(<Page />);
    expect(await screen.findByText("SCHEDULED · 1")).toBeTruthy();
    expect(screen.getByText("Tomorrow 12:30–13:00")).toBeTruthy();
    expect(screen.getByText("1 dish · Rings at 12:05 like a new order")).toBeTruthy();
    expect(screen.getByRole("link", { name: /#A1B2/ }).getAttribute("href")).toBe("/queue/a1b20000-0000-4000-8000-000000000000");
  });
});

describe("M1a · an auto-accepted order rings on the same screen until the kitchen confirms it (D-59, D-77)", () => {
  const auto = () =>
    merchantOrder({
      merchantPhase: "preparing",
      autoAccepted: true,
      kitchenConfirmedAt: null,
      prepMinutes: 20,
      prepStartedAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    });

  it("the banner line says 'LyniaGo accepted this for you' with the time left; Accept confirms the kitchen", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [auto()];
    render(<Page />);
    const takeover = await screen.findByRole("alertdialog", { name: "New order #A111" });
    expect(alarm.ring).toHaveBeenCalled();
    expect(within(takeover).getByText("NEW ORDER · #A111")).toBeTruthy();
    expect(within(takeover).getByText("LyniaGo accepted this for you")).toBeTruthy();
    expect(within(takeover).getByLabelText("Time left to answer").textContent).toMatch(/^5[78]:\d\d$/);
    expect(within(takeover).queryByRole("radiogroup", { name: "Ready in" })).toBeNull();
    fireEvent.click(within(takeover).getByRole("button", { name: /^Accept · ready \d\d:\d\d$/ }));
    await vi.waitFor(() => expect(confirmKitchen).toHaveBeenCalledWith("a1110000-0000-4000-8000-000000000001"));
  });

  it("'Can’t take it' cancels it, whatever the reason picked", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    poll.orders = [auto()];
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Can’t take it" }));
    fireEvent.click(screen.getByRole("radio", { name: "Closing soon" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn down #A111" }));
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
  it("closing greys the top card and shows T4 (Merchant v2, D-77); Open now and Open, but busy open again", async () => {
    vi.mocked(getMyMerchant).mockResolvedValue(kitchen());
    const closedUntil = new Date(Date.now() + 3_600_000).toISOString();
    vi.mocked(setOpen).mockResolvedValueOnce(kitchen({ closedUntil }));
    render(<Page />);
    fireEvent.click(await screen.findByRole("switch", { name: "Open" }));
    expect(await screen.findByText("You’re closed")).toBeTruthy();
    expect(screen.getByText(/^Customers can see your menu but can’t order\./)).toBeTruthy();
    expect(setOpen).toHaveBeenCalledWith(false);
    expect(screen.getByRole("switch", { name: "Closed" }).getAttribute("aria-checked")).toBe("false");

    vi.mocked(setOpen).mockResolvedValueOnce(kitchen({ closedUntil: null }));
    vi.mocked(setBusyMode).mockResolvedValueOnce(kitchen({ closedUntil: null, busy: true }));
    fireEvent.click(screen.getByRole("button", { name: "Open, but busy (+10 min)" }));
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
