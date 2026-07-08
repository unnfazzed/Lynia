import { isVersionBelow } from "../../config";
import { fetchServerMinVersion } from "../use-server-version-gate";

/** Minimal fetch stub — only the fields fetchServerMinVersion touches. */
function fetchReturning(status: number, body: unknown): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("isVersionBelow (the shared force-update comparator)", () => {
  it("blocks when the installed version is older", () => {
    expect(isVersionBelow("0.1.0", "0.2.0")).toBe(true);
    expect(isVersionBelow("0.1.9", "0.2.0")).toBe(true);
    expect(isVersionBelow("1.9.9", "2.0.0")).toBe(true);
  });

  it("allows equal and newer versions", () => {
    expect(isVersionBelow("0.2.0", "0.2.0")).toBe(false);
    expect(isVersionBelow("0.2.1", "0.2.0")).toBe(false);
    expect(isVersionBelow("1.0.0", "0.9.9")).toBe(false);
  });

  it("compares numerically, not lexicographically (0.10.0 > 0.9.0)", () => {
    expect(isVersionBelow("0.10.0", "0.9.0")).toBe(false);
    expect(isVersionBelow("0.9.0", "0.10.0")).toBe(true);
  });

  it("handles unequal segment counts by padding with zeros", () => {
    expect(isVersionBelow("0.2", "0.2.0")).toBe(false);
    expect(isVersionBelow("0.2", "0.2.1")).toBe(true);
  });

  it("is inert on a null/absent/zero minimum (the gate-off states)", () => {
    expect(isVersionBelow("0.0.1", null)).toBe(false);
    expect(isVersionBelow("0.0.1", undefined)).toBe(false);
    expect(isVersionBelow("0.0.1", "0.0.0")).toBe(false);
  });
});

describe("fetchServerMinVersion (fail-open by design)", () => {
  it("returns the server minimum on a valid response", async () => {
    await expect(
      fetchServerMinVersion(fetchReturning(200, { minSupportedVersion: "0.2.0" })),
    ).resolves.toBe("0.2.0");
  });

  it("fails open (null) on a non-200 — a broken gate endpoint must never block the app", async () => {
    await expect(fetchServerMinVersion(fetchReturning(500, {}))).resolves.toBeNull();
  });

  it("fails open on a wire-shape mismatch (strict contract: stray/missing fields reject)", async () => {
    await expect(fetchServerMinVersion(fetchReturning(200, { minimum: "0.2.0" }))).resolves.toBeNull();
    await expect(
      fetchServerMinVersion(fetchReturning(200, { minSupportedVersion: "0.2.0", extra: 1 })),
    ).resolves.toBeNull();
  });

  it("fails open when the network throws (offline cold start still boots)", async () => {
    const throwing = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(fetchServerMinVersion(throwing)).resolves.toBeNull();
  });
});
