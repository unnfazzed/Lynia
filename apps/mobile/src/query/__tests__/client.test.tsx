import { ApiError } from "../../api/client";
import { shouldRetry } from "../client";

describe("shouldRetry", () => {
  it("retries a network failure (status 0) a couple of times, then stops", () => {
    const err = new ApiError(0, "Can't reach Lynia");
    expect(shouldRetry(0, err)).toBe(true);
    expect(shouldRetry(1, err)).toBe(true);
    expect(shouldRetry(2, err)).toBe(false);
  });

  it("retries a transient server 5xx", () => {
    expect(shouldRetry(0, new ApiError(500, "boom"))).toBe(true);
    expect(shouldRetry(0, new ApiError(503, "unavailable"))).toBe(true);
  });

  it("never retries a deterministic 4xx (auth / validation / domain conflict)", () => {
    expect(shouldRetry(0, new ApiError(401, "expired"))).toBe(false);
    expect(shouldRetry(0, new ApiError(404, "not found"))).toBe(false);
    expect(shouldRetry(0, new ApiError(409, "conflict"))).toBe(false);
    expect(shouldRetry(0, new ApiError(422, "invalid"))).toBe(false);
  });

  it("treats an unexpected non-ApiError as transient", () => {
    expect(shouldRetry(0, new Error("weird"))).toBe(true);
    expect(shouldRetry(2, new Error("weird"))).toBe(false);
  });
});
