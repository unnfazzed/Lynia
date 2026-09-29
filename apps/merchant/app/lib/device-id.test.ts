// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceId, resetDeviceIdMemoForTests } from "./device-id";

function clearCookie() {
  document.cookie = "lynia_merchant_device_id=; Max-Age=0; Path=/";
}

describe("getDeviceId (merchant web upgrade L1 — x-device-id on verify)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearCookie();
    resetDeviceIdMemoForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("mints a web- prefixed UUID once and reuses it across calls and reloads", () => {
    const first = getDeviceId();
    expect(first).toMatch(/^web-[0-9a-f-]{36}$/);
    expect(getDeviceId()).toBe(first);
    resetDeviceIdMemoForTests(); // a reload: memory gone, storage kept
    expect(getDeviceId()).toBe(first);
  });

  it("falls back to the cookie when localStorage is blocked", () => {
    const first = getDeviceId();
    window.localStorage.clear();
    resetDeviceIdMemoForTests();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getDeviceId()).toBe(first);
  });

  it("ignores a tampered stored value and mints a fresh one", () => {
    window.localStorage.setItem("lynia_merchant_device_id", "not-a-device-id");
    expect(getDeviceId()).toMatch(/^web-[0-9a-f-]{36}$/);
  });

  it("never throws when every storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => getDeviceId()).not.toThrow();
  });
});
