import { generateKeyPairSync } from "node:crypto";
import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AzureBlobStorage, type AzureBlobServiceClient } from "../adapters/storage/azure-blob.storage";
import { GcsStorage } from "../adapters/storage/gcs.storage";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import { UploadsController } from "./uploads.controller";

// A throwaway RSA key so the REAL GcsStorage signs fully offline — the header assertions below then
// prove what the adapter returns, not what a hand-written fake claims it returns.
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

/** Controller over the real GCS adapter, with a spy recording each createUploadUrl call. */
function gcsCtl() {
  const gcs = new GcsStorage("lynia-media", {
    projectId: "test-project",
    credentials: { client_email: "signer@test-project.iam.gserviceaccount.com", private_key: privateKey as string },
  });
  const spy = vi.spyOn(gcs, "createUploadUrl");
  return { c: new UploadsController(gcs), spy };
}

/** Controller over the real Azure adapter; only the SDK's network edge is faked. */
function azureCtl() {
  const now = Date.parse("2026-09-24T12:00:00Z");
  const service = {
    getUserDelegationKey: async (startsOn: Date, expiresOn: Date) => ({
      signedObjectId: "00000000-0000-0000-0000-000000000001",
      signedTenantId: "00000000-0000-0000-0000-000000000002",
      signedStartsOn: startsOn,
      signedExpiresOn: expiresOn,
      signedService: "b",
      signedVersion: "2025-01-05",
      value: Buffer.from("k".repeat(32)).toString("base64"),
    }),
    getContainerClient: (container: string) => ({
      getBlockBlobClient: (key: string) => ({ url: `https://lyniamedia.blob.core.windows.net/${container}/${key}` }),
    }),
  } as unknown as AzureBlobServiceClient;
  const azure = new AzureBlobStorage({ account: "lyniamedia", container: "media", serviceClient: service, now: () => now });
  const spy = vi.spyOn(azure, "createUploadUrl");
  return { c: new UploadsController(azure), spy };
}

describe("UploadsController.kycPhoto", () => {
  it("mints a signed PUT URL under the caller's namespace for a jpeg, bounding the size", async () => {
    const { c, spy } = gcsCtl();
    const res = await c.kycPhoto({ contentType: "image/jpeg" }, "user-1");
    expect(res.uploadUrl).toContain("storage.googleapis.com/lynia-media/");
    // Key is namespaced by the authenticated user, so one rider can't target another's path.
    expect(res.key).toMatch(/^kyc\/user-1\/[0-9a-f-]+\.jpg$/);
    const [key, contentType, , maxBytes] = spy.mock.calls[0]!;
    expect(key).toBe(res.key);
    expect(contentType).toBe("image/jpeg");
    // Minted with an 8 MiB cap; the client is told the exact headers to echo on the PUT.
    expect(maxBytes).toBe(8 * 1024 * 1024);
    expect(res.headers).toEqual({ "Content-Type": "image/jpeg", "X-Goog-Content-Length-Range": `0,${8 * 1024 * 1024}` });
  });

  it("uses a .png extension for image/png", async () => {
    const { c } = gcsCtl();
    const res = await c.kycPhoto({ contentType: "image/png" }, "u2");
    expect(res.key).toMatch(/^kyc\/u2\/[0-9a-f-]+\.png$/);
  });
});

describe("UploadsController.pickupPhoto", () => {
  it("mints a signed PUT URL under the caller's pickup namespace with the same size bound", async () => {
    const { c, spy } = gcsCtl();
    const res = await c.pickupPhoto({ contentType: "image/jpeg" }, "rider-1");
    // Namespaced by the authenticated user — the attach endpoint verifies this prefix, so one rider
    // can't persist a key that points into another user's objects.
    expect(res.key).toMatch(/^pickup\/rider-1\/[0-9a-f-]+\.jpg$/);
    const [key, contentType, , maxBytes] = spy.mock.calls[0]!;
    expect(key).toBe(res.key);
    expect(contentType).toBe("image/jpeg");
    // Same 8 MiB cap + signed-header contract as the KYC photo (one minting path for both).
    expect(maxBytes).toBe(8 * 1024 * 1024);
    expect(res.headers["Content-Type"]).toBe("image/jpeg");
    expect(res.headers["X-Goog-Content-Length-Range"]).toBe(`0,${8 * 1024 * 1024}`);
  });

  it("uses a .png extension for image/png", async () => {
    const { c } = gcsCtl();
    const res = await c.pickupPhoto({ contentType: "image/png" }, "u2");
    expect(res.key).toMatch(/^pickup\/u2\/[0-9a-f-]+\.png$/);
  });
});

