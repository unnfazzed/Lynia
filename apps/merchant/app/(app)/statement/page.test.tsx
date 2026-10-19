// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantEndOfDaySummaryResponse, MerchantWeekSummaryResponse } from "@lynia/shared";
import MoneyPage from "./page";
import { daySub, weekRange } from "../../lib/money-view";
import { ApiError } from "../../lib/api-client";
import { getTodaySummary, getWeekSummary } from "../../lib/orders-api";
import { loadBusiness } from "../../lib/business";
import { merchantProfile } from "../../testing/fixtures";
import { getFleetBills, getFleetRides } from "../../lib/fleet-api";

vi.mock("../../lib/fleet-api", () => ({ getFleetRides: vi.fn(), getFleetBills: vi.fn() }));
vi.mock("../../lib/orders-api", () => ({
  getTodaySummary: vi.fn(),
  getWeekSummary: vi.fn(),
}));
// The owner's, unless a test says otherwise (L4: Staff don't see the statement).
vi.mock("../../lib/business", () => ({ loadBusiness: vi.fn(async () => null) }));

const signOut = vi.fn();
vi.mock("../../components/KitchenConnectionProvider", () => ({
  useKitchenConnection: () => ({ signOut }),
}));

vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function today(): MerchantEndOfDaySummaryResponse {
  return {
    date: "2026-09-30",
    delivered: 3,
    cashTaken: 10,
    walletTaken: 0,
    rejected: 1,
    averagePrepMinutes: 12,
    orders: 7,
    sales: 59.5,
    cashOverdue: 9.5,
    overdue: [
      { orderId: "a0980000-0000-4000-8000-000000000000", amount: 9.5, riderName: "Tino", riderPhone: "+263771112222", dueAt: new Date(2026, 8, 30, 11, 40).toISOString() },
      { orderId: "b0980000-0000-4000-8000-000000000000", amount: 51, riderName: "Blessing", dueAt: new Date(2026, 8, 30, 12, 10).toISOString(), kind: "booking" as const },
    ],
    lines: [
      { orderId: "a1110000-0000-4000-8000-000000000000", at: new Date(2026, 8, 30, 12, 31).toISOString(), outcome: "delivered", cash: "in", amount: 12 },
      { orderId: "a0980000-0000-4000-8000-000000000000", at: new Date(2026, 8, 30, 11, 52).toISOString(), outcome: "delivered", cash: "late", amount: 9.5 },
      { orderId: "a1200000-0000-4000-8000-000000000000", at: new Date(2026, 8, 30, 12, 48).toISOString(), outcome: "delivered", cash: "due", dueAt: new Date(2026, 8, 30, 13, 5).toISOString(), amount: 8 },
      { orderId: "a0900000-0000-4000-8000-000000000000", at: new Date(2026, 8, 30, 11, 10).toISOString(), outcome: "rejected", reason: "too_busy", amount: 0 },
      { orderId: "a0850000-0000-4000-8000-000000000000", at: new Date(2026, 8, 30, 10, 2).toISOString(), outcome: "rejected", reason: "shop_closed", amount: 0 },
    ],
  };
}

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};

function statement(): MerchantWeekSummaryResponse {
  return {
    start: daysAgo(3).toISOString(),
    orders: 22,
    sales: 180,
    days: [
      { date: key(daysAgo(2)), orders: 6, sales: 48, cashLate: 0, cashDue: 0, rejected: 1 },
      { date: key(daysAgo(1)), orders: 9, sales: 72, cashLate: 0, cashDue: 0, rejected: 0 },
      { date: key(daysAgo(0)), orders: 7, sales: 59.5, cashLate: 9.5, cashDue: 0, rejected: 0 },
    ],
  };
}

