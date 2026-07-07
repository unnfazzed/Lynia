import { PendingFix } from "../location-buffer";

const fix = (lat: number, lng: number) => ({ orderId: "o1", lat, lng });

describe("PendingFix", () => {
  it("starts empty", () => {
    const buf = new PendingFix();
    expect(buf.pendingFix).toBeNull();
    expect(buf.take()).toBeNull();
  });

  it("coalesces to the freshest fix while offline", () => {
    const buf = new PendingFix();
    buf.hold(fix(-17.8, 31.0));
    buf.hold(fix(-17.9, 31.1)); // newer fix replaces the older one — no backlog builds up
    expect(buf.pendingFix).toEqual(fix(-17.9, 31.1));
  });

  it("take() returns the held fix once, then clears it (flush exactly once on reconnect)", () => {
    const buf = new PendingFix();
    buf.hold(fix(-17.9, 31.1));
    expect(buf.take()).toEqual(fix(-17.9, 31.1));
    expect(buf.take()).toBeNull(); // already flushed — a second reconnect won't re-send a stale fix
  });

  it("resumes coalescing after a flush", () => {
    const buf = new PendingFix();
    buf.hold(fix(-17.8, 31.0));
    buf.take();
    buf.hold(fix(-18.0, 31.2)); // next dead-zone
    expect(buf.take()).toEqual(fix(-18.0, 31.2));
  });
});
