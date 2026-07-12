import { orderStatusTone, statusPillLabel } from "../index";

describe("orderStatusTone (JOURNEY-BUGS: every order status rendered the same neutral grey)", () => {
  it("gives a positive outcome the success tone", () => {
    expect(orderStatusTone("delivered")).toBe("success");
    expect(orderStatusTone("completed")).toBe("success");
  });

  it("gives a negative-or-inactive outcome the same muted tone the rider terminal screens already use", () => {
    expect(orderStatusTone("cancelled")).toBe("offline");
    expect(orderStatusTone("undelivered")).toBe("offline");
    expect(orderStatusTone("expired")).toBe("offline");
  });

  it("leaves every in-progress status neutral — nothing to signal yet", () => {
    expect(orderStatusTone("open_for_offers")).toBe("neutral");
    expect(orderStatusTone("assigned")).toBe("neutral");
    expect(orderStatusTone("en_route_pickup")).toBe("neutral");
    expect(orderStatusTone("picked_up")).toBe("neutral");
  });

  it("falls back to neutral for an unrecognised status", () => {
    expect(orderStatusTone("some_future_status")).toBe("neutral");
  });
});

describe("statusPillLabel (sanity check alongside the tone mapping)", () => {
  it("still labels every toned status in plain language", () => {
    expect(statusPillLabel("delivered")).toBe("Delivered");
    expect(statusPillLabel("cancelled")).toBe("Cancelled");
    expect(statusPillLabel("expired")).toBe("Expired");
  });
});