// LC-D##: before this fix, a failed load rendered a static error box with no button — the only
// escape was navigating to a different tab and back, remounting the page.
describe("StatementPage initial-load failure has a way out (LC-D##)", () => {
  it("shows a Retry button on a failed load, and retrying recovers to the ready state", async () => {
    vi.mocked(getTodaySummary)
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."))
      .mockResolvedValueOnce(today());
    vi.mocked(getWeekSummary).mockResolvedValue(statement());

    render(<MoneyPage />);
    await screen.findByText("Couldn't reach the server — check the connection and try again.");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByText("$59.50");
    expect(getTodaySummary).toHaveBeenCalledTimes(2);
  });
});

describe("T2 · Money (Merchant v2, D-77)", () => {
  it("today: sales, a late-cash card with Call, and the ledger — credits green, cash on its way with when, late cash gold, 'No sale'", async () => {
    vi.mocked(getTodaySummary).mockResolvedValue(today());
    vi.mocked(getWeekSummary).mockResolvedValue(statement());
    render(<MoneyPage />);
    expect(await screen.findByText("$59.50")).toBeTruthy();
    expect(screen.getByText("SALES · 7 ORDERS")).toBeTruthy();
    expect(screen.getByText("$9.50 cash is late")).toBeTruthy();
    expect(screen.getByText("#A098 · Tino · was due 11:40")).toBeTruthy();
    expect(screen.getByRole("link", { name: /\$9\.50 cash is late/ }).getAttribute("href")).toBe("/queue/order?id=a0980000-0000-4000-8000-000000000000");
    expect(screen.getByRole("link", { name: "Call Tino" }).getAttribute("href")).toBe("tel:+263771112222");
    // A shop booking's cash on delivery opens the booking (D-48 PR 4b); no number, no Call.
    expect(screen.getByRole("link", { name: /\$51\.00 cash is late/ }).getAttribute("href")).toBe("/deliveries/booking?id=b0980000-0000-4000-8000-000000000000");
    expect(screen.queryByRole("link", { name: "Call Blessing" })).toBeNull();
    expect(screen.getByText("TODAY")).toBeTruthy();
    expect(screen.getByText("#A111 · 12:31")).toBeTruthy();
    expect(screen.getByText("Delivered · cash back in")).toBeTruthy();
    expect(screen.getByText("+$12.00")).toBeTruthy();
    expect(screen.getByText("Delivered · cash late")).toBeTruthy();
    // T2 (follow-ups): cash on its way is plain "$8.00" with when it's back.
    expect(screen.getByText("Delivered · cash on its way · back by 13:05")).toBeTruthy();
    expect(screen.getByText("$8.00")).toBeTruthy();
    expect(screen.getByText("You couldn't take it · Too busy")).toBeTruthy();
    expect(screen.getByText("Missed · no answer in time")).toBeTruthy();
    expect(screen.getAllByText("No sale")).toHaveLength(2);
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(screen.queryByText(/Commission/)).toBeNull();
  });

  it("T2b this week: the week's total and range, the bars, one row per day newest first; a day opens in the Today layout", async () => {
    const earlier = { ...today(), orders: 6, sales: 48, overdue: [], lines: [{ orderId: "a0910000-0000-4000-8000-000000000000", at: new Date().toISOString(), outcome: "delivered" as const, cash: "in" as const, amount: 8 }] };
    vi.mocked(getTodaySummary).mockImplementation(async (date?: string) => (date ? earlier : today()));
    vi.mocked(getWeekSummary).mockResolvedValue(statement());
    const { container } = render(<MoneyPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "This week" }));
    expect(screen.getByText(`SALES · 22 ORDERS · ${weekRange(daysAgo(3).toISOString())}`)).toBeTruthy();
    expect(screen.getByText("$180.00")).toBeTruthy();
    // Late-cash cards are Today's, not the week's.
    expect(screen.queryByText("$9.50 cash is late")).toBeNull();
    expect(container.querySelectorAll(".m-weekbars > div")).toHaveLength(7);
    expect(container.querySelectorAll(".m-weekbars > div[data-today]")).toHaveLength(1);
    const rows = screen.getAllByRole("button").filter((b) => b.classList.contains("m-dayrow"));
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toMatch(/· today7 orders · \$9\.50 cash late\$59\.50/);
    expect(rows[1]!.textContent).toContain("9 orders · all cash in");
    expect(rows[2]!.textContent).toContain("6 orders · 1 you couldn't take");
    fireEvent.click(rows[2]!);
    expect(getTodaySummary).toHaveBeenLastCalledWith(key(daysAgo(2)));
    expect(await screen.findByText("SALES · 6 ORDERS")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "This week" }).getAttribute("aria-selected")).toBe("true");
    // Today's row goes back to Today.
    fireEvent.click(screen.getByRole("tab", { name: "This week" }));
    fireEvent.click(screen.getAllByRole("button").find((b) => b.textContent?.includes("· today"))!);
    expect(screen.getByRole("tab", { name: "Today" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("TODAY")).toBeTruthy();
  });
});

