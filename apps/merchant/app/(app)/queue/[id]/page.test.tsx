// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import OrderPage from "./page";
import { ToastProvider } from "../../../components/m/Toast";
import {
  cancelPreparing,
  closeOrder,
  confirmKitchen,
  confirmReturnedCash,
  editOrderItems,
  dispatchCancel,
  dispatchResume,
  getOrder,
  markReady,
  revealPickupCode,
} from "../../../lib/orders-api";
import { merchantOrder, merchantProfile, RIDER } from "../../../testing/fixtures";

const ID = "a1110000-0000-4000-8000-000000000001";
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace, push: vi.fn() };
  return { useRouter: () => router, useParams: () => ({ id: "a1110000-0000-4000-8000-000000000001" }) };
});
vi.mock("../../../lib/orders-api", () => ({
  getOrder: vi.fn(),
  markReady: vi.fn(async () => ({})),
  cancelPreparing: vi.fn(async () => ({})),
  confirmKitchen: vi.fn(async () => ({})),
  editOrderItems: vi.fn(async () => ({})),
  closeOrder: vi.fn(async () => ({})),
  confirmReturnedCash: vi.fn(async () => ({})),
  confirmGoodsReturned: vi.fn(async () => ({})),
  reportNonReturn: vi.fn(async () => ({})),
  dispatchResume: vi.fn(async () => ({})),
  dispatchCancel: vi.fn(async () => ({})),
  revealPickupCode: vi.fn(async () => ({ pickupCode: "7205" })),
  logCall: vi.fn(),
  requestPayment: vi.fn(),
  confirmPayment: vi.fn(),
  releaseUnpaid: vi.fn(),
  refundOrder: vi.fn(),
}));
vi.mock("../../../lib/business", () => ({ useBusiness: () => merchantProfile() }));
vi.mock("../../../components/KitchenConnectionProvider", () => ({
  useKitchenConnection: () => ({ actionsDisabled: false, signOut: vi.fn() }),
}));
vi.mock("../../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function show(order: MerchantOrderResponse) {
  vi.mocked(getOrder).mockResolvedValue(order);
  render(
    <ToastProvider>
      <OrderPage />
    </ToastProvider>,
  );
}

const cooking = () => merchantOrder({ id: ID, merchantPhase: "preparing", prepMinutes: 15, prepStartedAt: new Date(Date.now() - 5 * 60_000).toISOString() });

