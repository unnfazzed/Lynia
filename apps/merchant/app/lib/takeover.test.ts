import { describe, expect, it } from "vitest";
import { merchantOrder } from "../testing/fixtures";
import { pickTakeover, takeoverCandidates } from "./takeover";

const A = "a1110000-0000-4000-8000-000000000001";
const S = "5c4e0000-0000-4000-8000-000000000001";
const C = "c0f10000-0000-4000-8000-000000000001";

const auto = (id: string) =>
  merchantOrder({ id, merchantPhase: "preparing", autoAccepted: true, kitchenConfirmedAt: null, prepMinutes: 20, prepStartedAt: new Date().toISOString() });

describe("takeoverCandidates", () => {
  it("new orders first, then auto-accepted ones the kitchen hasn't confirmed; nothing else", () => {
    const orders = [auto(C), merchantOrder({ id: A }), merchantOrder({ id: "d0000000-0000-4000-8000-000000000001", merchantPhase: "preparing" })];
    expect(takeoverCandidates(orders).map((o) => o.id)).toEqual([A, C]);
  });

  it("leaves out an order a screen is answering itself (the Rx check)", () => {
    expect(takeoverCandidates([merchantOrder({ id: A }), auto(C)], new Set([A])).map((o) => o.id)).toEqual([C]);
  });
});

describe("pickTakeover (MJ-M10)", () => {
  it("with nothing on screen, the first candidate", () => {
    expect(pickTakeover(takeoverCandidates([merchantOrder({ id: A })]), null)?.id).toBe(A);
    expect(pickTakeover([], null)).toBeNull();
  });

  it("an older scheduled order that starts ringing waits — the one being answered keeps the screen", () => {
    const now = takeoverCandidates([merchantOrder({ id: S, scheduledFor: new Date().toISOString() }), merchantOrder({ id: A })]);
    expect(now[0]!.id).toBe(S);
    expect(pickTakeover(now, A)?.id).toBe(A);
  });

  it("a new order doesn't replace an auto-accepted one being confirmed", () => {
    expect(pickTakeover(takeoverCandidates([auto(C), merchantOrder({ id: A })]), C)?.id).toBe(C);
  });

  it("once the one on screen is resolved, the next takes its place", () => {
    expect(pickTakeover(takeoverCandidates([merchantOrder({ id: S })]), A)?.id).toBe(S);
  });
});
