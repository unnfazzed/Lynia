import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { makingWord, pushCopy, PUSH_C, PUSH_M, PUSH_R, riderJobTemplate } from "./merchant-order-push";

/**
 * Order flow v2 G3a–c (ledger D-59): the merchant-order push templates are the handoff's `O.g.push`
 * verbatim. Filled with the handoff's own sample values, each must give back the drawn [title, body]
 * byte for byte — read from the design package itself, so a re-export that changes the copy fails here.
 */

function drawnPush(): { c: [string, string][]; m: [string, string][]; r: [string, string][] } {
  const src = readFileSync(resolve(__dirname, "../../../../packages/design/handoff/order-flow-v2/code/copy.ts"), "utf8");
  const json = src.slice(src.indexOf("export const O = ") + "export const O = ".length, src.indexOf("} as const;") + 1);
  return (JSON.parse(json) as { g: { push: { c: [string, string][]; m: [string, string][]; r: [string, string][] } } }).g.push;
}

const SAMPLE_C = [
  [PUSH_C.sent, { v: "Gava’s Kitchen", a: "12:40", b: "12:55" }],
  [PUSH_C.making, { v: "Gava’s Kitchen", making: "cooking", a: "12:40", b: "12:55" }],
  [PUSH_C.answer, { v: "Avondale Fresh", i: "Lobels bread", s: "Bakers Inn 700g", d: "+$0.10" }],
  [PUSH_C.riderToVenue, { n: "Tendai", v: "Gava’s Kitchen" }],
  [PUSH_C.collected, { n: "Tendai", m: 9, t: "12:47" }],
  [PUSH_C.atDoor, { n: "Tendai", p: "$16.50" }],
  [PUSH_C.delivered, { v: "Gava’s Kitchen", n: "Tendai" }],
  [PUSH_C.notDelivered, { n: "Tendai" }],
  [PUSH_C.venueCouldnt, { v: "Gava’s Kitchen" }],
  [PUSH_C.noRider, {}],
  [PUSH_C.rxDeclined, {}],
  [PUSH_C.schedStarted, { v: "Gava’s Kitchen", making: "cooking", s: "12:30–13:00" }],
] as const;

const SAMPLE_M = [
  [PUSH_M.newOrder, { id: "A1B2", p: "$15.00", n: 2, items: "dishes" }],
  [PUSH_M.schedStarts, { id: "A1B2", d: "Tomorrow", t: "12:30", making: "cooking" }],
  [PUSH_M.swapAccepted, { c: "Rudo", s: "Bakers Inn 700g", i: "Lobels", p: "$16.20" }],
  [PUSH_M.noAnswer, { c: "Rudo", i: "Lobels bread", making: "packing" }],
  [PUSH_M.atCounter, { n: "Tendai" }],
  [PUSH_M.cashDue, { n: "Tendai", p: "$15.00", t: "13:17" }],
  [PUSH_M.rxToCheck, { id: "P7C1", i: "Amoxicillin 500mg" }],
] as const;

const SAMPLE_R = [
  [PUSH_R.foodJob, { f: "$3.20", v: "Gava’s Kitchen", a: "Belgravia" }],
  [PUSH_R.shopJob, { f: "$2.80", v: "Avondale Fresh", a: "Belgravia" }],
  [PUSH_R.ready, { v: "Gava’s Kitchen" }],
  [PUSH_R.cancelled, { c: "Rudo", v: "Gava’s Kitchen" }],
  [PUSH_R.returnCash, { p: "$15.00", v: "Gava’s Kitchen", t: "13:17" }],
] as const;

describe("merchant-order push copy = O.g.push (G3a–c), verbatim", () => {
  const drawn = drawnPush();
  it.each([
    ["customer", SAMPLE_C, drawn.c],
    ["merchant", SAMPLE_M, drawn.m],
    ["rider", SAMPLE_R, drawn.r],
  ] as const)("%s: every drawn push, in order", (_who, samples, frames) => {
    expect(samples.length).toBe(frames.length);
    samples.forEach(([t, vars], k) => {
      const p = pushCopy(t, vars);
      expect([p.title, p.body]).toEqual(frames[k]);
    });
  });

  it("drops a sentence whose value the server doesn't have (no ETA ⇒ no 'Arrives …')", () => {
    expect(pushCopy(PUSH_C.making, { v: "Avondale Fresh", making: "packing" })).toEqual({ title: "Avondale Fresh is packing", body: "We’ll tell you when a rider has it." });
    expect(pushCopy(PUSH_C.collected, { n: "Tendai" })).toEqual({ title: "Tendai has your order", body: "On the way." });
    expect(pushCopy(PUSH_C.notDelivered, {})).toEqual({ title: "Your order wasn’t delivered", body: "Nothing was charged." });
  });

  it("a title slot falls back when the name is unknown", () => {
    expect(pushCopy(PUSH_C.atDoor, { p: "$6.80" }, { n: "Your rider" })).toEqual({ title: "Your rider is at your door", body: "Have $6.80 cash ready." });
  });

  it("never carries a delivery or pickup code (no 3+3 or 6-digit run in any template)", () => {
    for (const t of [...Object.values(PUSH_C), ...Object.values(PUSH_M), ...Object.values(PUSH_R)]) {
      expect(`${t.title} ${t.body.join(" ")}`).not.toMatch(/\d{3}\s?\d{3}|\{code\}/);
    }
  });

  it("per service: shops and pharmacies pack; a shop job asks for the sealed-bag photo", () => {
    expect(makingWord("shop")).toBe("packing");
    expect(makingWord("restaurant")).toBe("cooking");
    expect(riderJobTemplate("shop")).toBe(PUSH_R.shopJob);
    expect(riderJobTemplate("restaurant")).toBe(PUSH_R.foodJob);
  });
});
