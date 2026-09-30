import { describe, expect, it } from "vitest";
import { BecomeMerchantRequest, MarkUndeliveredRequest, MerchantLocationInput, merchantWaypoint, UpdateMerchantLocationRequest, Waypoint } from "./contracts";

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
