import { describe, expect, it } from "vitest";
import {
  BecomeMerchantRequest,
  ConfirmMerchantPickupRequest,
  CreateOrderRequest,
  MarkUndeliveredRequest,
  MerchantLocationInput,
  merchantWaypoint,
  SubscribeOrderEvent,
  UpdateMerchantHoursRequest,
  UpdateMerchantLocationRequest,
  Waypoint,
} from "./contracts";

describe("MarkUndeliveredRequest (UNDELIVERED-NOTE-01)", () => {
  it("carries only the reason — no free-text note the API would silently throw away", () => {
    expect(Object.keys(MarkUndeliveredRequest.shape)).toEqual(["reason"]);
  });

  it("strips a note a stale client still sends, instead of 400ing the rider out of a terminal hand-off", () => {
    expect(MarkUndeliveredRequest.parse({ reason: "refused", note: "left it at the gate" })).toEqual({ reason: "refused" });
  });

  it("still requires one of the four reasons", () => {
    expect(MarkUndeliveredRequest.safeParse({}).success).toBe(false);
    expect(MarkUndeliveredRequest.safeParse({ reason: "lost" }).success).toBe(false);
  });
});

describe("a merchant's own location (merchant mobile redesign, D-48)", () => {
  const at = { point: { lat: -17.86, lng: 31.04 }, contactPhone: "+263771234567" };

  it("takes the landmark as optional, with the address line the search or GPS lookup gave", () => {
    expect(MerchantLocationInput.safeParse(at).success).toBe(true);
    expect(MerchantLocationInput.safeParse({ ...at, address: "5th Street, Mbare" }).success).toBe(true);
    expect(MerchantLocationInput.safeParse({ ...at, landmark: "Blue gate" }).success).toBe(true);
    expect(MerchantLocationInput.safeParse({ ...at, landmark: "" }).success).toBe(false);
    expect(MerchantLocationInput.safeParse({ point: at.point }).success).toBe(false);
  });

  it("still accepts the old shape an installed web sends (landmark + contact phone)", () => {
    expect(UpdateMerchantLocationRequest.safeParse({ location: { ...at, landmark: "Next to the Total garage" } }).success).toBe(true);
  });

  it("stores a full Waypoint whose landmark is never empty: the landmark, else the address, else the business name", () => {
    expect(merchantWaypoint({ ...at, landmark: "Blue gate", address: "5th Street" }, "Sadza Republic").landmark).toBe("Blue gate");
    expect(merchantWaypoint({ ...at, address: "5th Street, Mbare" }, "Sadza Republic")).toEqual({ ...at, landmark: "5th Street, Mbare" });
    expect(merchantWaypoint(at, "Sadza Republic").landmark).toBe("Sadza Republic");
    expect(Waypoint.safeParse(merchantWaypoint(at, "Sadza Republic")).success).toBe(true);
  });

  it("lets a shop sign up without a kind, and still refuses a kind on a restaurant", () => {
    const base = { ownerName: "Farai", name: "Mbare Auto Spares", location: at, termsAccepted: true as const };
    expect(BecomeMerchantRequest.safeParse({ ...base, businessType: "shop" }).success).toBe(true);
    expect(BecomeMerchantRequest.safeParse({ ...base, businessType: "restaurant", shopKind: "grocery" }).success).toBe(false);
  });
});

describe("ConfirmMerchantPickupRequest (N-16, six digits since D-59)", () => {
  it("takes the six-digit pickup code", () => {
    expect(ConfirmMerchantPickupRequest.safeParse({ code: "731604" }).success).toBe(true);
  });
  it("still parses an installed rider app's four digits, so the service answers it as a wrong code", () => {
    expect(ConfirmMerchantPickupRequest.safeParse({ code: "7316" }).success).toBe(true);
  });
  it("refuses any other shape", () => {
    for (const code of ["", "731", "73160", "7316040", "731 604", "abcdef"]) {
      expect(ConfirmMerchantPickupRequest.safeParse({ code }).success).toBe(false);
    }
  });
});

describe("UpdateMerchantHoursRequest (E2E 2026-10-05 LB-2)", () => {
  const day = { open: "08:00", close: "17:00" };

  it("accepts a week with a closed day (the day is simply absent)", () => {
    const hours = { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day };
    expect(UpdateMerchantHoursRequest.safeParse({ hours }).success).toBe(true);
  });

  it("accepts a week closed every day, and a full week", () => {
    expect(UpdateMerchantHoursRequest.safeParse({ hours: {} }).success).toBe(true);
    const full = { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day };
    expect(UpdateMerchantHoursRequest.safeParse({ hours: full }).success).toBe(true);
  });

  it("still refuses an unknown day key and a malformed window", () => {
    expect(UpdateMerchantHoursRequest.safeParse({ hours: { funday: day } }).success).toBe(false);
    expect(UpdateMerchantHoursRequest.safeParse({ hours: { mon: { open: "8am", close: "17:00" } } }).success).toBe(false);
  });
});

describe("CreateOrderRequest item text — whitespace-only is not a description", () => {
  const base = {
    pickup: { point: { lat: -17.82, lng: 31.05 }, landmark: "Eastgate", contactPhone: "+263771234567" },
    dropoff: { point: { lat: -17.8, lng: 31.04 }, landmark: "Avondale", contactPhone: "+263777654321" },
    declaredValue: 0,
    proposedFare: 5,
  };

  it("rejects a whitespace-only itemDescription, the same as an empty one", () => {
    expect(CreateOrderRequest.safeParse({ ...base, itemDescription: "   " }).success).toBe(false);
    expect(CreateOrderRequest.safeParse({ ...base, itemDescription: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only line-item description", () => {
    expect(CreateOrderRequest.safeParse({ ...base, items: [{ description: " \t ", quantity: 1 }] }).success).toBe(false);
  });

  it("trims surrounding whitespace off a real description", () => {
    const r = CreateOrderRequest.parse({ ...base, itemDescription: "  Documents  " });
    expect(r.itemDescription).toBe("Documents");
  });
});

describe("SubscribeOrderEvent — the subscribe:order payload is runtime-validated", () => {
  it("accepts a UUID orderId", () => {
    expect(SubscribeOrderEvent.safeParse({ orderId: "2f1e9b3c-0000-4000-8000-000000000001" }).success).toBe(true);
  });

  it("rejects a malformed or missing orderId (it would otherwise reach a @db.Uuid column)", () => {
    expect(SubscribeOrderEvent.safeParse({ orderId: "not-a-uuid" }).success).toBe(false);
    expect(SubscribeOrderEvent.safeParse({}).success).toBe(false);
    expect(SubscribeOrderEvent.safeParse(undefined).success).toBe(false);
  });
});
