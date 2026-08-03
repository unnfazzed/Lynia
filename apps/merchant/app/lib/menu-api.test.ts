import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LC-D##: `uploadPhotoBlob` deliberately bypasses `authedFetch` (a raw binary PUT with no bearer
 * token), so it used to be a blind spot for the shared `ReachabilityStore` — a network-level
 * failure during a photo upload never flipped the CONNECTION LOST bar, unlike every other
 * merchant mutation. These assert it now reports in either direction, exactly like `authedFetch`
 * does for the rest of the authenticated surface (LC-D04).
 */

const reportReachable = vi.fn();
const reportUnreachable = vi.fn();
vi.mock("./reachability", () => ({
  getReachabilityStore: () => ({ reportReachable, reportUnreachable }),
}));

vi.mock("./api-client", () => ({
  authedFetch: vi.fn(),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reportReachable.mockClear();
  reportUnreachable.mockClear();
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("uploadPhotoBlob feeds the shared ReachabilityStore (LC-D##)", () => {
  it("reports unreachable on a network-level failure", async () => {
    const { uploadPhotoBlob } = await import("./menu-api");
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await expect(uploadPhotoBlob("https://upload", new Blob(["x"]), {})).rejects.toThrow(
      "The upload timed out — check your connection and try again.",
    );
    expect(reportUnreachable).toHaveBeenCalledTimes(1);
    expect(reportReachable).not.toHaveBeenCalled();
  });

  it("reports reachable on a completed response, even a non-ok one — a real response is proof of life", async () => {
    const { uploadPhotoBlob } = await import("./menu-api");
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);

    await expect(uploadPhotoBlob("https://upload", new Blob(["x"]), {})).rejects.toThrow("Photo upload failed (500).");
    expect(reportReachable).toHaveBeenCalledTimes(1);
    expect(reportUnreachable).not.toHaveBeenCalled();
  });

  it("reports reachable on success", async () => {
    const { uploadPhotoBlob } = await import("./menu-api");
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

    await uploadPhotoBlob("https://upload", new Blob(["x"]), {});
    expect(reportReachable).toHaveBeenCalledTimes(1);
    expect(reportUnreachable).not.toHaveBeenCalled();
  });
});
