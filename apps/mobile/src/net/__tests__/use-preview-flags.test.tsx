import React from "react";
import { act, create } from "react-test-renderer";
import { DEFAULT_PREVIEW_FLAGS, fetchPreviewFlags, usePreviewFlags } from "../use-preview-flags";

/** Minimal fetch stub — only the fields fetchPreviewFlags touches. */
function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("fetchPreviewFlags (fail-safe-OFF — a broken gate must never reveal a fabricated payment)", () => {
  it("boot default hides the payment previews", () => {
    // The inverse of restaurantsEnabled's fail-open default, deliberately. Every screen this flag
    // reveals shows a payment that did not happen; a frame of the honest fallback is a cosmetic
    // blemish, a frame of a fake payment screen is a lie. Do not flip this to true.
    expect(DEFAULT_PREVIEW_FLAGS.paymentSimulationEnabled).toBe(false);
  });

  it("returns the server flags on a valid response", async () => {
    const flags = { paymentSimulationEnabled: true };
    await expect(fetchPreviewFlags(fetchReturning(200, flags))).resolves.toEqual(flags);
  });

  it("a server false retracts the previews — the kill switch, with no app update", async () => {
    await expect(fetchPreviewFlags(fetchReturning(200, { paymentSimulationEnabled: false }))).resolves.toEqual({
      paymentSimulationEnabled: false,
    });
  });

  it("falls back to safe-off on a non-200", async () => {
    await expect(fetchPreviewFlags(fetchReturning(500, {}))).resolves.toEqual(DEFAULT_PREVIEW_FLAGS);
  });

  it("falls back to safe-off on a wire-shape mismatch (strict contract: stray/missing fields reject)", async () => {
    await expect(fetchPreviewFlags(fetchReturning(200, {}))).resolves.toEqual(DEFAULT_PREVIEW_FLAGS);
    await expect(
      fetchPreviewFlags(fetchReturning(200, { paymentSimulationEnabled: true, extra: 1 })),
    ).resolves.toEqual(DEFAULT_PREVIEW_FLAGS);
  });

  it("falls back to safe-off when the network throws (offline cold start shows the real screens)", async () => {
    const throwing = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(fetchPreviewFlags(throwing)).resolves.toEqual(DEFAULT_PREVIEW_FLAGS);
  });
});

describe("usePreviewFlags (cold-boot request prioritization, same as useFeatureFlags)", () => {
  let fetchMock: jest.Mock;
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ paymentSimulationEnabled: true }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  function Harness(): null {
    usePreviewFlags();
    return null;
  }

  it("does not fetch /app/preview-flags immediately on mount — deferred behind /app/bootstrap", () => {
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
    expect(fetchMock.mock.calls[0][0]).toContain("/app/preview-flags");
  });
});
