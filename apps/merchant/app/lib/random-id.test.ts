import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUuid } from "./random-id";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("randomUuid", () => {
  it("uses crypto.randomUUID where the browser has it", () => {
    const spy = vi.spyOn(globalThis.crypto, "randomUUID");
    expect(randomUuid()).toMatch(V4);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("falls back to crypto.getRandomValues (an http page has no randomUUID), never Math.random", () => {
    // Shadow the prototype's method with an own `undefined`, as an http page sees it.
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
    const random = vi.spyOn(Math, "random");
    try {
      const ids = new Set(Array.from({ length: 50 }, () => randomUuid()));
      expect(ids.size).toBe(50);
      for (const id of ids) expect(id).toMatch(V4);
      expect(random).not.toHaveBeenCalled();
    } finally {
      // Put the real one back for the rest of the run.
      delete (globalThis.crypto as { randomUUID?: unknown }).randomUUID;
    }
  });
});
