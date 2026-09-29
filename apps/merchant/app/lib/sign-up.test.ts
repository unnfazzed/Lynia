import { BecomeMerchantRequest } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { HARARE_CBD } from "./geo";
import { fieldForReason, OUTSIDE_AREA_MESSAGE, SHOP_KINDS, type SignUpForm, toBecomeRequest, typeStepComplete, validateDetails } from "./sign-up";

const filled: SignUpForm = {
  businessType: "shop",
  shopKind: "auto_parts",
  ownerName: " Tendai Moyo ",
  name: " Mbare Auto Spares ",
  point: { lat: -17.861, lng: 31.036 },
  pinConfirmed: true,
  landmark: " Next to the Total garage ",
  contactPhone: " 0771234567 ",
  termsAccepted: true,
};

describe("sign-up step 1: what do you sell?", () => {
  it("a restaurant is complete on its own; a shop needs its kind", () => {
    expect(typeStepComplete({ businessType: null, shopKind: null })).toBe(false);
    expect(typeStepComplete({ businessType: "restaurant", shopKind: null })).toBe(true);
    expect(typeStepComplete({ businessType: "shop", shopKind: null })).toBe(false);
    expect(typeStepComplete({ businessType: "shop", shopKind: "pharmacy" })).toBe(true);
  });

  it("offers every shop kind the API accepts, once each, in the design doc's words", () => {
    expect(SHOP_KINDS.map((k) => k.label)).toEqual([
      "Pharmacy",
      "Grocery",
      "Butchery",
      "Clothes & shoes",
      "Car parts",
      "Hardware",
      "Phones & electronics",
      "Something else",
    ]);
    expect(new Set(SHOP_KINDS.map((k) => k.kind)).size).toBe(8);
  });
});

describe("sign-up step 2: the details", () => {
  it("a complete form has no errors", () => {
    expect(validateDetails(filled)).toEqual({});
  });

  it("never takes the untouched starting pin as the merchant's address", () => {
    const errors = validateDetails({ ...filled, point: HARARE_CBD, pinConfirmed: false });
    expect(errors.point).toMatch(/Drag the map/);
  });

  it("refuses a pin outside the service area with the API's own words", () => {
    expect(validateDetails({ ...filled, point: { lat: -20.15, lng: 28.58 } }).point).toBe(OUTSIDE_AREA_MESSAGE);
  });

  it("names each missing field", () => {
    const errors = validateDetails({ ...filled, ownerName: " ", name: "", landmark: "", contactPhone: "12", termsAccepted: false });
    expect(Object.keys(errors).sort()).toEqual(["contactPhone", "landmark", "name", "ownerName", "termsAccepted"]);
  });

  it("builds a body the API's contract accepts: trimmed, with the kind only for a shop", () => {
    const shop = toBecomeRequest(filled);
    expect(BecomeMerchantRequest.safeParse(shop).success).toBe(true);
    expect(shop).toEqual({
      ownerName: "Tendai Moyo",
      name: "Mbare Auto Spares",
      businessType: "shop",
      shopKind: "auto_parts",
      location: { point: { lat: -17.861, lng: 31.036 }, landmark: "Next to the Total garage", contactPhone: "0771234567" },
      termsAccepted: true,
    });

    const restaurant = toBecomeRequest({ ...filled, businessType: "restaurant", shopKind: "auto_parts" });
    expect(restaurant).not.toHaveProperty("shopKind");
    expect(BecomeMerchantRequest.safeParse(restaurant).success).toBe(true);
  });

  it("shows an outside-the-area refusal on the map, and everything else as a banner", () => {
    expect(fieldForReason("outside_service_area")).toBe("point");
    expect(fieldForReason("on_hold")).toBeNull();
    expect(fieldForReason(undefined)).toBeNull();
  });
});
