import { BecomeMerchantRequest } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { fieldForReason, OUTSIDE_AREA_MESSAGE, pickSellChoice, sellChoice, type SignUpForm, toBecomeRequest, validateDetails } from "./sign-up";

const filled: SignUpForm = {
  businessType: "shop",
  ownerName: " Tendai Moyo ",
  name: " Mbare Auto Spares ",
  location: { point: { lat: -17.861, lng: 31.036 }, address: "5th Street, Mbare", source: "gps" },
  contactPhone: "+263771234567",
};

describe("sign-up step 2: your business (merchant-mobile A4)", () => {
  it("passes a filled form", () => {
    expect(validateDetails(filled)).toEqual({});
  });

  it("asks for the business name, your name and a location — no pin, landmark or privacy tick any more", () => {
    expect(validateDetails({ ...filled, name: " ", ownerName: "", location: null })).toEqual({
      name: "Enter the business name.",
      ownerName: "Enter your name.",
      location: "Use your current location, or search for your street.",
    });
  });

  it("refuses a place outside the area LyniaGo covers", () => {
    expect(validateDetails({ ...filled, location: { point: { lat: -20.15, lng: 28.58 }, address: "Bulawayo", source: "search" } }).location).toBe(
      OUTSIDE_AREA_MESSAGE,
    );
  });

  it("builds the request the API accepts: no kind for a shop, the address line, the signed-in number, terms accepted", () => {
    const body = toBecomeRequest(filled);
    expect(body).toEqual({
      ownerName: "Tendai Moyo",
      name: "Mbare Auto Spares",
      businessType: "shop",
      location: { point: { lat: -17.861, lng: 31.036 }, address: "5th Street, Mbare", contactPhone: "+263771234567" },
      termsAccepted: true,
    });
    expect(BecomeMerchantRequest.safeParse(body).success).toBe(true);
  });

  it("signs a pharmacy up as a shop of kind pharmacy, so it lists under Pharmacy", () => {
    const form = pickSellChoice(filled, "pharmacy");
    expect(sellChoice(form)).toBe("pharmacy");
    const body = toBecomeRequest(form);
    expect(body.businessType).toBe("shop");
    expect(body.shopKind).toBe("pharmacy");
    expect(BecomeMerchantRequest.safeParse(body).success).toBe(true);
  });

  it("drops the pharmacy kind when the choice changes back to shop or restaurant", () => {
    const pharmacy = pickSellChoice(filled, "pharmacy");
    const shop = pickSellChoice(pharmacy, "shop");
    expect(sellChoice(shop)).toBe("shop");
    expect(toBecomeRequest(shop).shopKind).toBeUndefined();
    const restaurant = pickSellChoice(pharmacy, "restaurant");
    expect(sellChoice(restaurant)).toBe("restaurant");
    expect(toBecomeRequest(restaurant).shopKind).toBeUndefined();
    expect(BecomeMerchantRequest.safeParse(toBecomeRequest(restaurant)).success).toBe(true);
  });

  it("leaves the address out when nothing could name the place", () => {
    const body = toBecomeRequest({ ...filled, businessType: "restaurant", location: { ...filled.location!, address: " " } });
    expect(body.location).toEqual({ point: { lat: -17.861, lng: 31.036 }, contactPhone: "+263771234567" });
    expect(BecomeMerchantRequest.safeParse(body).success).toBe(true);
  });

  it("puts an out-of-area refusal next to the location", () => {
    expect(fieldForReason("outside_service_area")).toBe("location");
    expect(fieldForReason("already_member")).toBeNull();
  });
});
