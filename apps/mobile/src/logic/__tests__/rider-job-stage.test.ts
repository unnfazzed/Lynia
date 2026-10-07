import { AUTO_ADVANCE, parcelStage, parseArrival, parseDeliverOutbox, parseReach, stepFor } from "../rider-job-stage";

describe("parcelStage (Rider v2 A1–A8, ledger D-54)", () => {
  it.each([
    ["assigned", null, "toPickup"],
    ["confirmed", null, "toPickup"],
    ["en_route_pickup", null, "toPickup"],
    ["en_route_pickup", "pickup", "atPickup"],
    ["picked_up", "pickup", "toDrop"],
    ["en_route_dropoff", "pickup", "toDrop"],
    ["en_route_dropoff", "drop", "code"],
  ] as const)("%s + arrived %s → %s", (status, arrived, stage) => {
    expect(parcelStage(status, arrived)).toBe(stage);
  });

  it("a drop-off arrival never skips the pickup stages", () => {
    expect(parcelStage("en_route_pickup", "drop")).toBe("toPickup");
  });

  it("the step track sits on Pickup before the collect and on Drop-off after", () => {
    expect(stepFor("toPickup")).toBe(0);
    expect(stepFor("atKitchen")).toBe(0);
    expect(stepFor("toDrop")).toBe(2);
    expect(stepFor("code")).toBe(2);
  });

  it("only the steps the handoff draws no tap for are advanced automatically", () => {
    expect(AUTO_ADVANCE).toEqual({ assigned: "confirmed", confirmed: "en_route_pickup", picked_up: "en_route_dropoff" });
  });
});

describe("parseArrival", () => {
  it("reads a stored mark and rejects anything malformed", () => {
    expect(parseArrival(JSON.stringify({ orderId: "o1", at: "drop" }))).toEqual({ orderId: "o1", at: "drop" });
    expect(parseArrival(JSON.stringify({ orderId: "o1", at: "door" }))).toBeNull();
    expect(parseArrival(JSON.stringify({ at: "pickup" }))).toBeNull();
    expect(parseArrival("not json")).toBeNull();
    expect(parseArrival(null)).toBeNull();
  });
});

describe("rider audit: persisted reach wait and delivery outbox", () => {
  it("parseReach keeps a well-formed mark and rejects junk", () => {
    expect(parseReach(JSON.stringify({ orderId: "o1", startedAt: 1000, calls: 2, wa: 1 }))).toEqual({ orderId: "o1", startedAt: 1000, calls: 2, wa: 1 });
    expect(parseReach(JSON.stringify({ orderId: "o1", startedAt: 1000 }))).toEqual({ orderId: "o1", startedAt: 1000, calls: 0, wa: 0 });
    expect(parseReach(JSON.stringify({ orderId: "", startedAt: 1000 }))).toBeNull();
    expect(parseReach(JSON.stringify({ orderId: "o1", startedAt: "x" }))).toBeNull();
    expect(parseReach("{")).toBeNull();
    expect(parseReach(null)).toBeNull();
  });

  it("parseDeliverOutbox only accepts a 6-digit code for an order", () => {
    expect(parseDeliverOutbox(JSON.stringify({ orderId: "o1", code: "123456" }))).toEqual({ orderId: "o1", code: "123456" });
    expect(parseDeliverOutbox(JSON.stringify({ orderId: "o1", code: "12345" }))).toBeNull();
    expect(parseDeliverOutbox(JSON.stringify({ code: "123456" }))).toBeNull();
    expect(parseDeliverOutbox("nope")).toBeNull();
  });
});
