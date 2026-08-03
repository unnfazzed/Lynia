// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantEndOfDaySummaryResponse, MerchantWeeklyStatementResponse } from "@lynia/shared";
import StatementPage from "./page";
import { ApiError } from "../../lib/api-client";
import { getTodaySummary, getWeeklyStatement } from "../../lib/orders-api";

vi.mock("../../lib/orders-api", () => ({
  getTodaySummary: vi.fn(),
  getWeeklyStatement: vi.fn(),
}));

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
  return { date: "2026-08-03", delivered: 3, cashTaken: 10, walletTaken: 5, rejected: 0, averagePrepMinutes: 12 };
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
    lineItems: [],
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

    render(<StatementPage />);
    await screen.findByText("Couldn't reach the server — check the connection and try again.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByText("Today's summary");
    expect(getTodaySummary).toHaveBeenCalledTimes(2);
  });
});
