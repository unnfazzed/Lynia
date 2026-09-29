// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { CreateMerchantBookingRequest } from "@lynia/shared";
import {
  type BookingForm,
  bookingsAvailable,
  codeMessage,
  homePath,
  isLiveBooking,
  newIdempotencyKey,
  pollIntervalMs,
  recallCode,
  rememberCode,
  suggestedFare,
  toCreateRequest,
  undeliveredText,
  VALUE_CAP_MESSAGE,
  validateBooking,
  whatsappLink,
} from "./booking";
import { merchantProfile } from "../testing/fixtures";

const HARARE = { lat: -17.8292, lng: 31.0522 };

function form(overrides: Partial<BookingForm> = {}): BookingForm {
  return {
    point: { lat: -17.8, lng: 31.05 },
    pinConfirmed: true,
    landmark: "Blue gate opposite the church",
    buyerPhone: "0771234567",
    what: "2 brake pads",
    value: "45",
    fare: "3.50",
    note: "",
    accepted: true,
    ...overrides,
  };
}

afterEach(() => {
  window.sessionStorage.clear();
});

describe("bookingsAvailable (the web follows the API, whichever deploys first)", () => {
  it("is on only when /merchant/me carries `location`, even a null one", () => {
    expect(bookingsAvailable(merchantProfile())).toBe(false);
    expect(bookingsAvailable(merchantProfile({ location: null }))).toBe(true);
    expect(bookingsAvailable(merchantProfile({ location: { point: HARARE, landmark: "Opposite the market", contactPhone: "+263771234567" } }))).toBe(true);
    expect(bookingsAvailable(null)).toBe(false);
  });
});

describe("homePath (where a signed-in business lands)", () => {
  it("sends a restaurant to Orders, and a shop to Deliveries once the API can book riders, else its checklist", () => {
    expect(homePath(merchantProfile())).toBe("/queue");
    expect(homePath(merchantProfile({ location: null }))).toBe("/queue");
    expect(homePath(merchantProfile({ businessType: "shop" }))).toBe("/setup");
    expect(homePath(merchantProfile({ businessType: "shop", location: null }))).toBe("/deliveries");
  });
});

describe("states and polling", () => {
  it("polls every 3 s while finding a rider, every 15 s once one is coming, and stops when it's over", () => {
    expect(pollIntervalMs("finding")).toBe(3_000);
    expect(pollIntervalMs("finding_again")).toBe(3_000);
    expect(pollIntervalMs("coming")).toBe(15_000);
    expect(pollIntervalMs("picked_up")).toBe(15_000);
    for (const done of ["delivered", "not_delivered", "expired", "cancelled"] as const) {
      expect(pollIntervalMs(done)).toBeNull();
      expect(isLiveBooking(done)).toBe(false);
    }
  });

  it("names Send's undelivered reason in the business's words, with a fallback for anything new", () => {
    expect(undeliveredText("refused")).toBe("The buyer refused the delivery.");
    expect(undeliveredText("something_new")).toBe("The rider couldn't complete the delivery.");
    expect(undeliveredText(null)).toBe("The rider couldn't complete the delivery.");
  });
});

describe("the booking form", () => {
  it("passes a complete form", () => {
    expect(validateBooking(form())).toEqual({});
  });

  it("asks for every required field, in the business's words", () => {
    const errors = validateBooking(
      form({ pinConfirmed: false, landmark: " ", buyerPhone: "12", what: "", value: "", fare: "abc", accepted: false }),
    );
    expect(Object.keys(errors).sort()).toEqual(["accepted", "buyerPhone", "fare", "landmark", "point", "value", "what"]);
  });

  it("blocks goods over $150 with the cap message, and never suggests declaring less", () => {
    expect(validateBooking(form({ value: "150" })).value).toBeUndefined();
    expect(validateBooking(form({ value: "150.01" })).value).toBe(VALUE_CAP_MESSAGE);
    expect(VALUE_CAP_MESSAGE).not.toMatch(/declare|lower|less/i);
  });

  it("refuses a drop-off outside the area LyniaGo covers", () => {
    expect(validateBooking(form({ point: { lat: -18.9, lng: 32.6 } })).point).toBe("That's outside the area LyniaGo covers for now.");
  });

  it("builds a body the API's own contract accepts: one line item, the buyer's number in +263 form", () => {
    const body = toCreateRequest(form({ note: "  Ask for Rudo  " }), newIdempotencyKey());
    expect(CreateMerchantBookingRequest.safeParse(body).success).toBe(true);
    expect(body.items).toEqual([{ description: "2 brake pads", quantity: 1 }]);
    expect(body.dropoff.contactPhone).toBe("+263771234567");
    expect(body.declaredValue).toBe(45);
    expect(body.proposedFare).toBe(3.5);
    expect(body.note).toBe("Ask for Rudo");
    expect("note" in toCreateRequest(form(), newIdempotencyKey())).toBe(false);
  });

  it("suggests Send's fare for the trip", () => {
    expect(suggestedFare(HARARE, HARARE)).toBe(1.5);
    expect(suggestedFare(HARARE, { lat: -17.8, lng: 31.05 })).toBeGreaterThan(1.5);
  });
});

describe("the delivery code", () => {
  it("writes a message that reads the same on WhatsApp, in an SMS or out loud", () => {
    expect(codeMessage({ businessName: "Mbare Auto Spares", riderName: "Blessing", bikeReg: "ABC 1234", code: "482910" })).toBe(
      "Hi, it's Mbare Auto Spares. Blessing (ABC 1234) is bringing your order. When it arrives, give the rider this code: 482910",
    );
    expect(codeMessage({ businessName: "Shop", riderName: null, bikeReg: null, code: "1" })).toContain("A LyniaGo rider is bringing");
  });

  it("opens the buyer's WhatsApp by their international number, or not at all", () => {
    expect(whatsappLink("0771234567", "Hi there")).toBe("https://wa.me/263771234567?text=Hi%20there");
    expect(whatsappLink("not a phone", "Hi")).toBeNull();
  });

  it("keeps the code in the browser that picked, per booking", () => {
    rememberCode("b1", "482910");
    expect(recallCode("b1")).toBe("482910");
    expect(recallCode("b2")).toBeNull();
  });
});