describe("T2b day lines (follow-ups, D-77)", () => {
  const d = { date: "2026-10-04", orders: 7, sales: 59.5, cashLate: 0, cashDue: 0, rejected: 0 };
  it("late cash first, then orders not taken, then cash on its way, else all cash in", () => {
    expect(daySub({ ...d, cashLate: 9.5, rejected: 1 })).toEqual({ text: "7 orders · $9.50 cash late", late: true });
    expect(daySub({ ...d, rejected: 1 })).toEqual({ text: "7 orders · 1 you couldn't take", late: false });
    expect(daySub({ ...d, cashDue: 4 }).text).toBe("7 orders · cash on its way");
    expect(daySub(d).text).toBe("7 orders · all cash in");
    expect(daySub({ ...d, orders: 0, sales: 0 }).text).toBe("0 orders");
  });
  it("the week's range reads like the header", () => {
    expect(weekRange(new Date(2026, 8, 28).toISOString())).toBe("28 SEP–4 OCT");
    expect(weekRange(new Date(2026, 9, 5).toISOString())).toBe("5–11 OCT");
  });
  it("MJ-RM7 (review): a Harare day key is read as that date, never shifted by the browser's zone", () => {
    expect(weekRange("2026-09-28")).toBe("28 SEP–4 OCT");
    expect(weekRange("2026-10-26")).toBe("26 OCT–1 NOV");
  });
});

describe("MJ-RM7 (review): the week view comes from the server's Harare day keys", () => {
  it("bars, today's marker and the range follow startKey/dateKey, not week.start read in the browser's zone", async () => {
    // Harare's Monday 28 Sep starts at 27 Sep 22:00 UTC — a UTC browser's local getters read that as Sunday.
    vi.mocked(getTodaySummary).mockResolvedValue({ ...today(), date: "2026-09-29T22:00:00.000Z", dateKey: "2026-09-30" });
    vi.mocked(getWeekSummary).mockResolvedValue({
      start: "2026-09-27T22:00:00.000Z",
      startKey: "2026-09-28",
      orders: 3,
      sales: 30,
      days: [
        { date: "2026-09-28", orders: 1, sales: 10, cashLate: 0, cashDue: 0, rejected: 0 },
        { date: "2026-09-29", orders: 1, sales: 10, cashLate: 0, cashDue: 0, rejected: 0 },
        { date: "2026-09-30", orders: 1, sales: 10, cashLate: 0, cashDue: 0, rejected: 0 },
      ],
    });
    const { container } = render(<MoneyPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "This week" }));
    expect(screen.getByText("SALES · 3 ORDERS · 28 SEP–4 OCT")).toBeTruthy();
    const bars = [...container.querySelectorAll(".m-weekbars > div")];
    // Mon, Tue, Wed carry sales; Wednesday (the server's Harare today) is marked today.
    expect(bars.map((b) => (b.querySelector("span") as HTMLElement).style.height)).toEqual(["56px", "56px", "56px", "0px", "0px", "0px", "0px"]);
    expect(bars.findIndex((b) => b.hasAttribute("data-today"))).toBe(2);
    expect(screen.getAllByRole("button").find((b) => b.textContent?.includes("· today"))!.textContent).toContain("Wed 30 Sep");
  });
});

