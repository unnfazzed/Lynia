import React from "react";
import { act, create } from "react-test-renderer";
import { DEFAULT_FEATURE_FLAGS, fetchFeatureFlags, useFeatureFlags } from "../use-feature-flags";

/** Minimal fetch stub — only the fields fetchFeatureFlags touches. */
function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("fetchFeatureFlags (fail-safe-OFF by design)", () => {
  it("returns the server flags on a valid response", async () => {
    const flags = { restaurantsEnabled: true, merchantDispatchAutoEnabled: false, merchantWalletEnabled: true };
    await expect(fetchFeatureFlags(fetchReturning(200, flags))).resolves.toEqual(flags);
  });

  it("fails safe-off (all false) on a non-200 — a broken endpoint must never reveal an unready vertical", async () => {
    await expect(fetchFeatureFlags(fetchReturning(500, {}))).resolves.toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it("fails safe-off on a wire-shape mismatch (strict contract: stray/missing fields reject)", async () => {
    await expect(fetchFeatureFlags(fetchReturning(200, { restaurantsEnabled: true }))).resolves.toEqual(DEFAULT_FEATURE_FLAGS);
    await expect(
      fetchFeatureFlags(
        fetchReturning(200, { restaurantsEnabled: true, merchantDispatchAutoEnabled: false, merchantWalletEnabled: true, extra: 1 }),
      ),
    ).resolves.toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it("fails safe-off when the network throws (offline cold start still boots, food tile stays hidden)", async () => {
    const throwing = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(fetchFeatureFlags(throwing)).resolves.toEqual(DEFAULT_FEATURE_FLAGS);
  });
});

describe("useFeatureFlags (B-O7: cold-boot request prioritization)", () => {
  let fetchMock: jest.Mock;
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ restaurantsEnabled: true, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  function Harness(): null {
    useFeatureFlags();
    return null;
  }

  it("does not fetch /app/feature-flags immediately on mount — deferred a beat behind /app/bootstrap", () => {
    act(() => {
      create(<Harness />);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches once the boot-defer timer elapses", async () => {
    act(() => {
      create(<Harness />);
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/app/feature-flags");
  });
});
