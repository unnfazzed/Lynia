import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Env } from "../../config/env";
import { AzureBlobStorage } from "./azure-blob.storage";
import { GcsStorage } from "./gcs.storage";
import { selectStorage } from "./storage.module";

const base = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: "postgresql://localhost/lynia",
  CLOUD_PROVIDER: "gcp",
  STORAGE_BUCKET: "lynia-media",
  OTEL_SERVICE_NAME: "lynia-api",
} as Env;

// A throwaway RSA key so V4 signing runs fully offline (no ADC / network). Generated per-run, so
// nothing secret is committed; we only assert the signed-URL *shape*, never the signature value.
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const testGcs = () =>
  new GcsStorage("lynia-media", {
    projectId: "test-project",
    credentials: { client_email: "signer@test-project.iam.gserviceaccount.com", private_key: privateKey as string },
  });

describe("storage adapter selection (D7 seam)", () => {
  it("binds GCS behind the StorageAdapter interface", () => {
    expect(selectStorage(base).provider()).toBe("gcp");
  });
});

describe("GcsStorage — real V4 signing", () => {
  it("createUploadUrl returns a V4-signed PUT URL for the key", async () => {
    const target = await testGcs().createUploadUrl("kyc/rider-1/selfie.jpg", "image/jpeg", 600);
    expect(target.key).toBe("kyc/rider-1/selfie.jpg");
    expect(target.url).toContain("storage.googleapis.com/lynia-media/");
    expect(target.url).toContain("X-Goog-Algorithm=GOOG4-RSA-SHA256");
    expect(target.url).toContain("X-Goog-Signature=");
    expect(target.url).toContain("X-Goog-Expires=600");
  });

  it("createUploadUrl binds a content-length range into the signature when maxBytes is given", async () => {
    const target = await testGcs().createUploadUrl("kyc/rider-1/selfie.jpg", "image/jpeg", 600, 8 * 1024 * 1024);
    // The size-range extension header is part of the V4 signed-headers set, so the client must echo it
    // and GCS enforces the bound — its presence in X-Goog-SignedHeaders proves it was signed.
    expect(decodeURIComponent(target.url)).toContain("x-goog-content-length-range");
  });

  it("createReadUrl returns a V4-signed GET URL", async () => {
    const url = await testGcs().createReadUrl("kyc/rider-1/selfie.jpg");
    expect(url).toContain("storage.googleapis.com/lynia-media/");
    expect(url).toContain("X-Goog-Signature=");
  });
});

describe("GcsStorage.deleteObject (DS15-03 right-to-erasure purge)", () => {
  // Swap the lazily-constructed GCS client for an offline fake so we assert the delete call shape
  // without any network — the real signing tests above already cover the SDK wiring.
  const withFakeStorage = (gcs: GcsStorage, fake: unknown) => {
    (gcs as unknown as { storage: unknown }).storage = fake;
    return gcs;
  };

  it("deletes the object with ignoreNotFound (a missing object is a success, not a failure)", async () => {
    const calls: Array<{ bucket: string; key: string; opts: unknown }> = [];
    const gcs = withFakeStorage(testGcs(), {
      bucket: (bucket: string) => ({
        file: (key: string) => ({
          delete: async (opts: unknown) => {
            calls.push({ bucket, key, opts });
          },
        }),
      }),
    });
    await gcs.deleteObject("kyc/rider-1/selfie.jpg");
    expect(calls).toEqual([{ bucket: "lynia-media", key: "kyc/rider-1/selfie.jpg", opts: { ignoreNotFound: true } }]);
  });

  it("swallows a storage error so an erasure never hard-fails on a bucket hiccup", async () => {
    const gcs = withFakeStorage(testGcs(), {
      bucket: () => ({ file: () => ({ delete: async () => { throw new Error("GCS unavailable"); } }) }),
    });
    await expect(gcs.deleteObject("kyc/rider-1/selfie.jpg")).resolves.toBeUndefined();
  });
});

