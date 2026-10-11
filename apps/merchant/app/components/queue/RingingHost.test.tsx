// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import { RingingHost } from "./RingingHost";
import { ToastProvider } from "../m/Toast";
import { ApiError } from "../../lib/api-client";
import { acceptOrder, rejectOrder } from "../../lib/orders-api";
import { merchantOrder } from "../../testing/fixtures";

/**
 * MJ-M12 (merchant journey audit 2026-10-07): a ringing order that ends before anyone here answers it, or
 * an answer the server refuses as the order goes, used to vanish with the screen and say nothing.
 */

const conn = vi.hoisted(() => ({
  value: {
    session: { profileId: "p1" } as unknown,
    actionsDisabled: false,
    heldOrderIds: new Set<string>(),
    queue: { orders: [] as MerchantOrderResponse[], loaded: true, loading: false, error: null, refetch: async () => {} },
  },
}));
const epoch = vi.hoisted(() => ({ current: 0 }));

vi.mock("../KitchenConnectionProvider", () => ({ useKitchenConnection: () => conn.value }));
vi.mock("../../lib/branches", () => ({ useBranchEpoch: () => epoch.current }));
vi.mock("../../lib/business", () => ({ useBusiness: () => null }));
vi.mock("../../lib/orders-api", () => ({
  acceptOrder: vi.fn(),
  cancelPreparing: vi.fn(),
  confirmKitchen: vi.fn(),
  proposeSubstitution: vi.fn(),
  rejectOrder: vi.fn(),
}));

const ringing = () => merchantOrder({ merchantPhase: "awaiting_accept", acceptDeadlineAt: new Date(Date.now() + 120_000).toISOString() });

function setQueue(orders: MerchantOrderResponse[]) {
  conn.value = { ...conn.value, queue: { ...conn.value.queue, orders } };
}

const ui = () => (
  <ToastProvider>
    <RingingHost />
  </ToastProvider>
);

beforeEach(() => {
  conn.value = { ...conn.value, session: { profileId: "p1" } };
  epoch.current = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RingingHost — MJ-M12: a ring that ends unanswered says so", () => {
  it("an order that leaves the queue mid-ring (the customer cancelled) toasts '#A111 was cancelled'", () => {
    setQueue([ringing()]);
    const { rerender } = render(ui());
    expect(screen.getByRole("alertdialog", { name: "New order #A111" })).toBeTruthy();
    setQueue([]);
    rerender(ui());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("#A111 was cancelled");
  });

  it("a late 'Turn down' the server refuses toasts its reason when the order leaves the ring", async () => {
    vi.mocked(rejectOrder).mockRejectedValue(new ApiError(409, "This order was already accepted by your team."));
    const order = ringing();
    setQueue([order]);
    const { rerender } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: "Can’t take it" }));
    fireEvent.click(screen.getByRole("radio", { name: "Too busy right now" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn down #A111" }));
    await vi.waitFor(() => expect(rejectOrder).toHaveBeenCalled());
    // A teammate accepted it: it is still on the board, just not ringing.
    setQueue([{ ...order, merchantPhase: "preparing", prepStartedAt: new Date().toISOString(), prepMinutes: 15 }]);
    await act(async () => rerender(ui()));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("This order was already accepted by your team.");
  });

  it("an order answered here says only its own toast", async () => {
    vi.mocked(acceptOrder).mockResolvedValue(ringing());
    const order = ringing();
    setQueue([order]);
    const { rerender } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: /^Accept · ready/ }));
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^Accepted · ready/));
    setQueue([]);
    await act(async () => rerender(ui()));
    expect(screen.getByRole("status").textContent).toMatch(/^Accepted · ready/);
  });

  it("the merchant's own decline, dropped by a read before the answer returns, is not 'was cancelled'", async () => {
    let resolve: (v: MerchantOrderResponse) => void = () => {};
    vi.mocked(rejectOrder).mockImplementation(() => new Promise((r) => (resolve = r)));
    const order = ringing();
    setQueue([order]);
    const { rerender } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: "Can’t take it" }));
    fireEvent.click(screen.getByRole("radio", { name: "Too busy right now" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn down #A111" }));
    await vi.waitFor(() => expect(rejectOrder).toHaveBeenCalled());
    // The socket read lands first: the declined order has left the queue.
    setQueue([]);
    await act(async () => rerender(ui()));
    expect(screen.queryByText("#A111 was cancelled")).toBeNull();
    await act(async () => resolve({ ...order, status: "cancelled" }));
    expect(screen.queryByText("#A111 was cancelled")).toBeNull();
  });

  it("an order a teammate answered (still on the board) goes quietly", () => {
    const order = ringing();
    setQueue([order]);
    const { rerender } = render(ui());
    setQueue([{ ...order, merchantPhase: "preparing", prepStartedAt: new Date().toISOString(), prepMinutes: 15 }]);
    rerender(ui());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a branch switch or a sign-out says nothing", () => {
    setQueue([ringing()]);
    const { rerender } = render(ui());
    epoch.current = 1;
    rerender(ui());
    setQueue([]);
    rerender(ui());
    expect(screen.queryByRole("status")).toBeNull();

    epoch.current = 0;
    setQueue([ringing()]);
    rerender(ui());
    conn.value = { ...conn.value, session: null };
    rerender(ui());
    expect(screen.queryByRole("status")).toBeNull();
  });
});
