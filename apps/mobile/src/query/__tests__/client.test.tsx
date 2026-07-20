import { ApiError } from "../../api/client";
import { queryClient, shouldRetry } from "../client";

describe("ApiError.retryable (the per-error half of the retry taxonomy)", () => {
  it("is true for a dropped link (status 0) and any 5xx", () => {
    expect(new ApiError(0, "offline").retryable).toBe(true);
    expect(new ApiError(500, "boom").retryable).toBe(true);
    expect(new ApiError(503, "unavailable").retryable).toBe(true);
  });
  it("is false for every 4xx (a deterministic answer a retry only repeats)", () => {
    for (const s of [400, 401, 403, 404, 409, 422, 429]) {
      expect(new ApiError(s, "no").retryable).toBe(false);
    }
  });
});

describe("mutation retry policy (writes are non-retryable by default)", () => {
  it("defaults mutations to no client-side retry", () => {
    // Money-moving / state-changing writes must not be silently re-sent by the client. Pinned so a
    // future per-mutation `retry:` is a deliberate, reviewed change (and must carry an idempotency key).
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });
});

describe("shouldRetry", () => {
  it("retries a network failure (status 0) a couple of times, then stops", () => {
    const err = new ApiError(0, "Can't reach LyniaGo");
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
