// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import OrderPage from "./page";
import { ToastProvider } from "../../../components/m/Toast";
import {
  cancelPreparing,
  closeOrder,
  confirmGoodsReturned,
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
  revealPickupCode: vi.fn(async () => ({ pickupCode: "731604" })),
  logCall: vi.fn(),
  requestPayment: vi.fn(),
  confirmPayment: vi.fn(),
  releaseUnpaid: vi.fn(),
  refundOrder: vi.fn(),
}));
const business = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../lib/business", () => ({ useBusiness: () => business.current ?? merchantProfile() }));
vi.mock("../../../components/KitchenConnectionProvider", () => ({
  useKitchenConnection: () => ({ actionsDisabled: false, signOut: vi.fn() }),
}));
vi.mock("../../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  business.current = null;
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

describe("M3a · Cooking ticket (Order flow v2, D-59)", () => {
  it("shows the prep ring with the ready time, the priced lines and the four-step track; 'Food is ready' finds a rider", async () => {
    show(cooking());
    expect(await screen.findByText(/^Cooking · ready \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByText("Rider found 8 min before ready")).toBeTruthy();
    expect(screen.getByText(/^9:5\d|^10:00/)).toBeTruthy();
    expect(screen.getByText("Sadza & beef stew")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Step 2 of 4: Cooking" })).toBeTruthy();
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

describe("M3b · a shop packs", () => {
  it("speaks Packing and 'Order is packed'", async () => {
    business.current = merchantProfile({ businessType: "shop", shopKind: "pharmacy" });
    show(cooking());
    expect(await screen.findByText(/^Packing · ready /)).toBeTruthy();
    expect(screen.getByRole("list", { name: "Step 2 of 4: Packing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Order is packed" })).toBeTruthy();
  });
});

describe("M4 · Hand-over", () => {
  it("before a rider takes it, says a rider is being found — no code yet", async () => {
    show(merchantOrder({ id: ID, merchantPhase: "ready_for_pickup", status: "open_for_offers" }));
    expect(await screen.findByText("Finding a rider")).toBeTruthy();
    expect(revealPickupCode).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Hand over" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("with a rider coming, reads the six-digit code out 3+3 — asked for once, since asking rotates it", async () => {
    show(merchantOrder({ id: ID, merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER }));
    expect(await screen.findByText("Blessing M.")).toBeTruthy();
    expect(screen.getByText("Hand over #A111")).toBeTruthy();
    expect(screen.getByText("Read this pickup code to Blessing M.")).toBeTruthy();
    const code = await screen.findByLabelText("Pickup code 7 3 1 6 0 4");
    expect([...code.children].map((c) => c.textContent)).toEqual(["731", "604"]);
    expect(screen.getByText("AFG 2231 · ★ 4.9")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(revealPickupCode).toHaveBeenCalledTimes(1);
  });

  it("a legacy four-digit code shows whole", async () => {
    vi.mocked(revealPickupCode).mockResolvedValueOnce({ pickupCode: "7205" });
    show(merchantOrder({ id: ID, merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER }));
    expect((await screen.findByLabelText("Pickup code 7 2 0 5")).textContent).toBe("7205");
  });

  it("an auto-accepted order is collected without a code, so none is asked for", async () => {
    show(merchantOrder({ id: ID, merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER, autoAccepted: true, kitchenConfirmedAt: "2026-09-30T12:01:00Z" }));
    expect(await screen.findByText("Blessing M.")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(revealPickupCode).not.toHaveBeenCalled();
    expect(screen.queryByText(/Read this pickup code/)).toBeNull();
  });

  it("once the rider's code matched, says so, and Hand over moves to tracking", async () => {
    show(merchantOrder({ id: ID, merchantPhase: null, status: "picked_up", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open" }));
    expect(await screen.findByText("Blessing M. entered the code")).toBeTruthy();
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

const CASH = { paymentMethod: "cash", merchantCashRule: "collect_and_return" } as const;

describe("M5 · Tracking", () => {
  it("shows the four-step track and 'Cash back to you · after delivery'; 'Mark ride completed' closes after a neutral confirm", async () => {
    show(merchantOrder({ id: ID, ...CASH, merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open", debtAmount: 12 }));
    expect(await screen.findByText("#A111 on the way")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Step 3 of 4: On the way" })).toBeTruthy();
    expect(screen.getByText("Cash back to you")).toBeTruthy();
    expect(screen.getByText("after delivery")).toBeTruthy();
    expect(screen.queryByText("Rider at your counter")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mark ride completed" }));
    expect(screen.getByText("This closes the order now, even if steps are left.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark completed" }));
    await vi.waitFor(() => expect(closeOrder).toHaveBeenCalledWith(ID, "force"));
  });
});

describe("M6a · Delivered + cash back", () => {
  const delivered = () =>
    merchantOrder({
      id: ID,
      ...CASH,
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
    expect(screen.getByText("Blessing M. is bringing $12.00")).toBeTruthy();
    expect(screen.getByText(/· 22 min left$/)).toBeTruthy();
    expect(screen.getByText(/^due \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByRole("list", { name: "Step 4 of 4: Delivered" })).toBeTruthy();
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
});

describe("M6b · Goods back", () => {
  it("says the rider is bringing the order back; 'I got the food back' closes it", async () => {
    show(merchantOrder({ id: ID, ...CASH, merchantPhase: null, status: "undelivered", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open", debtAmount: 12 }));
    expect(await screen.findByText("Not delivered")).toBeTruthy();
    expect(screen.getByText("GOODS BACK TO YOU")).toBeTruthy();
    expect(screen.getByText("Blessing M. is bringing the order back")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I got the food back" }));
    await vi.waitFor(() => expect(confirmGoodsReturned).toHaveBeenCalledWith(ID));
  });
});

describe("a ringing order", () => {
  it("is answered on the Orders home, where the alarm is", async () => {
    show(merchantOrder({ id: ID }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));
  });

  it("so is an auto-accepted one the kitchen hasn't confirmed (M1a)", async () => {
    show(merchantOrder({ ...cooking(), autoAccepted: true, kitchenConfirmedAt: null }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));
  });
});

describe("Auto-accept: the Cooking ticket once the kitchen confirmed", () => {
  const LINES = [
    { itemId: "b0000001-0000-4000-8000-000000000000", dishId: null, name: "Sadza & beef stew", priceUsd: 5, quantity: 2, note: null, available: true },
    { itemId: "b0000002-0000-4000-8000-000000000000", dishId: null, name: "Coke", priceUsd: 1, quantity: 1, note: null, available: true },
  ];
  const auto = (over: Partial<MerchantOrderResponse> = {}) =>
    merchantOrder({ ...cooking(), autoAccepted: true, kitchenConfirmedAt: "2026-09-30T12:01:00Z", items: LINES, customerPhone: "+263779999999", ...over });

  it("has no confirm card", async () => {
    show(auto());
    expect(await screen.findByText(/^Cooking · ready /)).toBeTruthy();
    expect(screen.queryByText("LyniaGo accepted this for you")).toBeNull();
  });

  it("Change items shows the customer's number to agree it with, and sends every line's new quantity", async () => {
    show(auto());
    fireEvent.click(await screen.findByRole("button", { name: "Change items" }));
    expect(screen.getByRole("link", { name: /Call the customer/ })).toBeTruthy();
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
