import { describe, expect, it } from "vitest";
import { orderRoom, parseBearer } from "./tracking.constants";

describe("tracking helpers", () => {
  it("builds a stable order room name", () => {
    expect(orderRoom("abc-123")).toBe("order:abc-123");
  });

  it("parses both bearer-prefixed and raw tokens", () => {
    expect(parseBearer("Bearer xyz")).toBe("xyz");
    expect(parseBearer("xyz")).toBe("xyz");
    expect(parseBearer(undefined)).toBeUndefined();
    expect(parseBearer("")).toBeUndefined();
  });
});
