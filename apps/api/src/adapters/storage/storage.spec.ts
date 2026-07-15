import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Env } from "../../config/env";
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
