import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { queryRetryDelayMs } from "../../net/network-policy";
import { DEFAULT_STALE_TIME_MS, invalidateIfStale, pendingOrQueued, queryClient, shouldRetry } from "../client";

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

describe("query retry delay (C-O2 central network policy)", () => {
  it("wires the jittered, RTT-tuned backoff instead of TanStack's un-tuned default", () => {
    expect(queryClient.getDefaultOptions().queries?.retryDelay).toBe(queryRetryDelayMs);
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

describe("pendingOrQueued (ALR-09)", () => {
  it("is false when idle", () => {
    expect(pendingOrQueued({ isPending: false, isPaused: false })).toBe(false);
  });

  it("is true while genuinely in flight (pending, not paused)", () => {
    expect(pendingOrQueued({ isPending: true, isPaused: false })).toBe(true);
  });

  it("is 'queued' while paused offline — never a bare spinner masquerading as in-flight", () => {
    // Pre-fix, every call site read `mutation.isPending` alone, which stays true for the whole
    // outage a paused (`networkMode:"online"`) mutation sits parked in — indistinguishable from a
    // request genuinely on the wire. This is the distinction the fix threads through to Button.
    expect(pendingOrQueued({ isPending: true, isPaused: true })).toBe("queued");
  });

  it("takes 'queued' over 'pending' when multiple mutations share one control and any is paused", () => {
    expect(pendingOrQueued({ isPending: true, isPaused: false }, { isPending: true, isPaused: true })).toBe("queued");
  });

  it("is pending, not queued, when one of several sharing a control is in flight and none are paused", () => {
    expect(pendingOrQueued({ isPending: false, isPaused: false }, { isPending: true, isPaused: false })).toBe(true);
  });

  it("is false when every mutation sharing a control is idle", () => {
    expect(pendingOrQueued({ isPending: false, isPaused: false }, { isPending: false, isPaused: false })).toBe(false);
  });
});

describe("invalidateIfStale (A-O15)", () => {
  const KEY = ["activeCustomerOrder"];

  it("skips invalidation when the cached entry is younger than staleMs — no redundant round trip", () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, { id: "order-1" }); // dataUpdatedAt = now, e.g. just seeded by useBootstrap
    const spy = jest.spyOn(qc, "invalidateQueries");

    invalidateIfStale(qc, KEY, DEFAULT_STALE_TIME_MS);

    expect(spy).not.toHaveBeenCalled();
  });

  it("invalidates immediately when the cached entry predates the staleness window", () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, { id: "order-1" });
    const state = qc.getQueryState(KEY);
    if (state) state.dataUpdatedAt = Date.now() - (DEFAULT_STALE_TIME_MS + 1);
    const spy = jest.spyOn(qc, "invalidateQueries");

    invalidateIfStale(qc, KEY, DEFAULT_STALE_TIME_MS);

    expect(spy).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it("invalidates immediately when the key has never been fetched (dataUpdatedAt defaults to 0)", () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, "invalidateQueries");

    invalidateIfStale(qc, KEY, DEFAULT_STALE_TIME_MS);

    expect(spy).toHaveBeenCalledWith({ queryKey: KEY });
  });
});