describe("UploadsController.deliveryProof", () => {
  it("mints under the caller's delivery-proof namespace with the 8 MiB cap", async () => {
    const { c, spy } = gcsCtl();
    const res = await c.deliveryProof({ contentType: "image/jpeg" }, "rider-1");
    expect(res.key).toMatch(/^delivery-proof\/rider-1\/[0-9a-f-]+\.jpg$/);
    expect(spy.mock.calls[0]![3]).toBe(8 * 1024 * 1024);
  });
});

describe("UploadsController.dishPhoto", () => {
  it("mints a signed PUT URL under the caller's dish namespace with the D-32 300KB cap", async () => {
    const { c, spy } = gcsCtl();
    const res = await c.dishPhoto({ contentType: "image/jpeg" }, "merchant-owner-1");
    expect(res.key).toMatch(/^dish\/merchant-owner-1\/[0-9a-f-]+\.jpg$/);
    expect(spy.mock.calls[0]![3]).toBe(300 * 1024);
    expect(res.headers["X-Goog-Content-Length-Range"]).toBe(`0,${300 * 1024}`);
  });
});

describe("UploadsController.bannerPhoto", () => {
  it("mints a signed PUT URL under the caller's banner namespace with the D-32 250KB cap", async () => {
    const { c, spy } = gcsCtl();
    const res = await c.bannerPhoto({ contentType: "image/png" }, "merchant-owner-1");
    expect(res.key).toMatch(/^banner\/merchant-owner-1\/[0-9a-f-]+\.png$/);
    expect(spy.mock.calls[0]![3]).toBe(250 * 1024);
    expect(res.headers["X-Goog-Content-Length-Range"]).toBe(`0,${250 * 1024}`);
  });
});

describe("UploadsController on Azure (C1) — headers come from the adapter", () => {
  it("returns Content-Type + x-ms-blob-type and no X-Goog header", async () => {
    const { c } = azureCtl();
    const res = await c.kycPhoto({ contentType: "image/jpeg" }, "user-1");
    expect(res.key).toMatch(/^kyc\/user-1\/[0-9a-f-]+\.jpg$/);
    expect(res.uploadUrl.startsWith(`https://lyniamedia.blob.core.windows.net/media/${res.key}?`)).toBe(true);
    expect(res.headers).toEqual({ "Content-Type": "image/jpeg", "x-ms-blob-type": "BlockBlob" });
  });

  it("echoes the declared type for a png merchant photo (the cap is enforced at attach, not in the SAS)", async () => {
    const { c, spy } = azureCtl();
    const res = await c.bannerPhoto({ contentType: "image/png" }, "owner-1");
    expect(spy.mock.calls[0]![3]).toBe(250 * 1024);
    expect(res.headers).toEqual({ "Content-Type": "image/png", "x-ms-blob-type": "BlockBlob" });
    expect(new URL(res.uploadUrl).searchParams.get("sp")).toBe("cw");
  });
});

describe("UploadsController mint failure", () => {
  it("maps an adapter signing failure to a retryable 503 (E8), not a generic 500", async () => {
    const failing = { provider: () => "azure", createUploadUrl: async () => { throw new Error("delegation key 403"); } } as unknown as StorageAdapter;
    const c = new UploadsController(failing);
    const err = await c.kycPhoto({ contentType: "image/jpeg" }, "user-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getResponse()).toMatchObject({ reason: "uploads_unavailable" });
  });
});
