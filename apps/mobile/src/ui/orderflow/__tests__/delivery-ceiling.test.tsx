/**
 * Delivery ceiling v1 (`handoff/delivery-ceiling-v1/`, ledger D-125): the copy is the handoff's `DC` verbatim
 * (rider → biker), the DELIVERY card and the T-stage rows render the handoff's strings with its sample values,
 * and Review's money and place-order body follow the ceiling.
 */
import { bikerWording } from "@lynia/shared";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { placeOrderBody, reviewBreakdown } from "../../../logic/review";
import { DeliveryCeilingCard, DoorAmountRow, RaiseCard, SearchingRow } from "../ceiling";
import { DC } from "../ceiling-copy";

// Required at run time: the handoff file isn't written for this app's strict compiler (packages/design is
// never edited to suit the app).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const H = (require("../../../../../../packages/design/handoff/delivery-ceiling-v1/code/copy") as { DC: unknown }).DC;

function biker(v: unknown): unknown {
  if (typeof v === "string") return bikerWording(v).replace(/Tendai/g, "{n}");
  if (Array.isArray(v)) return v.map(biker);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, biker(x)]));
  return v;
}

function textOf(r: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === "string") out.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object" && "children" in n) walk((n as { children: unknown }).children);
  };
  walk(r.toJSON());
  return out.join("");
}

function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  return r;
}

describe("Delivery ceiling v1 · copy", () => {
  it("is the handoff's DC, verbatim, with rider → biker", () => {
    expect(DC).toEqual(biker(H));
  });
  it("never says 'up to' (the handoff's wording rule)", () => {
    expect(JSON.stringify(DC)).not.toMatch(/up to/i);
  });
});

describe("R1c · the DELIVERY card", () => {
  const noop = (): void => undefined;

  it("R1c: Recommended $3.00, the stepper at $3.00 and the promise", () => {
    const r = render(<DeliveryCeilingCard km={2.5} recommended={3} ceiling={3} min={2.5} max={6} onChange={noop} />);
    const t = textOf(r);
    expect(t).toContain("DELIVERY");
    expect(t).toContain("2.5 km");
    expect(t).toContain("Recommended$3.00");
    expect(t).toContain("Pay no more than");
    expect(t).toContain(DC.r.promise);
    expect(t).not.toContain(DC.r.slow);
  });

  it("R1c-low: at the lowest the − is disabled and the slow line shows", () => {
    const r = render(<DeliveryCeilingCard km={2.5} recommended={3} ceiling={2.5} min={2.5} max={6} onChange={noop} />);
    expect(textOf(r)).toContain(DC.r.slow);
    const minus = r.root.findAll((n) => n.props.accessibilityLabel === "Lowest is $2.50" && n.props.onPress);
    expect(minus[0]?.props.disabled).toBe(true);
  });

  it("R1c-max: at the highest the + is disabled", () => {
    const r = render(<DeliveryCeilingCard km={2.5} recommended={3} ceiling={6} min={2.5} max={6} onChange={noop} />);
    const plus = r.root.findAll((n) => n.props.accessibilityLabel === "Highest is $6.00" && n.props.onPress);
    expect(plus[0]?.props.disabled).toBe(true);
  });

  it("each tap steps $0.50", () => {
    const seen: number[] = [];
    const r = render(<DeliveryCeilingCard km={2.5} recommended={3} ceiling={3} min={2.5} max={6} onChange={(v) => seen.push(v)} />);
    act(() => r.root.findAll((n) => n.props.accessibilityLabel === "Raise by $0.50" && n.props.onPress)[0]!.props.onPress());
    act(() => r.root.findAll((n) => n.props.accessibilityLabel === "Lower by $0.50" && n.props.onPress)[0]!.props.onPress());
    expect(seen).toEqual([3.5, 2.5]);
  });
});

describe("T-stage rows", () => {
  it("T4u: 'Delivery $3.00 at most · finding a lower price'", () => {
    expect(textOf(render(<SearchingRow ceiling={3} />))).toBe("Delivery $3.00 at most · finding a lower price");
  });
  it("T6p: the exact amount and the saving; T6p-same: no saving", () => {
    expect(textOf(render(<DoorAmountRow due={69.5} delivery={2.5} saved={0.5} />))).toBe("Have $69.50 readyDelivery $2.50 · you saved $0.50");
    expect(textOf(render(<DoorAmountRow due={70} delivery={3} saved={null} />))).toBe("Have $70.00 readyDelivery $3.00");
  });
  it("T11c: 'Raise to $3.50?'", () => {
    expect(textOf(render(<RaiseCard next={3.5} />))).toBe(`Raise to $3.50?${DC.t.raiseSub}`);
  });
});

describe("Review money and the place-order body", () => {
  const lines = [{ dishId: "d1", name: "Bread", priceUsd: 67, quantity: 1, note: "" }] as never;
  it("the fee is the ceiling and the total goods + ceiling", () => {
    const m = reviewBreakdown(lines, 3, 0, false);
    expect(m.deliveryFee).toBe(3);
    expect(m.total).toBe(70);
  });
  it("sends the ceiling only when given", () => {
    const base = { lines, orderNote: "", drop: { lat: -17.8, lng: 31.04, label: "Lanark Rd" }, riderNote: "", phone: "0771234567", idempotencyKey: "11111111-1111-4111-8111-111111111111" };
    expect(placeOrderBody({ ...base, deliveryCeiling: 3.5 }).deliveryCeiling).toBe(3.5);
    expect(placeOrderBody(base)).not.toHaveProperty("deliveryCeiling");
  });
});
