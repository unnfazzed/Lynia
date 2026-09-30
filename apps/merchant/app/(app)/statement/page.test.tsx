// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantEndOfDaySummaryResponse, MerchantWeeklyStatementResponse } from "@lynia/shared";
import MoneyPage from "./page";
import { ApiError } from "../../lib/api-client";
import { getTodaySummary, getWeeklyStatement } from "../../lib/orders-api";
import { loadBusiness } from "../../lib/business";
import { merchantProfile } from "../../testing/fixtures";

vi.mock("../../lib/orders-api", () => ({
  getTodaySummary: vi.fn(),
  getWeeklyStatement: vi.fn(),
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
    overdue: [{ orderId: "a0980000-0000-4000-8000-000000000000", amount: 9.5, riderName: "Tino", dueAt: new Date(2026, 8, 30, 11, 40).toISOString() }],
    lines: [
      { orderId: "a1110000-0000-4000-8000-000000000000", at: new Date(2026, 8, 30, 12, 31).toISOString(), outcome: "delivered", amount: 12 },
      { orderId: "a0900000-0000-4000-8000-000000000000", at: new Date(2026, 8, 30, 11, 10).toISOString(), outcome: "rejected", amount: 0 },
    ],
  };
}

function statement(): MerchantWeeklyStatementResponse {
  return {
    rangeStart: "2026-07-27",
    rangeEnd: "2026-08-03",
    ordersDelivered: 3,
    foodSalesTotal: 30,
    commissionCharged: 0,
    commissionRatePct: 0,
    illustrativeRatePct: 10,
    illustrativeCommission: 3,
    cookedFoodLossTotal: 0,
    lineItems: [{ orderId: "a1110000-0000-4000-8000-000000000000", deliveredAt: new Date(2026, 8, 29, 12, 31).toISOString(), paymentMethod: "cash", amount: 12, commission: 0 }],
  };
}

// LC-D##: before this fix, a failed load rendered a static error box with no button — the only
// escape was navigating to a different tab and back, remounting the page.
describe("StatementPage initial-load failure has a way out (LC-D##)", () => {
  it("shows a Retry button on a failed load, and retrying recovers to the ready state", async () => {
    vi.mocked(getTodaySummary)
      .mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."))
      .mockResolvedValueOnce(today());
    vi.mocked(getWeeklyStatement).mockResolvedValue(statement());

    render(<MoneyPage />);
    await screen.findByText("Couldn't reach the server — check the connection and try again.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByText("$59.50");
    expect(getTodaySummary).toHaveBeenCalledTimes(2);
  });
});

describe("C3 · Money (merchant mobile, D-48)", () => {
  it("today: sales, the overdue row that opens its order, and how each order ended", async () => {
    vi.mocked(getTodaySummary).mockResolvedValue(today());
    vi.mocked(getWeeklyStatement).mockResolvedValue(statement());
    render(<MoneyPage />);
    expect(await screen.findByText("$59.50")).toBeTruthy();
    expect(screen.getByText("Sales · 7 orders")).toBeTruthy();
    expect(screen.getByText("$9.50 overdue")).toBeTruthy();
    expect(screen.getByText("#A098 · Tino · due 11:40")).toBeTruthy();
    expect(screen.getByRole("link", { name: /overdue/ }).getAttribute("href")).toBe("/queue/a0980000-0000-4000-8000-000000000000");
    expect(screen.getByText("#A111 · 12:31")).toBeTruthy();
    expect(screen.getByText("Rejected")).toBeTruthy();
    expect(screen.getByText("$0.00")).toBeTruthy();
    expect(screen.queryByText(/Commission/)).toBeNull();
  });

  it("this week: the week's delivered sales", async () => {
    vi.mocked(getTodaySummary).mockResolvedValue(today());
    vi.mocked(getWeeklyStatement).mockResolvedValue(statement());
    render(<MoneyPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "This week" }));
    expect(screen.getByText("Sales · 3 orders")).toBeTruthy();
    expect(screen.getByText("$30.00")).toBeTruthy();
    expect(screen.getByText(/^#A111 · \w+ 12:31$/)).toBeTruthy();
  });
});

describe("Money is the owner's (merchant web upgrade L4)", () => {
  it("Staff who reach it get one line, and the API isn't asked", async () => {
    vi.mocked(loadBusiness).mockResolvedValueOnce(merchantProfile({ myRole: "staff" }));
    render(<MoneyPage />);
    expect(await screen.findByText("Only the owner sees the money.")).toBeTruthy();
    expect(getTodaySummary).not.toHaveBeenCalled();
    expect(getWeeklyStatement).not.toHaveBeenCalled();
  });
});