describe("storage adapter selection on CLOUD_PROVIDER (C1)", () => {
  it("binds Azure Blob when CLOUD_PROVIDER=azure (no network at construction)", () => {
    const env = { ...base, CLOUD_PROVIDER: "azure", AZURE_STORAGE_ACCOUNT: "lyniamedia", AZURE_STORAGE_CONTAINER: "media", AZURE_CLIENT_ID: "mi-client" } as Env;
    const adapter = selectStorage(env);
    expect(adapter).toBeInstanceOf(AzureBlobStorage);
    expect(adapter.provider()).toBe("azure");
  });

  it("still binds GCS for CLOUD_PROVIDER=gcp", () => {
    expect(selectStorage(base)).toBeInstanceOf(GcsStorage);
  });

  it("refuses an azure Env that skipped the boot-guard (no silent half-config)", () => {
    expect(() => selectStorage({ ...base, CLOUD_PROVIDER: "azure" } as Env)).toThrow(/AZURE_STORAGE_ACCOUNT/);
  });
});

describe("GcsStorage upload headers (C1: the adapter owns them)", () => {
  it("returns Content-Type + the signed X-Goog-Content-Length-Range when maxBytes is given", async () => {
    const target = await testGcs().createUploadUrl("kyc/rider-1/selfie.jpg", "image/jpeg", 600, 8 * 1024 * 1024);
    expect(target.headers).toEqual({ "Content-Type": "image/jpeg", "X-Goog-Content-Length-Range": `0,${8 * 1024 * 1024}` });
  });

  it("returns only Content-Type when no size bound is signed", async () => {
    const target = await testGcs().createUploadUrl("kyc/rider-1/selfie.jpg", "image/png", 600);
    expect(target.headers).toEqual({ "Content-Type": "image/png" });
  });
});

describe("GcsStorage.stat / readHead / listObjects (E8 / E2)", () => {
  const withFake = (fake: unknown) => {
    const gcs = testGcs();
    (gcs as unknown as { storage: unknown }).storage = fake;
    return gcs;
  };
  const gcsError = (code: number) => Object.assign(new Error(`gcs ${code}`), { code });
  const fileFake = (file: Record<string, unknown>) => withFake({ bucket: () => ({ file: () => file }) });

  it("stat maps object metadata (size arrives as a string)", async () => {
    const gcs = fileFake({ getMetadata: async () => [{ size: "2048", contentType: "image/png", etag: "CKih" }] });
    await expect(gcs.stat("kyc/r/a.png")).resolves.toEqual({ size: 2048, contentType: "image/png", etag: "CKih" });
  });

  it("stat → null on 404, throws on 5xx", async () => {
    await expect(fileFake({ getMetadata: async () => { throw gcsError(404); } }).stat("k")).resolves.toBeNull();
    await expect(fileFake({ getMetadata: async () => { throw gcsError(503); } }).stat("k")).rejects.toThrow(/503/);
  });

  it("readHead downloads the inclusive byte range [0, n-1]; 404 → null; 5xx throws", async () => {
    const ranges: unknown[] = [];
    const gcs = fileFake({ download: async (opts: unknown) => { ranges.push(opts); return [Buffer.from([0x89, 0x50])]; } });
    await expect(gcs.readHead("k", 12)).resolves.toEqual(Buffer.from([0x89, 0x50]));
    expect(ranges).toEqual([{ start: 0, end: 11 }]);
    await expect(fileFake({ download: async () => { throw gcsError(404); } }).readHead("k", 12)).resolves.toBeNull();
    await expect(fileFake({ download: async () => { throw gcsError(500); } }).readHead("k", 12)).rejects.toThrow(/500/);
  });

  it("listObjects pages through getFiles with the prefix", async () => {
    const calls: Array<{ prefix: string; pageToken?: string }> = [];
    const pages = [
      [[{ name: "dish/o/a.jpg", metadata: { timeCreated: "2026-09-01T00:00:00Z" } }], { pageToken: "p2" }],
      [[{ name: "dish/o/b.jpg", metadata: { timeCreated: "2026-09-02T00:00:00Z" } }], null],
    ];
    const gcs = withFake({
      bucket: () => ({
        getFiles: async (q: { prefix: string; pageToken?: string }) => {
          calls.push(q);
          return pages[calls.length - 1];
        },
      }),
    });
    const out = [];
    for await (const o of gcs.listObjects("dish/")) out.push(o);
    expect(out).toEqual([
      { key: "dish/o/a.jpg", createdAt: new Date("2026-09-01T00:00:00Z") },
      { key: "dish/o/b.jpg", createdAt: new Date("2026-09-02T00:00:00Z") },
    ]);
    expect(calls.map((c) => [c.prefix, c.pageToken])).toEqual([["dish/", undefined], ["dish/", "p2"]]);
  });
});
