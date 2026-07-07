import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "./trust-proxy";

describe("parseTrustProxy", () => {
  it("parses a hop count to a number", () => {
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy(" 3 ")).toBe(3);
  });

  it("parses booleans", () => {
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("false")).toBe(false);
  });

  it("passes a subnet allow-list through verbatim", () => {
    expect(parseTrustProxy("loopback, 10.0.0.0/8")).toBe("loopback, 10.0.0.0/8");
  });
});
