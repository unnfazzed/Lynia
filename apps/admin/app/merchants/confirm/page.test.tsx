// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import KitchenConfirmationsPage from "./page";
import { adminFetchResult } from "../../lib/api";
import type { KitchenConfirmationRow } from "../../lib/adminTypes";
import { confirmKitchenOrder, editKitchenOrderItems, logKitchenNoAnswer } from "./actions";

vi.mock("../../lib/api", () => ({ adminFetchResult: vi.fn() }));
vi.mock("./actions", () => ({
  confirmKitchenOrder: vi.fn(),
  logKitchenNoAnswer: vi.fn(),
  editKitchenOrderItems: vi.fn(),
  cancelKitchenOrder: vi.fn(),
}));
vi.mock("../../actions/audit", () => ({ submitAdminAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/merchants/confirm" }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function row(over: Partial<KitchenConfirmationRow> = {}): KitchenConfirmationRow {
  return {
    orderId: "11111111-1111-4111-8111-111111111111",
    placedAt: "2026-09-30T10:00:00.000Z",
    waitingMinutes: 3,
    urgent: false,
    restaurant: { id: "m-1", name: "Mama's Kitchen", phone: "+263771234567" },
    customer: { name: "Tendai M", phone: "+263779999999" },
    dropoffLandmark: "Blue gate, Avondale",
    items: [
      { itemId: "i-1", name: "Sadza & Chicken", priceUsd: 5, quantity: 2, note: null, removed: false },
      { itemId: "i-2", name: "Coke", priceUsd: 1, quantity: 1, note: null, removed: false },
    ],
    goodsTotal: 11,
    deliveryFee: 2.5,
    total: 13.5,
    prepMinutes: 20,
    noAnswerCalls: [],
    itemsEdited: false,
    ...over,
  };
}

async function open(orders: KitchenConfirmationRow[]) {
  vi.mocked(adminFetchResult).mockResolvedValue({ data: { orders, escalateAfterMinutes: 5 } });
  render(await KitchenConfirmationsPage());
}

describe("Orders to confirm (auto-accept ops call list)", () => {
  it("shows both numbers, the items and the total, and marks an urgent order", async () => {
    await open([row({ urgent: true, noAnswerCalls: ["2026-09-30T10:04:00.000Z"] })]);
    expect(screen.getByRole("heading", { name: "Orders to confirm" })).toBeTruthy();
    expect(screen.getByText("Urgent")).toBeTruthy();
    expect(screen.getByText("+263771234567")).toBeTruthy();
    expect(screen.getByText("+263779999999")).toBeTruthy();
    expect(screen.getByText(/No answer ×1/)).toBeTruthy();
    expect(screen.getByText("$13.50")).toBeTruthy();
  });

  it("has an empty state", async () => {
    await open([]);
    expect(screen.getByText("No orders waiting for a restaurant to confirm.")).toBeTruthy();
  });

  it("Confirmed and No answer post for that order", async () => {
    vi.mocked(confirmKitchenOrder).mockResolvedValue({ ok: true });
    vi.mocked(logKitchenNoAnswer).mockResolvedValue({ ok: true });
    await open([row()]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmed" }));
    await vi.waitFor(() => expect(confirmKitchenOrder).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111"));
    fireEvent.click(screen.getByRole("button", { name: "No answer" }));
    await vi.waitFor(() => expect(logKitchenNoAnswer).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111"));
  });

  it("Change items sends every line's new quantity (0 removes it)", async () => {
    vi.mocked(editKitchenOrderItems).mockResolvedValue({ ok: true });
    await open([row()]);
    fireEvent.click(screen.getByRole("button", { name: "Change items" }));
    fireEvent.click(screen.getByRole("button", { name: "One less Coke" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() =>
      expect(editKitchenOrderItems).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", [
        { itemId: "i-1", quantity: 2 },
        { itemId: "i-2", quantity: 0 },
      ]),
    );
  });

  it("shows the API's refusal inline", async () => {
    vi.mocked(confirmKitchenOrder).mockResolvedValue({ ok: false, message: "This order is already confirmed or no longer live." });
    await open([row()]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmed" }));
    expect(await screen.findByText("This order is already confirmed or no longer live.")).toBeTruthy();
  });
});
