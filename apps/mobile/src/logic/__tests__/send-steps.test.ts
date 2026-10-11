import { ApiError } from "../../api/client";
import { DRAFT_STOP_NAME_MAX } from "../send-draft";
import {
  bandScaleMax,
  coordName,
  firstIncompleteStep,
  isDefinitiveSendFailure,
  kmLabel,
  MIN_TRIP_KM,
  money,
  priceOk,
  sanitizePriceText,
  sendAgainBanner,
  sendRefusal,
  type Stop,
  STOP_NAME_MAX,
  stepPrice,
  stopName,
  trackPos,
  tripTooShort,
  whatMissingHint,
  whereOk,
} from "../send-steps";

const IN: Stop = { lat: -17.8292, lng: 31.0522, name: "Eastgate Mall, CBD", source: "search" };
const IN2: Stop = { lat: -17.82, lng: 31.06, name: "14 Glenara Ave, Avenues", source: "search" };
const OUT: Stop = { lat: -18.3, lng: 31.3, name: "Seke Rd, Chitungwiza", source: "search" };
const item = (description: string) => ({ description, quantity: 1 });

describe("send-steps (ledger D-52)", () => {
  it("step 1 needs both stops inside the corridor", () => {
    expect(whereOk(IN, null)).toBe(false);
    expect(whereOk(IN, OUT)).toBe(false);
    expect(whereOk(IN, IN2)).toBe(true);
  });

  it("the step-2 hint names only what is missing, in field order, and skips fields showing their own error", () => {
    expect(whatMissingHint([item("")], "", "")).toBe("Still needed: what you're sending, your phone, recipient phone");
    expect(whatMissingHint([item("")], "0772451180", "")).toBe("Still needed: what you're sending, recipient phone");
    expect(whatMissingHint([item("Docs")], "0772451180", "077 12", { recipientShown: true })).toBeNull();
    expect(whatMissingHint([item("Docs")], "0772451180", "0715550090")).toBeNull();
  });

  it("a Send again lands on the first incomplete step", () => {
    const base = { pickup: IN, drop: IN2, items: [item("Docs")], senderPhone: "0772451180", recipientPhone: "0715550090", price: 3.36 };
    expect(firstIncompleteStep(base)).toBe(4);
    expect(firstIncompleteStep({ ...base, recipientPhone: "" })).toBe(2);
    expect(firstIncompleteStep({ ...base, price: null })).toBe(3);
    expect(firstIncompleteStep({ ...base, drop: OUT })).toBe(1);
  });

  it("price steps by $0.50 with a $0.50 floor, and typed text keeps two decimals", () => {
    expect(stepPrice(3.36, 1)).toBe(3.86);
    expect(stepPrice(0.6, -1)).toBe(0.5);
    expect(stepPrice(null, 1)).toBe(0.5);
    expect(sanitizePriceText("3,456")).toBe("3.45");
    expect(sanitizePriceText("$12a")).toBe("12");
    expect(priceOk(0)).toBe(false);
    expect(priceOk(0.5)).toBe(true);
  });

  it("the band track stretches past $6 for long trips and clamps the marker", () => {
    expect(bandScaleMax(3.8)).toBe(6);
    expect(bandScaleMax(8)).toBe(12);
    expect(trackPos(33.6, 6)).toBe(1);
    expect(trackPos(-1, 6)).toBe(0);
  });

  it("formats labels the way the handoff draws them", () => {
    expect(kmLabel(3.14)).toBe("3.1 km");
    expect(money(3.36)).toBe("$3.36");
    expect(coordName(-17.8292, 31.0522)).toBe("-17.82920, 31.05220");
    expect(stopName(`  ${"x".repeat(200)}`)).toHaveLength(160);
    expect(sendAgainBanner("2026-09-28T09:00:00Z")).toBe("Copied from your order on 28 Sep. Check it, then send.");
    expect(sendAgainBanner("")).toBe("Copied from your order. Check it, then send.");
  });
});

describe("send-steps — reviewed list 2026-10-07 (U47, U61, U45, U16)", () => {
  it("U47: a drop-off on top of the pickup is not a trip — step 1 stays open", () => {
    const same: Stop = { ...IN, name: "My location", source: "map" };
    const tenMetres: Stop = { ...IN, lat: IN.lat + 0.00009, source: "map" };
    expect(tripTooShort(IN, same)).toBe(true);
    expect(tripTooShort(IN, tenMetres)).toBe(true);
    expect(whereOk(IN, same)).toBe(false);
    expect(whereOk(IN, tenMetres)).toBe(false);
    expect(firstIncompleteStep({ pickup: IN, drop: same, items: [item("Docs")], senderPhone: "0772451180", recipientPhone: "0715550090", price: 2 })).toBe(1);
    // A real trip still passes, and an unset stop is "missing", not "too short".
    expect(tripTooShort(IN, IN2)).toBe(false);
    expect(tripTooShort(IN, null)).toBe(false);
    expect(MIN_TRIP_KM).toBe(0.05);
  });

  it("U61: a price above the contract's $100,000 can't reach Review", () => {
    expect(priceOk(100_000)).toBe(true);
    expect(priceOk(100_000.01)).toBe(false);
    expect(priceOk(250_000)).toBe(false);
    expect(priceOk(9_999_999)).toBe(false);
  });

  it("U45: a banned or suspended sender is refused for standing, a hold for the hold", () => {
    expect(sendRefusal(new ApiError(403, "Your account is not in good standing.", "account_banned"))).toBe("standing");
    expect(sendRefusal(new ApiError(403, "Your account is not in good standing.", "account_suspended"))).toBe("standing");
    expect(sendRefusal(new ApiError(403, "Your account is on hold.", "on_hold"))).toBe("hold");
    expect(sendRefusal(new ApiError(422, "Outside the service area", "out_of_area"))).toBeNull();
    expect(sendRefusal(null)).toBeNull();
  });

  it("U16: only a 4xx settles a send; a timeout, a dropped link or a 5xx may have created the order", () => {
    expect(isDefinitiveSendFailure(new ApiError(400, "bad"))).toBe(true);
    expect(isDefinitiveSendFailure(new ApiError(429, "slow down"))).toBe(true);
    expect(isDefinitiveSendFailure(new ApiError(0, "The network is slow — check your connection and try again."))).toBe(false);
    expect(isDefinitiveSendFailure(new ApiError(502, "bad gateway"))).toBe(false);
    expect(isDefinitiveSendFailure(new Error("network"))).toBe(false);
  });

  it("U16 review: a standing refusal (hold / banned / suspended) keeps the key — it runs before the replay lookup", () => {
    expect(isDefinitiveSendFailure(new ApiError(403, "held", "on_hold"))).toBe(false);
    expect(isDefinitiveSendFailure(new ApiError(403, "held", "account_on_hold"))).toBe(false);
    expect(isDefinitiveSendFailure(new ApiError(403, "not in good standing", "account_banned"))).toBe(false);
    expect(isDefinitiveSendFailure(new ApiError(403, "not in good standing", "account_suspended"))).toBe(false);
    expect(isDefinitiveSendFailure(new ApiError(403, "forbidden"))).toBe(true);
  });

  it("the draft's stop-name cap matches the flow's", () => {
    // send-draft.ts keeps its own copy so it stays a leaf module (sign-out imports its key).
    expect(STOP_NAME_MAX).toBe(DRAFT_STOP_NAME_MAX);
  });
});
