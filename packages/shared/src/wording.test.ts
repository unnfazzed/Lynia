import { describe, expect, it } from "vitest";
import { bikerWording } from "./wording";

describe("bikerWording (D-98)", () => {
  it("swaps every case of rider/riders for biker/bikers", () => {
    expect(bikerWording("Rider · riders · RIDER · the rider's bike · Riders")).toBe("Biker · bikers · BIKER · the biker's bike · Bikers");
  });
  it("leaves words that only contain it alone", () => {
    expect(bikerWording("riderId · overriders")).toBe("riderId · overriders");
  });
});
