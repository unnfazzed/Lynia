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

describe("fetchFeatureFlags (per-flag fail direction: launched fails open, unlaunched fails safe-off)", () => {
  it("boot default renders the launched Restaurants layout — no flag-off flash frame at cold start", () => {
    // Regression pin for the 2026-08-12 fix: the pre-fetch default painted restaurantsEnabled:false
    // ("Soon" tile / parcels-only onboarding) for ~250ms + one RTT on every launch. Restaurants is
    // fully launched, so the default — which is also the first rendered frame — must be the live UI.
    expect(DEFAULT_FEATURE_FLAGS.restaurantsEnabled).toBe(true);
    // Unlaunched verticals keep fail-safe-off: never reveal something not ready to show.
    expect(DEFAULT_FEATURE_FLAGS.merchantDispatchAutoEnabled).toBe(false);
    expect(DEFAULT_FEATURE_FLAGS.merchantWalletEnabled).toBe(false);
  });

  it("returns the server flags on a valid response", async () => {
    const flags = { restaurantsEnabled: true, merchantDispatchAutoEnabled: false, merchantWalletEnabled: true };
    await expect(fetchFeatureFlags(fetchReturning(200, flags))).resolves.toEqual(flags);
  });

  it("a server false still kills the launched vertical — the kill switch mechanism is unchanged", async () => {
    const killed = { restaurantsEnabled: false, merchantDispatchAutoEnabled: false, merchantWalletEnabled: false };
    await expect(fetchFeatureFlags(fetchReturning(200, killed))).resolves.toEqual(killed);
  });

  it("falls back to the per-flag defaults on a non-200 — restaurants stays live, unlaunched flags stay off", async () => {
    await expect(fetchFeatureFlags(fetchReturning(500, {}))).resolves.toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it("falls back to the per-flag defaults on a wire-shape mismatch (strict contract: stray/missing fields reject)", async () => {
    await expect(fetchFeatureFlags(fetchReturning(200, { restaurantsEnabled: true }))).resolves.toEqual(DEFAULT_FEATURE_FLAGS);
    await expect(
      fetchFeatureFlags(
        fetchReturning(200, { restaurantsEnabled: true, merchantDispatchAutoEnabled: false, merchantWalletEnabled: true, extra: 1 }),
      ),
    ).resolves.toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it("falls back to the per-flag defaults when the network throws (offline cold start boots the launched layout)", async () => {
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
