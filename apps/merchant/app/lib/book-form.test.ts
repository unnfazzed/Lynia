import { describe, expect, it } from "vitest";
import { CreateMerchantBookingRequest } from "@lynia/shared";
import { addLine, startFare, stepFare, toBookingRequest, typicalLine, validateWhat, validateWhere, worth } from "./book-form";
import { VALUE_CAP_MESSAGE } from "./booking";

const HARARE = { lat: -17.8, lng: 31.05 };

describe("D3 items and worth", () => {
  it("sums qty × price, and a second pick of the same item bumps its quantity", () => {
    let lines = addLine([], { dishId: "a", name: "Brake pads (front)", qty: 1, unitPrice: 22 });
    lines = addLine(lines, { dishId: "a", name: "Brake pads (front)", qty: 1, unitPrice: 22 });
    lines = addLine(lines, { name: "Oil filter", qty: 1, unitPrice: 7 });
    expect(lines.map((l) => [l.name, l.qty])).toEqual([
      ["Brake pads (front)", 2],
      ["Oil filter", 1],
    ]);
    expect(worth(lines)).toBe(51);
  });

  it("leaves room for the cash line when the buyer pays on delivery (D-48 PR 4b)", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ name: `Part ${i}`, qty: 1, unitPrice: 1 }));
    expect(validateWhat(ten)).toBeNull();
    expect(validateWhat(ten, true)).toBe("A booking carries up to 9 lines. Split it into two.");
    const body = toBookingRequest({ point: HARARE, address: "12 Fife Ave" }, "779982210", ten.slice(0, 2), 3.5, "11111111-1111-4111-8111-111111111111", true);
    expect(body.collectCash).toBe(true);
    expect("collectCash" in toBookingRequest({ point: HARARE, address: "x" }, "779982210", ten.slice(0, 2), 3.5, "11111111-1111-4111-8111-111111111111")).toBe(false);
  });

  it("needs a line, at most ten, and no more than the $150 cap", () => {
    expect(validateWhat([])).toBe("Add what's going: from your items, or type one.");
    expect(validateWhat([{ name: "Engine", qty: 1, unitPrice: 151 }])).toBe(VALUE_CAP_MESSAGE);
    expect(validateWhat([{ name: "Oil filter", qty: 1, unitPrice: 7 }])).toBeNull();
  });
});

describe("D3 fare stepper", () => {
  it("starts on Send's suggestion to the nearest 50c, steps by 50c and never goes under $1.50", () => {
    expect(startFare(3.37)).toBe(3.5);
    expect(startFare(0.9)).toBe(1.5);
    expect(stepFare(3.5, 1)).toBe(4);
    expect(stepFare(1.5, -1)).toBe(1.5);
    expect(typicalLine(3.37)).toBe("Riders usually get $3–4");
    expect(typicalLine(3)).toBe("Riders usually get $3–4");
  });
});

describe("D2 where and the booking body", () => {
  it("asks for a place and a nine-digit number", () => {
    expect(validateWhere(null, "")).toEqual({
      where: "Search for the buyer's street, or paste the location they sent.",
      phone: "Enter the buyer's number, like 77 123 4567.",
    });
    expect(validateWhere({ point: HARARE, address: "12 Fife Ave" }, "779982210")).toEqual({});
  });

  it("refuses a drop-off outside the area LyniaGo covers", () => {
    expect(validateWhere({ point: { lat: -18.9, lng: 32.6 }, address: "Mutare" }, "779982210").where).toBe("That's outside the area LyniaGo covers for now.");
  });

  it("builds a POST body the API's own contract accepts", () => {
    const body = toBookingRequest({ point: HARARE, address: "12 Fife Ave" }, "779982210", [{ name: "Oil filter", qty: 1, unitPrice: 7 }], 3.5, "11111111-1111-4111-8111-111111111111");
    expect(CreateMerchantBookingRequest.safeParse(body).success).toBe(true);
  });

  it("builds the POST body from both steps", () => {
    const body = toBookingRequest({ point: HARARE, address: "12 Fife Ave, Avondale" }, "779982210", [{ name: "Oil filter", qty: 2, unitPrice: 7 }], 3.5, "11111111-1111-4111-8111-111111111111");
    expect(body).toMatchObject({
      dropoff: { point: HARARE, landmark: "12 Fife Ave, Avondale", contactPhone: "+263779982210" },
      items: [{ description: "Oil filter", quantity: 2 }],
      declaredValue: 14,
      proposedFare: 3.5,
    });
  });
});