describe("B3 · Cooking ticket (merchant mobile, D-48)", () => {
  it("shows the prep ring, the lines and the steps — no rider yet, dispatch waits for 'Food is ready'", async () => {
    show(cooking());
    expect(await screen.findByText("Cooking")).toBeTruthy();
    expect(screen.getByText(/^9:5\d|^10:00/)).toBeTruthy();
    expect(screen.getByText("Sadza & beef stew")).toBeTruthy();
    expect(screen.queryByText(/Rider secured/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Food is ready" }));
    await vi.waitFor(() => expect(markReady).toHaveBeenCalledWith(ID));
    expect(await screen.findByText("Marked ready · finding a rider")).toBeTruthy();
  });

  it("'Can't finish this order' cancels a cash order behind the confirm sheet", async () => {
    show(cooking());
    fireEvent.click(await screen.findByRole("button", { name: "Can’t finish this order" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    await vi.waitFor(() => expect(cancelPreparing).toHaveBeenCalledWith(ID));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));
  });
});

describe("B4 · Handover", () => {
  it("before a rider takes it, says a rider is being found — no code yet", async () => {
    show(merchantOrder({ id: ID, merchantPhase: "ready_for_pickup", status: "open_for_offers" }));
    expect(await screen.findByText("Finding a rider")).toBeTruthy();
    expect(revealPickupCode).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Hand over" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("with a rider coming, shows the rider and the code they type — asked for once, since asking rotates it", async () => {
    show(merchantOrder({ id: ID, merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER }));
    expect(await screen.findByText("Blessing M.")).toBeTruthy();
    expect(await screen.findByLabelText("Pickup code 7 2 0 5")).toBeTruthy();
    expect(screen.getByText("AFG 2231 · ★ 4.9")).toBeTruthy();
    expect(screen.getByText("The rider types this code in their app")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(revealPickupCode).toHaveBeenCalledTimes(1);
  });

  it("once the rider's code matched, Hand over moves to tracking", async () => {
    show(merchantOrder({ id: ID, merchantPhase: null, status: "picked_up", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open" }));
    expect(await screen.findByText("✓ Code matches")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hand over" }));
    expect(await screen.findByText("#A111 on the way")).toBeTruthy();
  });

  it("a no-rider hold offers Keep searching, or cancelling behind the confirm sheet", async () => {
    show(merchantOrder({ id: ID, merchantPhase: "ready_for_pickup", status: "open_for_offers", noRiderHoldAt: new Date().toISOString() }));
    fireEvent.click(await screen.findByRole("button", { name: "Keep searching" }));
    await vi.waitFor(() => expect(dispatchResume).toHaveBeenCalledWith(ID));
    expect(await screen.findByText("Searching again")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel order" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel order" }).at(-1)!);
    await vi.waitFor(() => expect(dispatchCancel).toHaveBeenCalledWith(ID));
  });
});

describe("B6 · Tracking", () => {
  it("shows the stepper, and 'Mark ride completed' closes the merchant's side after a neutral confirm", async () => {
    show(merchantOrder({ id: ID, merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open", debtAmount: 12 }));
    expect(await screen.findByText("#A111 on the way")).toBeTruthy();
    expect(screen.getByText("Cash back to you")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark ride completed" }));
    expect(screen.getByText("This closes the order now, even if steps are left.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark completed" }));
    await vi.waitFor(() => expect(closeOrder).toHaveBeenCalledWith(ID, "force"));
  });
});

describe("B7 · Delivered + cash back", () => {
  const delivered = () =>
    merchantOrder({
      id: ID,
      merchantPhase: null,
      status: "delivered",
      riderId: RIDER.profileId,
      rider: RIDER,
      debtStatus: "open",
      debtAmount: 12,
      deliveredAt: new Date(Date.now() - 8 * 60_000).toISOString(),
      cashDueAt: new Date(Date.now() + 22 * 60_000).toISOString(),
    });

  it("says who is bringing how much and by when; 'I got $12.00' counts it", async () => {
    show(delivered());
    expect(await screen.findByText("CASH BACK TO YOU")).toBeTruthy();
    expect(screen.getByText("Blessing M. is bringing")).toBeTruthy();
    expect(screen.getByText(/· 22 min left$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I got $12.00" }));
    await vi.waitFor(() => expect(confirmReturnedCash).toHaveBeenCalledWith(ID, 12));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));
  });

  it("'No cash on this one' closes it without cash after a neutral confirm", async () => {
    show(delivered());
    fireEvent.click(await screen.findByRole("button", { name: "No cash on this one · mark completed" }));
    expect(screen.getByText("Nothing will show as owed for this order.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close order" }));
    await vi.waitFor(() => expect(closeOrder).toHaveBeenCalledWith(ID, "no_cash"));
  });

  it("the steps row opens the full timeline", async () => {
    show(delivered());
    fireEvent.click(await screen.findByRole("button", { name: /of 8 steps done/ }));
    expect(screen.getByText("Order placed")).toBeTruthy();
  });
});

describe("a ringing order", () => {
  it("is answered on the Orders home, where the alarm is", async () => {
    show(merchantOrder({ id: ID }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));
  });
});

describe("Auto-accept: the Cooking ticket of an order LyniaGo accepted for the restaurant", () => {
  const LINES = [
    { itemId: "b0000001-0000-4000-8000-000000000000", dishId: null, name: "Sadza & beef stew", priceUsd: 5, quantity: 2, note: null, available: true },
    { itemId: "b0000002-0000-4000-8000-000000000000", dishId: null, name: "Coke", priceUsd: 1, quantity: 1, note: null, available: true },
  ];
  const auto = (over: Partial<MerchantOrderResponse> = {}) =>
    merchantOrder({ ...cooking(), autoAccepted: true, kitchenConfirmedAt: null, items: LINES, customerPhone: "+263779999999", ...over });

  it("asks the kitchen to confirm, which lets a rider be sent", async () => {
    show(auto());
    expect(await screen.findByText("LyniaGo accepted this for you")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Got it, we’re making it" }));
    await vi.waitFor(() => expect(confirmKitchen).toHaveBeenCalledWith(ID));
  });

  it("no confirm card once the kitchen confirmed", async () => {
    show(auto({ kitchenConfirmedAt: "2026-09-30T12:01:00Z" }));
    expect(await screen.findByText("Cooking")).toBeTruthy();
    expect(screen.queryByText("LyniaGo accepted this for you")).toBeNull();
  });

  it("shows the customer's number to call", async () => {
    show(auto());
    expect(await screen.findByRole("link", { name: /Call the customer/ })).toBeTruthy();
  });

  it("Change items sends every line's new quantity", async () => {
    show(auto());
    fireEvent.click(await screen.findByRole("button", { name: "Change items" }));
    fireEvent.click(screen.getByRole("button", { name: "One less Coke" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() =>
      expect(editOrderItems).toHaveBeenCalledWith(ID, {
        lines: [
          { itemId: "b0000001-0000-4000-8000-000000000000", quantity: 2 },
          { itemId: "b0000002-0000-4000-8000-000000000000", quantity: 0 },
        ],
      }),
    );
  });
});
