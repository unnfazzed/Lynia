// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import OrderPage from "./page";
import { ToastProvider } from "../../../components/m/Toast";
import { ApiError } from "../../../lib/api-client";
import {
  cancelPreparing,
  closeOrder,
  confirmGoodsReturned,
  confirmPayment,
  confirmReturnedCash,
  proposeSubstitution,
  refundOrder,
  rejectOrder,
  releaseUnpaid,
  requestPayment,
  dispatchCancel,
  dispatchResume,
  extendPrep,
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
  extendPrep: vi.fn(async () => ({})),
  requestHandoverFallback: vi.fn(async () => ({})),
  cancelPreparing: vi.fn(async () => ({})),
  confirmKitchen: vi.fn(async () => ({})),
  proposeSubstitution: vi.fn(async () => ({})),
  rejectOrder: vi.fn(async () => ({})),
  closeOrder: vi.fn(async () => ({})),
  confirmReturnedCash: vi.fn(async () => ({})),
  confirmGoodsReturned: vi.fn(async () => ({})),
  reportNonReturn: vi.fn(async () => ({})),
  dispatchResume: vi.fn(async () => ({})),
  dispatchCancel: vi.fn(async () => ({})),
  revealPickupCode: vi.fn(async () => ({ pickupCode: "731604" })),
  requestPayment: vi.fn(async () => ({})),
  confirmPayment: vi.fn(async () => ({})),
  releaseUnpaid: vi.fn(async () => ({})),
  refundOrder: vi.fn(async () => ({})),
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

describe("K3 · the cooking ticket (Merchant v2, D-77)", () => {
  it("shows Step 2 of 5, the big countdown with the ready time, the lines; 'Food is ready' finds a rider", async () => {
    show(cooking());
    expect(await screen.findByText(/^left · ready \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByText(/^9:5\d|^10:00/)).toBeTruthy();
    expect(screen.getByText("Step 2 of 5 ·", { exact: false })).toBeTruthy();
    expect(screen.getByText("We book the rider to arrive as it’s ready")).toBeTruthy();
    expect(screen.getByText("Sadza & beef stew")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Food is ready" }));
    await vi.waitFor(() => expect(markReady).toHaveBeenCalledWith(ID));
    expect(await screen.findByText("Marked ready · finding a rider")).toBeTruthy();
  });

  it("'+5 min' pushes the ready time back", async () => {
    show(cooking());
    fireEvent.click(await screen.findByRole("button", { name: "+5 min" }));
    await vi.waitFor(() => expect(extendPrep).toHaveBeenCalledWith(ID));
    expect(await screen.findByText("Ready time pushed back 5 min · customer told")).toBeTruthy();
  });

  it("'Problem with this order?' replaces Can't finish: it cancels a cash order behind the confirm sheet", async () => {
    show(cooking());
    expect(screen.queryByRole("button", { name: "Can’t finish this order" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Problem with this order?" }));
    fireEvent.click(screen.getByRole("button", { name: "Can’t finish this order" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    await vi.waitFor(() => expect(cancelPreparing).toHaveBeenCalledWith(ID));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));
  });
});

describe("K3 · a shop packs", () => {
  it("speaks Packing and 'Packed' (BRIEF §4)", async () => {
    business.current = merchantProfile({ businessType: "shop", shopKind: "pharmacy" });
    show(cooking());
    expect(await screen.findByText("Packing")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Packed" })).toBeTruthy();
  });
});

describe("K4 · hand over (Merchant v2, D-77)", () => {
  it("before a rider takes it, says a rider is being found — no code yet, and no hand-over button", async () => {
    show(merchantOrder({ id: ID, merchantPhase: "ready_for_pickup", status: "open_for_offers" }));
    expect(await screen.findByText("Finding a rider. The code appears once one takes it.")).toBeTruthy();
    expect(revealPickupCode).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Hand over" })).toBeNull();
  });

  it("with a rider coming, says the six-digit code 3+3 — asked for once, since asking rotates it", async () => {
    show(merchantOrder({ id: ID, merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER, riderPhone: "+263772222222" }));
    expect(await screen.findByText("Blessing M.")).toBeTruthy();
    expect(screen.getByText("Hand over #A111")).toBeTruthy();
    expect(screen.getByText("Step 3 of 5 ·", { exact: false })).toBeTruthy();
    expect(screen.getByText("SAY THIS CODE TO BLESSING")).toBeTruthy();
    expect((await screen.findByLabelText("Pickup code 7 3 1 6 0 4")).textContent).toBe("731 604");
    expect(screen.getByText("Waiting for Blessing to type it. This screen moves on by itself.")).toBeTruthy();
    expect(screen.getByText("AFG 2231 · ★ 4.9")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Call Blessing M." }).getAttribute("href")).toBe("tel:+263772222222");
    expect(screen.queryByRole("button", { name: "Hand over" })).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(revealPickupCode).toHaveBeenCalledTimes(1);
  });

  it("an auto-accepted order is collected without a code, so none is asked for", async () => {
    show(merchantOrder({ id: ID, merchantPhase: null, status: "assigned", riderId: RIDER.profileId, rider: RIDER, autoAccepted: true, kitchenConfirmedAt: "2026-09-30T12:01:00Z" }));
    expect(await screen.findByText("Blessing M.")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(revealPickupCode).not.toHaveBeenCalled();
    expect(screen.queryByText(/SAY THIS CODE/)).toBeNull();
  });

  it("the rider's code entry moves the screen on by itself, and says so", async () => {
    show(merchantOrder({ id: ID, merchantPhase: null, status: "picked_up", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open" }));
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

describe("K5 · on the way + cash back, one screen (Merchant v2, D-77)", () => {
  it("on the way: Step 4 of 5, the cash card (food only, delivery as the rider's) and 'I got $12.00 · after delivery' held", async () => {
    show(merchantOrder({ id: ID, ...CASH, merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER, debtStatus: "open", debtAmount: 12, deliveryFee: 3.2 }));
    expect(await screen.findByText("#A111 on the way")).toBeTruthy();
    expect(screen.getByLabelText("4 of 5 steps")).toBeTruthy();
    expect(screen.getByText("CASH BACK TO YOU")).toBeTruthy();
    expect(screen.getByText("Delivery $3.20 · rider's")).toBeTruthy();
    expect(screen.getByText("Blessing brings it back after delivery")).toBeTruthy();
    expect(screen.getByText("The door photo shows here once it’s delivered")).toBeTruthy();
    expect((screen.getByRole("button", { name: "I got $12.00 · after delivery" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("an order with no cash to bring back can be marked completed after a neutral confirm", async () => {
    show(merchantOrder({ id: ID, merchantPhase: null, status: "en_route_dropoff", riderId: RIDER.profileId, rider: RIDER }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark ride completed" }));
    expect(screen.getByText("This closes the order now, even if steps are left.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark completed" }));
    await vi.waitFor(() => expect(closeOrder).toHaveBeenCalledWith(ID, "force"));
  });

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

  it("delivered: Step 5 of 5, when the cash is due; 'I got $12.00' counts it", async () => {
    show(delivered());
    expect(await screen.findByText(/^Delivered \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByLabelText("5 of 5 steps")).toBeTruthy();
    expect(screen.getByText(/^Blessing brings it back by \d\d:\d\d$/)).toBeTruthy();
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

  it("not delivered: the goods come back on the same screen; 'I got the food back' closes it", async () => {
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
    expect(await screen.findByText(/^left · ready /)).toBeTruthy();
    expect(screen.queryByText("LyniaGo accepted this for you")).toBeNull();
  });

  it("Change items is the proposer (U4a): tap a line, Remove it, then 'Send 1 change to customer'", async () => {
    show(auto());
    fireEvent.click(await screen.findByRole("button", { name: "Change items" }));
    fireEvent.click(screen.getByRole("button", { name: /Coke/ }));
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));
    expect(screen.getByText("Removing")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send 1 change to customer" }));
    await vi.waitFor(() =>
      expect(proposeSubstitution).toHaveBeenCalledWith(ID, { lines: [{ action: "remove", itemId: "b0000002-0000-4000-8000-000000000000" }] }),
    );
  });
});

describe("cash only (BRIEF §14, ledger D-74): what is left of the old wallet lane", () => {
  const unpaid = (over: Partial<MerchantOrderResponse> = {}) =>
    merchantOrder({ id: ID, merchantPhase: "awaiting_payment", paymentMethod: "wallet", merchantGoodsTotal: 9.5, prepMinutes: 15, ...over });

  it("an unpaid wallet order placed before D-74 waits on its ticket: no payment tag, no old card", async () => {
    show(unpaid());
    expect(await screen.findByText("Waiting for payment")).toBeTruthy();
    expect(screen.getByText("Start once it’s in your own statement.")).toBeTruthy();
    expect(screen.getByText("Sadza & beef stew")).toBeTruthy();
    expect(screen.queryByText(/^(WALLET|CASH)$/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Log the call|They confirmed another way|It landed/ })).toBeNull();
  });

  it("'Ask for payment' asks the customer (an older app shows its pay screen only once asked), then goes", async () => {
    show(unpaid());
    fireEvent.click(await screen.findByRole("button", { name: "Ask for payment" }));
    await vi.waitFor(() => expect(requestPayment).toHaveBeenCalledWith(ID, true));
    expect(await screen.findByText("Payment asked for · customer told")).toBeTruthy();

    cleanup();
    show(unpaid({ paymentRequestedAt: new Date().toISOString() }));
    expect(await screen.findByText("Waiting for payment")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ask for payment" })).toBeNull();
  });

  it("'I got $9.50' asks for the reference from the business's own statement before it confirms", async () => {
    show(unpaid());
    fireEvent.click(await screen.findByRole("button", { name: "I got $9.50" }));
    const sheet = screen.getByRole("dialog", { name: "Is $9.50 in your statement?" });
    expect(within(sheet).getByText("Check your own statement, not a screen someone shows you.")).toBeTruthy();
    const confirmButton = within(sheet).getByRole("button", { name: "I got $9.50" }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    fireEvent.change(within(sheet).getByLabelText("Reference"), { target: { value: "  MM-99001 " } });
    expect(confirmButton.disabled).toBe(false);
    fireEvent.click(confirmButton);
    await vi.waitFor(() => expect(confirmPayment).toHaveBeenCalledWith(ID, { reference: "MM-99001", amount: 9.5 }));
    expect(await screen.findByText("Payment confirmed · start cooking")).toBeTruthy();
  });

  it("the API's amount check is said on the sheet, which stays open", async () => {
    vi.mocked(confirmPayment).mockRejectedValueOnce(new ApiError(409, "Amount doesn't match — expected $9.50, got $9.00"));
    show(unpaid());
    fireEvent.click(await screen.findByRole("button", { name: "I got $9.50" }));
    const sheet = screen.getByRole("dialog", { name: "Is $9.50 in your statement?" });
    fireEvent.change(within(sheet).getByLabelText("Reference"), { target: { value: "MM-1" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "I got $9.50" }));
    expect(await within(sheet).findByText("Amount doesn't match — expected $9.50, got $9.00")).toBeTruthy();
  });

  it("'Cancel order' releases an order that was never paid, behind the confirm sheet", async () => {
    show(unpaid());
    fireEvent.click(await screen.findByRole("button", { name: "Cancel order" }));
    const sheet = screen.getByRole("dialog", { name: "Cancel this order?" });
    expect(within(sheet).getByText("Only if they never paid. The customer is told.")).toBeTruthy();
    expect(releaseUnpaid).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel order" }));
    await vi.waitFor(() => expect(releaseUnpaid).toHaveBeenCalledWith(ID, "other"));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));
  });

  it("paid, it cooks like any other order; 'Can't finish this order' refunds with the business's reference", async () => {
    show({ ...cooking(), paymentMethod: "wallet", merchantGoodsTotal: 9.5, merchantPaymentConfirmedAt: new Date().toISOString() });
    expect(await screen.findByText(/^left · ready \d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Food is ready" })).toBeTruthy();
    expect(screen.queryByText(/^(WALLET|CASH)$/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Problem with this order?" }));
    fireEvent.click(screen.getByRole("button", { name: "Can’t finish this order" }));
    const sheet = screen.getByRole("dialog", { name: "Cancel this order?" });
    expect(within(sheet).getByText("Refund the customer $9.50 first, then add the refund reference.")).toBeTruthy();
    const cancel = within(sheet).getByRole("button", { name: "Cancel order" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    fireEvent.change(within(sheet).getByLabelText("Refund reference"), { target: { value: "RF-1" } });
    fireEvent.click(cancel);
    await vi.waitFor(() => expect(refundOrder).toHaveBeenCalledWith(ID, "RF-1", 9.5));
    expect(cancelPreparing).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));
  });

  it("a shortened order sent before Order flow v2 waits on M2 with its own countdown, with nothing to mark ready", async () => {
    show(
      merchantOrder({
        id: ID,
        merchantPhase: "awaiting_item_approval",
        itemApprovalDeadlineAt: new Date(Date.now() + 42_000).toISOString(),
        items: [
          { itemId: "e0000001-0000-4000-8000-000000000000", dishId: "d1", name: "Mazondo", priceUsd: 5, quantity: 1, note: null, available: true },
          { itemId: "e0000002-0000-4000-8000-000000000000", dishId: "d2", name: "Road-runner", priceUsd: 6, quantity: 1, note: null, available: false },
        ],
      }),
    );
    expect(await screen.findByText("Waiting for the customer to answer")).toBeTruthy();
    expect(screen.getByText("Removing")).toBeTruthy();
    expect(screen.getByText(/^Waiting for the customer’s answer · 0:4/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Food is ready" }) as HTMLButtonElement).disabled).toBe(true);
    // No swaps, and it doesn't carry on by itself, so M2's swap line isn't said.
    expect(screen.queryByText(/swaps are declined/)).toBeNull();
    expect(screen.queryByText(/shorter order/)).toBeNull();
  });
});

describe("Order flow v2 round 2 (D-59): the wait, photos, Scheduled, Rx", () => {
  const LINE_A = "b0000001-0000-4000-8000-000000000000";
  const LINE_B = "b0000002-0000-4000-8000-000000000000";
  const lines = [
    { itemId: LINE_A, dishId: null, name: "Bread (Lobels 700g)", priceUsd: 1.1, quantity: 1, note: null, available: false },
    { itemId: LINE_B, dishId: null, name: "Mazoe orange 2L", priceUsd: 3.2, quantity: 1, note: null, available: false },
  ];
  const round = (deadlineAt: string) => ({
    id: "c0000001-0000-4000-8000-000000000000",
    kind: "mid_prep" as const,
    status: "open" as const,
    createdAt: new Date().toISOString(),
    deadlineAt,
    resolvedAt: null,
    wasTotal: 4.3,
    keptSubtotal: 0,
    lines: [
      { id: "c1000001-0000-4000-8000-000000000000", itemId: LINE_A, action: "swap" as const, name: "Bread (Lobels 700g)", priceUsd: 1.1, quantity: 1, newQuantity: null, swapDishId: "d0000009-0000-4000-8000-000000000000", swapName: "Bakers Inn 700g", swapPriceUsd: 1.2, swapQuantity: 1, swapPhotoUrl: null, answer: null },
      { id: "c1000002-0000-4000-8000-000000000000", itemId: LINE_B, action: "remove" as const, name: "Mazoe orange 2L", priceUsd: 3.2, quantity: 1, newQuantity: null, swapDishId: null, swapName: null, swapPriceUsd: null, swapQuantity: null, swapPhotoUrl: null, answer: null },
    ],
  });

  it("M2: while the customer answers, the ticket waits with the countdown and holds 'Packed'", async () => {
    business.current = merchantProfile({ businessType: "shop", shopKind: "grocery" });
    show(merchantOrder({ ...cooking(), items: lines, substitution: round(new Date(Date.now() + 161_000).toISOString()) }));
    expect(await screen.findByText("Waiting for the customer to answer")).toBeTruthy();
    expect(screen.getByText("Bakers Inn 700g · $1.20")).toBeTruthy();
    expect(screen.getByText("Swap asked")).toBeTruthy();
    expect(screen.getByText("Removing")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Packed" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/^Waiting for the customer’s answer · 2:4/)).toBeTruthy();
  });

  it("an accept that asked about a swap (awaiting the customer) opens on the same wait", async () => {
    show(merchantOrder({ id: ID, merchantPhase: "awaiting_item_approval", items: lines, substitution: round(new Date(Date.now() + 60_000).toISOString()) }));
    expect(await screen.findByText("Waiting for the customer to answer")).toBeTruthy();
    expect(replace).not.toHaveBeenCalledWith("/queue");
  });

  it("S3: a shop hands over on a 3-step checklist — seal, the rider's photo, then the code", async () => {
    show(merchantOrder({ id: ID, merchantPhase: null, status: "en_route_pickup", riderId: RIDER.profileId, rider: RIDER, pickupProofRequired: true }));
    expect(await screen.findByText("Seal the bag")).toBeTruthy();
    expect(screen.getByText("Sticker or stapled receipt")).toBeTruthy();
    expect(screen.getByText("Blessing photographs it")).toBeTruthy();
    expect(screen.getByText("Waiting for Blessing M.’s photo of the sealed bag")).toBeTruthy();
    expect(screen.getByText("Say the code to Blessing")).toBeTruthy();
    expect(await screen.findByText("731 604")).toBeTruthy();
    expect(screen.getByText("The order moves on when Blessing types the code.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hand over" })).toBeNull();
  });

  it("S3: once the photo is in, step 2 is ticked with the time and the thumbnail", async () => {
    const takenAt = new Date().toISOString();
    show(
      merchantOrder({
        id: ID,
        merchantPhase: null,
        status: "en_route_pickup",
        riderId: RIDER.profileId,
        rider: RIDER,
        pickupProofRequired: true,
        pickupProof: { photoUrl: "https://storage.example/bag.jpg", takenAt, bagSealed: true },
      }),
    );
    expect(await screen.findByText("Blessing photographed it")).toBeTruthy();
    expect(screen.getByText(/^\d\d:\d\d · the customer sees this too$/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sealed bag photo" }).getAttribute("href")).toBe("https://storage.example/bag.jpg");
  });

  it("M5b: the door photo on tracking says where it was left", async () => {
    show(
      merchantOrder({
        id: ID,
        merchantPhase: null,
        status: "en_route_dropoff",
        riderId: RIDER.profileId,
        rider: RIDER,
        doorProof: { photoUrl: "https://storage.example/door.jpg", takenAt: null, reason: "left_at_gate", handedTo: "Chipo" },
      }),
    );
    expect(await screen.findByText("Delivery photo")).toBeTruthy();
    expect(screen.getByText("Left with Chipo at the gate")).toBeTruthy();
  });

  it("M7b: a scheduled order that hasn't rung opens on its ticket; declining goes through the confirm sheet", async () => {
    const at = new Date();
    at.setHours(at.getHours() + 3, 0, 0, 0);
    show(merchantOrder({ id: ID, merchantPhase: "awaiting_accept", scheduledFor: at.toISOString(), ringsAt: new Date(at.getTime() - 25 * 60_000).toISOString(), scheduleStartedAt: null }));
    expect(await screen.findByText(/^Scheduled for /)).toBeTruthy();
    expect(screen.getByText(/^This order rings at /)).toBeTruthy();
    expect(replace).not.toHaveBeenCalledWith("/queue");
    fireEvent.click(screen.getByRole("button", { name: "Can’t take it" }));
    fireEvent.click(screen.getByRole("button", { name: "Decline order" }));
    await vi.waitFor(() => expect(rejectOrder).toHaveBeenCalledWith(ID, "other"));
  });

  it("M8a: a pharmacist sees the way into the prescription check on the ticket", async () => {
    business.current = merchantProfile({ businessType: "shop", shopKind: "pharmacy", myIsPharmacist: true });
    show(merchantOrder({ ...cooking(), prescription: { status: "pending", patientName: "Rudo Moyo", pageCount: 2 } }));
    expect((await screen.findByRole("link", { name: "Prescription check" })).getAttribute("href")).toBe(`/queue/${ID}/rx`);
  });

  it("no prescription check without a pharmacist, or without a prescription", async () => {
    business.current = merchantProfile({ businessType: "shop", shopKind: "pharmacy", myIsPharmacist: false });
    show(merchantOrder({ ...cooking(), prescription: { status: "pending", patientName: "Rudo Moyo", pageCount: 2 } }));
    expect(await screen.findByText("Packed")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Prescription check" })).toBeNull();
  });
});
