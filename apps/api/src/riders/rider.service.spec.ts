import { describe, expect, it } from "vitest";
import { canGoOnline } from "./rider.service";

describe("canGoOnline (rider gating, §5d)", () => {
  it("allows only verified riders online", () => {
    expect(canGoOnline("verified")).toBe(true);
  });
  it("blocks pending and failed riders", () => {
    expect(canGoOnline("pending")).toBe(false);
    expect(canGoOnline("failed")).toBe(false);
  });
});