describe("Money is the owner's (merchant web upgrade L4)", () => {
  it("Staff who reach it get one line, and the API isn't asked", async () => {
    vi.mocked(loadBusiness).mockResolvedValueOnce(merchantProfile({ myRole: "staff" }));
    render(<MoneyPage />);
    expect(await screen.findByText("Only the owner sees the money.")).toBeTruthy();
    expect(getTodaySummary).not.toHaveBeenCalled();
    expect(getWeekSummary).not.toHaveBeenCalled();
  });
});

describe("MJ-RL9: a day of This week that fails to load", () => {
  it("stays open with Try again — it doesn't snap back to the week — and Try again opens that day", async () => {
    const earlier = { ...today(), orders: 6, sales: 48, overdue: [], lines: [] };
    let failDay = true;
    vi.mocked(getTodaySummary).mockImplementation(async (date?: string) => {
      if (!date) return today();
      if (failDay) throw new ApiError(0, "Couldn't reach the server — check the connection and try again.");
      return earlier;
    });
    vi.mocked(getWeekSummary).mockResolvedValue(statement());
    render(<MoneyPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "This week" }));
    const rows = screen.getAllByRole("button").filter((b) => b.classList.contains("m-dayrow"));
    fireEvent.click(rows[2]!);
    expect(await screen.findByText("Couldn't reach the server — check the connection and try again.")).toBeTruthy();
    expect(screen.queryAllByRole("button").filter((b) => b.classList.contains("m-dayrow"))).toHaveLength(0);
    expect(screen.queryByText("Loading…")).toBeNull();
    failDay = false;
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("SALES · 6 ORDERS")).toBeTruthy();
    expect(getTodaySummary).toHaveBeenLastCalledWith(key(daysAgo(2)));
  });
});

