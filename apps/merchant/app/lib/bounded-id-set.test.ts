import { describe, expect, it } from "vitest";
import { addBoundedId } from "./bounded-id-set";

describe("addBoundedId (B-O14)", () => {
  it("adds ids without exceeding the cap", () => {
    let set = new Set<string>();
    for (let i = 0; i < 5; i++) {
      set = addBoundedId(set, `id${i}`, 5);
    }
    expect(set.size).toBe(5);
  });

  it("FIFO-evicts the oldest id once the cap is exceeded, not an arbitrary truncation", () => {
    let set = new Set<string>();
    for (let i = 0; i < 10; i++) {
      set = addBoundedId(set, `id${i}`, 5);
    }
    expect(set.size).toBe(5);
    expect(set.has("id9")).toBe(true);
    expect(set.has("id5")).toBe(true);
    expect(set.has("id4")).toBe(false);
    expect(set.has("id0")).toBe(false);
  });

  it("re-adding an already-present id is a no-op (keeps the same reference)", () => {
    const set = addBoundedId(new Set<string>(), "id0", 5);
    const next = addBoundedId(set, "id0", 5);
    expect(next).toBe(set);
  });
});
