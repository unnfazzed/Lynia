import { describe, expect, it, vi } from "vitest";
import { AzureBlobStorage, type AzureBlobServiceClient } from "./azure-blob.storage";

const T0 = Date.parse("2026-09-24T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;

/** Mirrors the SDK's RestError shape (statusCode). */
const restError = (statusCode: number) => Object.assign(new Error(`status ${statusCode}`), { statusCode });

interface BlobFake {
  getProperties?: () => Promise<unknown>;
  downloadToBuffer?: (offset: number, count: number) => Promise<Buffer>;
  deleteIfExists?: () => Promise<unknown>;
}

/**
 * Fakes only the SDK's network edge (delegation-key fetch + per-blob calls). SAS generation itself runs
 * through the REAL `generateBlobSASQueryParameters`, so the query-string assertions below are what Azure
 * would actually receive.
 */
function harness(opts: { blob?: BlobFake; list?: Array<{ name: string; properties: { createdOn?: Date; lastModified: Date } }> } = {}) {
  let clock = T0;
  const keyFetches: Array<{ startsOn: Date; expiresOn: Date }> = [];
  const getUserDelegationKey = vi.fn(async (startsOn: Date, expiresOn: Date) => {
    keyFetches.push({ startsOn, expiresOn });
    return {
      signedObjectId: "00000000-0000-0000-0000-000000000001",
      signedTenantId: "00000000-0000-0000-0000-000000000002",
      signedStartsOn: startsOn,
      signedExpiresOn: expiresOn,
      signedService: "b",
      signedVersion: "2025-01-05",
      value: Buffer.from("k".repeat(32)).toString("base64"),
    };
  });
  const blobCalls: string[] = [];
  const service = {
    getUserDelegationKey,
    getContainerClient: (container: string) => ({
      getBlockBlobClient: (key: string) => {
        blobCalls.push(key);
        return {
          url: `https://lyniamedia.blob.core.windows.net/${container}/${key}`,
          getProperties: opts.blob?.getProperties ?? (async () => ({})),
          downloadToBuffer: opts.blob?.downloadToBuffer ?? (async () => Buffer.alloc(0)),
          deleteIfExists: opts.blob?.deleteIfExists ?? (async () => ({})),
        };
      },
      listBlobsFlat: ({ prefix }: { prefix: string }) =>
        (async function* () {
          for (const b of opts.list ?? []) if (b.name.startsWith(prefix)) yield b;
        })(),
    }),
  } as unknown as AzureBlobServiceClient;
  const storage = new AzureBlobStorage({ account: "lyniamedia", container: "media", serviceClient: service, now: () => clock });
  return {
    storage,
    getUserDelegationKey,
    keyFetches,
    blobCalls,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const params = (url: string) => new URL(url).searchParams;
const at = (s: string | null) => Date.parse(s ?? "");

describe("AzureBlobStorage upload SAS (C1 / S4 / E13)", () => {
  it("is `cw` on one blob, https only, starts 5 min early and expires in 10 min", async () => {
    const { storage } = harness();
    const target = await storage.createUploadUrl("kyc/rider-1/a.jpg", "image/jpeg", 600, 8 * 1024 * 1024);
    expect(target.key).toBe("kyc/rider-1/a.jpg");
    expect(target.url.startsWith("https://lyniamedia.blob.core.windows.net/media/kyc/rider-1/a.jpg?")).toBe(true);
    const q = params(target.url);
    expect(q.get("sp")).toBe("cw");
    expect(q.get("sr")).toBe("b"); // blob-scoped: one path, never the container
    expect(q.get("spr")).toBe("https");
    expect(at(q.get("st"))).toBe(T0 - 5 * MIN);
    expect(at(q.get("se"))).toBe(T0 + 10 * MIN);
    // A user-delegation SAS (signed object id present), never an account-key SAS.
    expect(q.get("skoid")).toBe("00000000-0000-0000-0000-000000000001");
    expect(q.get("sig")).toBeTruthy();
  });

  it("returns the Azure PUT headers, and never an X-Goog header", async () => {
    const { storage } = harness();
    const target = await storage.createUploadUrl("dish/o/a.png", "image/png", 600, 300 * 1024);
    expect(target.headers).toEqual({ "Content-Type": "image/png", "x-ms-blob-type": "BlockBlob" });
  });

  it("caps the upload SAS at 10 minutes even when a longer TTL is asked for", async () => {
    const { storage } = harness();
    const q = params((await storage.createUploadUrl("kyc/r/a.jpg", "image/jpeg", 3600)).url);
    expect(at(q.get("se"))).toBe(T0 + 10 * MIN);
  });
});

describe("AzureBlobStorage read SAS (S4)", () => {
  it("is `r` only, https only, blob-scoped", async () => {
    const { storage } = harness();
    const q = params(await storage.createReadUrl("pickup/r/a.jpg", 900));
    expect(q.get("sp")).toBe("r");
    expect(q.get("sr")).toBe("b");
    expect(q.get("spr")).toBe("https");
  });

  it("caps a KYC / national-ID image read at 5 minutes, whatever the caller asks for", async () => {
    const { storage } = harness();
    const q = params(await storage.createReadUrl("kyc/rider-1/a.jpg", 15 * 60));
    expect(at(q.get("se"))).toBe(T0 + 5 * MIN);
  });

  it("defaults to 15 minutes (the GCS adapter's default) and honours an explicit non-KYC TTL", async () => {
    const { storage } = harness();
    expect(at(params(await storage.createReadUrl("pickup/r/a.jpg")).get("se"))).toBe(T0 + 15 * MIN);
    // A 24 h merchant photo read (merchant.service PHOTO_READ_URL_TTL_SECONDS) is clamped only by the
    // key's own expiry: startsOn(now − 5 min) + 24 h.
    expect(at(params(await storage.createReadUrl("dish/o/a.jpg", 24 * 60 * 60)).get("se"))).toBe(T0 - 5 * MIN + 24 * HOUR);
  });
});

describe("AzureBlobStorage user-delegation key cache (S4)", () => {
  it("fetches one key with a ≤ 24 h lifetime and reuses it", async () => {
    const h = harness();
    await h.storage.createUploadUrl("kyc/r/a.jpg", "image/jpeg");
    await h.storage.createReadUrl("pickup/r/a.jpg");
    await h.storage.createUploadUrl("kyc/r/b.jpg", "image/jpeg");
    expect(h.getUserDelegationKey).toHaveBeenCalledTimes(1);
    const { startsOn, expiresOn } = h.keyFetches[0]!;
    expect(startsOn.getTime()).toBe(T0 - 5 * MIN);
    expect(expiresOn.getTime() - startsOn.getTime()).toBeLessThanOrEqual(24 * HOUR);
  });

  it("refreshes before expiry — once less than an hour of the key is left", async () => {
    const h = harness();
    await h.storage.createUploadUrl("kyc/r/a.jpg", "image/jpeg");
    h.advance(22 * HOUR); // 1 h 55 min left: still served from cache
    await h.storage.createUploadUrl("kyc/r/b.jpg", "image/jpeg");
    expect(h.getUserDelegationKey).toHaveBeenCalledTimes(1);
    h.advance(HOUR); // 55 min left: refreshed
    const q = params((await h.storage.createUploadUrl("kyc/r/c.jpg", "image/jpeg")).url);
    expect(h.getUserDelegationKey).toHaveBeenCalledTimes(2);
    // The new SAS is signed by the new key (its skt = the refreshed key's start).
    expect(at(q.get("skt"))).toBe(T0 + 23 * HOUR - 5 * MIN);
  });

  it("never lets a SAS outlive the key that signs it", async () => {
    const h = harness();
    await h.storage.createUploadUrl("kyc/r/a.jpg", "image/jpeg");
    h.advance(5 * MIN); // young key: reused for a 24 h read, which is clamped to the key's expiry
    const q = params(await h.storage.createReadUrl("dish/o/a.jpg", 24 * 60 * 60));
    expect(h.getUserDelegationKey).toHaveBeenCalledTimes(1);
    expect(at(q.get("se"))).toBe(at(q.get("ske")));
  });

  it("shares one in-flight fetch between concurrent callers (single-flight)", async () => {
    const h = harness();
    await Promise.all([
      h.storage.createUploadUrl("kyc/r/a.jpg", "image/jpeg"),
      h.storage.createUploadUrl("kyc/r/b.jpg", "image/jpeg"),
      h.storage.createReadUrl("pickup/r/c.jpg"),
    ]);
    expect(h.getUserDelegationKey).toHaveBeenCalledTimes(1);
  });

  it("retries a failed key fetch once, then surfaces the error", async () => {
    const h = harness();
    h.getUserDelegationKey.mockRejectedValueOnce(restError(403));
    await expect(h.storage.createUploadUrl("kyc/r/a.jpg", "image/jpeg")).resolves.toBeTruthy();
    expect(h.getUserDelegationKey).toHaveBeenCalledTimes(2);

    const h2 = harness();
    h2.getUserDelegationKey.mockRejectedValueOnce(restError(403)).mockRejectedValueOnce(restError(403));
    await expect(h2.storage.createUploadUrl("kyc/r/a.jpg", "image/jpeg")).rejects.toThrow(/403/);
    // Nothing poisoned: the next call fetches afresh.
    await expect(h2.storage.createUploadUrl("kyc/r/a.jpg", "image/jpeg")).resolves.toBeTruthy();
  });
});

describe("AzureBlobStorage.stat / readHead (E8)", () => {
  it("stat maps properties to {size, contentType, etag}", async () => {
    const { storage } = harness({ blob: { getProperties: async () => ({ contentLength: 1234, contentType: "image/jpeg", etag: '"0x8D"' }) } });
    await expect(storage.stat("kyc/r/a.jpg")).resolves.toEqual({ size: 1234, contentType: "image/jpeg", etag: '"0x8D"' });
  });

  it("stat returns null on 404 and throws on 5xx", async () => {
    const missing = harness({ blob: { getProperties: async () => { throw restError(404); } } });
    await expect(missing.storage.stat("kyc/r/a.jpg")).resolves.toBeNull();
    const down = harness({ blob: { getProperties: async () => { throw restError(503); } } });
    await expect(down.storage.stat("kyc/r/a.jpg")).rejects.toThrow(/503/);
  });

  it("readHead range-GETs the first N bytes; 404 → null, 416 (tiny blob) → empty, 5xx throws", async () => {
    const calls: Array<[number, number]> = [];
    const ok = harness({ blob: { downloadToBuffer: async (o, c) => { calls.push([o, c]); return Buffer.from([0xff, 0xd8, 0xff]); } } });
    await expect(ok.storage.readHead("kyc/r/a.jpg", 12)).resolves.toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(calls).toEqual([[0, 12]]);
    await expect(harness({ blob: { downloadToBuffer: async () => { throw restError(404); } } }).storage.readHead("k", 12)).resolves.toBeNull();
    await expect(harness({ blob: { downloadToBuffer: async () => { throw restError(416); } } }).storage.readHead("k", 12)).resolves.toEqual(Buffer.alloc(0));
    await expect(harness({ blob: { downloadToBuffer: async () => { throw restError(500); } } }).storage.readHead("k", 12)).rejects.toThrow(/500/);
  });
});

describe("AzureBlobStorage.listObjects / deleteObject", () => {
  it("lists blobs under a prefix with their creation time", async () => {
    const created = new Date("2026-09-20T00:00:00Z");
    const { storage } = harness({
      list: [
        { name: "kyc/r/a.jpg", properties: { createdOn: created, lastModified: new Date() } },
        { name: "dish/o/b.jpg", properties: { lastModified: created } },
      ],
    });
    const out = [];
    for await (const o of storage.listObjects("kyc/")) out.push(o);
    expect(out).toEqual([{ key: "kyc/r/a.jpg", createdAt: created }]);
  });

  it("deleteObject uses deleteIfExists and swallows storage errors (DS15-03 contract)", async () => {
    const deleted: string[] = [];
    const h = harness({ blob: { deleteIfExists: async () => { deleted.push("x"); return {}; } } });
    await h.storage.deleteObject("kyc/r/a.jpg");
    expect(deleted).toHaveLength(1);
    const failing = harness({ blob: { deleteIfExists: async () => { throw restError(500); } } });
    await expect(failing.storage.deleteObject("kyc/r/a.jpg")).resolves.toBeUndefined();
  });

  it("reports provider azure", () => {
    expect(harness().storage.provider()).toBe("azure");
  });
});
