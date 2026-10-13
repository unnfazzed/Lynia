import { STANDARD_TIMEOUT_MS, UPLOAD_TIMEOUT_CAP_MS, uploadTimeoutMs } from "../../net/network-policy";
import { uploadImage } from "../uploads";

/**
 * P05 — a photo PUT's deadline scales with its body. A fixed 15 s (the JSON tier) could never carry a
 * 150-400 KB prescription page over a slow uplink, so every attempt aborted and the page was dropped.
 */

describe("uploadTimeoutMs", () => {
  it("adds one second per 10 KB on top of the standard tier", () => {
    expect(uploadTimeoutMs(300_000)).toBe(STANDARD_TIMEOUT_MS + 30_000);
    expect(uploadTimeoutMs(150_000)).toBe(STANDARD_TIMEOUT_MS + 15_000);
    expect(uploadTimeoutMs(1)).toBe(STANDARD_TIMEOUT_MS + 1);
  });

  it("caps at two minutes", () => {
    expect(uploadTimeoutMs(5_000_000)).toBe(UPLOAD_TIMEOUT_CAP_MS);
    expect(UPLOAD_TIMEOUT_CAP_MS).toBe(120_000);
  });

  it("an unknown size gets the standard tier", () => {
    for (const v of [undefined, null, 0, -5, Number.NaN]) expect(uploadTimeoutMs(v)).toBe(STANDARD_TIMEOUT_MS);
  });
});

describe("uploadImage", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  /** A PUT that takes `putMs` to finish (or aborts when the deadline fires first). */
  function stubFetch(blobBytes: number, putMs: number): jest.Mock {
    const mock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === "file:///photo.jpg") return { blob: async () => ({ size: blobBytes }) };
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve({ ok: true, status: 200 }), putMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          const e = new Error("Aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    global.fetch = mock as unknown as typeof fetch;
    return mock;
  }

  it("lets a 300 KB photo take 40 s on a slow uplink (it used to abort at 15 s)", async () => {
    stubFetch(300_000, 40_000);
    const p = uploadImage("https://storage.example/put", "file:///photo.jpg", { "Content-Type": "image/jpeg" });
    const settled = expect(p).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(40_000);
    await settled;
  });

  it("still aborts a stalled upload once the scaled deadline passes", async () => {
    stubFetch(300_000, 10 * 60_000);
    const p = uploadImage("https://storage.example/put", "file:///photo.jpg", { "Content-Type": "image/jpeg" });
    const settled = expect(p).rejects.toThrow("The upload timed out");
    await jest.advanceTimersByTimeAsync(uploadTimeoutMs(300_000) + 1);
    await settled;
  });

  /** A PUT that answers `status` at once. */
  function stubStatus(status: number): void {
    global.fetch = jest.fn(async (url: string) => {
      if (url === "file:///photo.jpg") return { blob: async () => ({ size: 1_000 }) };
      return { ok: status >= 200 && status < 300, status };
    }) as unknown as typeof fetch;
  }

  it("treats a 409 as success: the URL is create-only and a retried PUT's first attempt already landed (E13)", async () => {
    stubStatus(409);
    await expect(uploadImage("https://storage.example/put", "file:///photo.jpg", { "Content-Type": "image/jpeg" })).resolves.toBeUndefined();
  });

  it("still fails any other non-ok status", async () => {
    stubStatus(403);
    await expect(uploadImage("https://storage.example/put", "file:///photo.jpg", { "Content-Type": "image/jpeg" })).rejects.toThrow("Photo upload failed (403)");
  });
});
