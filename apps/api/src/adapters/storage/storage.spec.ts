import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Env } from "../../config/env";
import { GcsStorage } from "./gcs.storage";
import { selectStorage } from "./storage.module";

const base = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: "postgresql://localhost/lynia",
  CLOUD_PROVIDER: "azure",
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

describe("storage adapter selection (D7 portability)", () => {
  it("selects Azure Blob when CLOUD_PROVIDER=azure", () => {
    expect(selectStorage({ ...base, CLOUD_PROVIDER: "azure" }).provider()).toBe("azure");
  });

  it("selects GCS when CLOUD_PROVIDER=gcp — a config-only switch", () => {
    expect(selectStorage({ ...base, CLOUD_PROVIDER: "gcp" }).provider()).toBe("gcp");
  });

  it("Azure honours the upload-URL contract (stub — real SAS lands with the Azure portability run)", async () => {
    const azure = await selectStorage({ ...base, CLOUD_PROVIDER: "azure" }).createUploadUrl("k", "image/jpeg");
    expect(azure.key).toBe("k");
    expect(azure.url).toContain("blob.core.windows.net");
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

  it("createReadUrl returns a V4-signed GET URL", async () => {
    const url = await testGcs().createReadUrl("kyc/rider-1/selfie.jpg");
    expect(url).toContain("storage.googleapis.com/lynia-media/");
    expect(url).toContain("X-Goog-Signature=");
  });
});
