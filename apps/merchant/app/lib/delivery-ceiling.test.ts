/**
 * Delivery ceiling v1, merchant side (ledger D-125): the copy is the handoff's `DC.m` verbatim (rider → biker),
 * the held board card (K-card-h), the Money row (T2-t) and the KPI line read the handoff's sample values.
 */
import { describe, expect, it } from "vitest";
import { bikerWording } from "@lynia/shared";
import { merchantOrder } from "../testing/fixtures";
import { buildBoard } from "./board";
import { DCM } from "./delivery-ceiling-copy";
import { dayRow, topUpKpi } from "./money-view";
import { vocabulary } from "./vocabulary";

import { DC } from "../../../../packages/design/handoff/delivery-ceiling-v1/code/copy";

const H = DC.m as Record<string, unknown>;

const biker = (v: unknown): unknown =>
  typeof v === "string" ? bikerWording(v) : Array.isArray(v) ? v.map(biker) : v;

describe("delivery ceiling · merchant copy", () => {
  it("is the handoff's DC.m, verbatim, with rider → biker", () => {
    expect(DCM).toEqual(Object.fromEntries(Object.entries(H).map(([k, v]) => [k, biker(v)])));
  });
});

describe("K-card-h · the held board card", () => {
  const NOW = Date.now();
  it("shows the offer, when the customer is asked and a Top up pill", () => {
    const o = merchantOrder({
      id: "a1b20000-0000-4000-8000-000000000000",
      merchantPhase: "ready_for_pickup",
      status: "requested",
      noRiderHoldAt: new Date(NOW).toISOString(),
      customerFirstName: "Rudo",
      deliveryTopUp: { offer: 3, topUp: 0, choices: [0.5, 1, 2], askCustomerAt: new Date(NOW + 102_000).toISOString() },
    });
    const card = buildBoard({ v: vocabulary("shop", "grocery"), shop: true, now: NOW, orders: [o] })
      .flatMap((s) => s.cards)
      .find((c) => c.key === o.id)!;
    expect(card.title).toBe("#A1B2 · No biker yet");
    expect(card.sub).toBe("Offered $3.00 · we ask Rudo in");
    expect(card.subDeadlineInline).toBe(true);
    expect(card.pill).toBe("Top up");
    expect(card.gold).toBe(true);
  });
});

describe("T2-t · Money", () => {
  const line = { orderId: "a1b20000-0000-4000-8000-000000000000", at: "2026-11-05T11:02:00Z", outcome: "delivered" as const, cash: "in" as const, amount: 66, topUp: 1 };
  it("the row says the top-up", () => {
    expect(dayRow(line)).toEqual({ sub: "Delivered · biker top-up −$1.00", amount: "+$66.00", tone: "credit" });
  });
  it("the header line adds the top-ups back to the sales they came off", () => {
    expect(topUpKpi(3, 103.5, [line])).toBe("3 orders · $104.50 sales · biker top-ups −$1.00");
    expect(topUpKpi(3, 103.5, [{ ...line, topUp: undefined }])).toBeNull();
  });
});
