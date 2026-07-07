import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import { UploadsController } from "./uploads.controller";

function ctl(createUploadUrl: StorageAdapter["createUploadUrl"]) {
  return new UploadsController({ createUploadUrl } as unknown as StorageAdapter);
}

describe("UploadsController.kycPhoto", () => {
  it("mints a signed PUT URL under the caller's namespace for a jpeg, bounding the size", async () => {
    let receivedKey: string | undefined;
    let receivedType: string | undefined;
    let receivedMax: number | undefined;
    const c = ctl(async (key, contentType, _expires, maxBytes) => {
      receivedKey = key;
      receivedType = contentType;
      receivedMax = maxBytes;
      return { url: "https://signed.example/put", key };
    });
    const res = await c.kycPhoto({ contentType: "image/jpeg" }, "user-1");
    expect(res.uploadUrl).toBe("https://signed.example/put");
    // Key is namespaced by the authenticated user, so one rider can't target another's path.
    expect(res.key).toMatch(/^kyc\/user-1\/[0-9a-f-]+\.jpg$/);
    expect(receivedKey).toBe(res.key);
    expect(receivedType).toBe("image/jpeg");
    // Minted with an 8 MiB cap; the client is told the exact headers to echo on the PUT.
    expect(receivedMax).toBe(8 * 1024 * 1024);
    expect(res.headers["Content-Type"]).toBe("image/jpeg");
    expect(res.headers["X-Goog-Content-Length-Range"]).toBe(`0,${8 * 1024 * 1024}`);
  });

  it("uses a .png extension for image/png", async () => {
    const c = ctl(async (key) => ({ url: "u", key }));
    const res = await c.kycPhoto({ contentType: "image/png" }, "u2");
    expect(res.key).toMatch(/^kyc\/u2\/[0-9a-f-]+\.png$/);
  });
});