describe("OB-M14 (Own bikers, D-117): FLEET RIDES under This week", () => {
  const AV = merchantProfile().id;
  const owner = () => vi.mocked(loadBusiness).mockResolvedValue({ ...merchantProfile(), name: "Avondale", myRole: "owner" } as never);
  const ready = () => {
    vi.mocked(getTodaySummary).mockResolvedValue(today());
    vi.mocked(getWeekSummary).mockResolvedValue(statement());
  };
  const rides = {
    weekStart: key(daysAgo(3)),
    weekEnd: key(daysAgo(-3)),
    rides: 1,
    total: "1.50",
    lines: [
      { orderId: "a3110000-0000-4000-8000-000000000000", ref: "#B204", at: new Date().toISOString(), kind: "booking" as const, fee: "1.50", reason: null, biker: "Tendai" },
      { orderId: "a1900000-0000-4000-8000-000000000000", ref: "#B190", at: new Date().toISOString(), kind: "booking" as const, fee: "1.50", reason: null, biker: "Tendai" },
      { orderId: "a1900000-0000-4000-8000-000000000000", ref: "#B190", at: new Date().toISOString(), kind: "adjustment" as const, fee: "-1.50", reason: "wrong fee", biker: null },
    ],
  };
  const bills = {
    thisWeek: { rides: 9, total: "13.50", branches: [{ merchantId: AV, name: "Avondale", rides: 1, total: "1.50" }, { merchantId: "b0000000-0000-4000-8000-000000000000", name: "Borrowdale", rides: 8, total: "12.00" }] },
    bills: [],
  };
  afterEach(() => {
    vi.mocked(loadBusiness).mockReset();
    vi.mocked(loadBusiness).mockResolvedValue(null);
    window.localStorage.clear();
  });

  it("the running bill, this branch's rides by biker with the credit, the other branch's line; only once This week opens", async () => {
    owner();
    ready();
    vi.mocked(getFleetRides).mockResolvedValue(rides);
    vi.mocked(getFleetBills).mockResolvedValue(bills);
    render(<MoneyPage />);
    await screen.findByText("SALES · 7 ORDERS");
    expect(getFleetRides).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "This week" }));
    expect(await screen.findByText(/^Fleet bill · .* · \$13\.50 · Due /)).toBeTruthy();
    expect(screen.getByText("Unpaid")).toBeTruthy();
    expect(screen.getByText("FLEET RIDES")).toBeTruthy();
    expect(screen.getByText("Avondale · 1 ride · $1.50")).toBeTruthy();
    expect(screen.getByText("Borrowdale · 8 rides · $12.00")).toBeTruthy();
    expect(screen.getByText(/^#B204 · Tendai · \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByText("Credit · #B190 · wrong fee")).toBeTruthy();
    expect(screen.getByText("−$1.50").closest("[data-muted]")).toBeTruthy();
  });

  it("an overdue bill says how many days in words, in danger; no rides anywhere is one 'No fleet rides this week' row", async () => {
    owner();
    ready();
    vi.mocked(getFleetRides).mockResolvedValue({ ...rides, rides: 0, total: "0.00", lines: [] });
    vi.mocked(getFleetBills).mockResolvedValue({
      thisWeek: { rides: 0, total: "0.00", branches: [] },
      bills: [{ id: "c0000000-0000-4000-8000-000000000000", periodStart: "2026-09-21", periodEnd: "2026-09-27", dueOn: "2026-10-02", total: "36.00", state: "overdue", daysOverdue: 2, paidAt: null, branches: [] }],
    });
    render(<MoneyPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "This week" }));
    expect(await screen.findByText("Fleet bill · 21–27 Sep · $36.00 · Due Fri 2 Oct")).toBeTruthy();
    expect(screen.getByText("2 days overdue · Talk to LyniaGo to pay")).toBeTruthy();
    expect(screen.getByText("Overdue").closest("[data-state='overdue']")).toBeTruthy();
    expect(screen.getByText("No fleet rides this week")).toBeTruthy();
  });

  it("a business without Own bikers gets no section; a failed read gets Try again; offline shows the last read 'as of'", async () => {
    owner();
    ready();
    vi.mocked(getFleetRides).mockRejectedValue(new ApiError(409, "Own bikers isn't on for this business."));
    vi.mocked(getFleetBills).mockRejectedValue(new ApiError(409, "Own bikers isn't on for this business."));
    const { unmount } = render(<MoneyPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "This week" }));
    await vi.waitFor(() => expect(getFleetRides).toHaveBeenCalled());
    await screen.findByText(/· today/);
    expect(screen.queryByText("FLEET RIDES")).toBeNull();
    unmount();

    // A first good read is remembered for this branch…
    vi.mocked(getFleetRides).mockResolvedValue(rides);
    vi.mocked(getFleetBills).mockResolvedValue(bills);
    const second = render(<MoneyPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "This week" }));
    await screen.findByText("Avondale · 1 ride · $1.50");
    second.unmount();

    // …then offline it is shown under the strip; a server error with nothing usable is the red strip.
    vi.mocked(getFleetRides).mockRejectedValue(new ApiError(0, "offline"));
    const third = render(<MoneyPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "This week" }));
    expect(await screen.findByText(/^Offline · showing this week as of \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByText("Avondale · 1 ride · $1.50")).toBeTruthy();
    third.unmount();

    vi.mocked(getFleetRides).mockRejectedValue(new ApiError(500, "boom"));
    render(<MoneyPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "This week" }));
    expect(await screen.findByText("Couldn't load fleet rides")).toBeTruthy();
    vi.mocked(getFleetRides).mockResolvedValue(rides);
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Avondale · 1 ride · $1.50")).toBeTruthy();
  });
});
