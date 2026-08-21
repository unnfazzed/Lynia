/**
 * The consumer half of the MOB-BOOT-04 §8.2-step-2 contract (config-boot-safety.test.ts is the
 * producer half): when the build is misconfigured, config.ts no longer throws at module scope —
 * apiFetch is where the failure surfaces, per request, deterministically, before any network I/O.
 */
jest.mock("../../config", () => ({
  API_URL: "http://localhost:3000",
  API_CONFIG_ERROR: "This build is misconfigured: EXPO_PUBLIC_API_URL (or extra.apiUrl in app.config.ts) is not set.",
}));

import { ApiError, apiFetch } from "../client";

describe("apiFetch — surfaces API_CONFIG_ERROR per-request", () => {
  it("refuses with a non-retryable ApiError carrying the config message, before any network call", async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const err: unknown = await apiFetch("/app/bootstrap").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(400); // deterministic — the retry policy must not hammer a dead constant
    expect(apiErr.retryable).toBe(false);
    expect(apiErr.message).toMatch(/misconfigured/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
