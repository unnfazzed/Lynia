import { ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ObjectStat, StorageAdapter } from "./storage.interface";
import { MAX_BANNER_PHOTO_BYTES, MAX_DISH_PHOTO_BYTES, MAX_PHOTO_BYTES } from "./upload-kinds";
import { MAGIC_HEAD_BYTES, STORAGE_VERIFY_TIMEOUT_MS, UploadVerifier } from "./upload-verifier";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const HTML = Buffer.from("<html><scri", "utf8");

function fake(stat: () => Promise<ObjectStat | null>, head: () => Promise<Buffer | null> = async () => JPEG) {
  const deleted: string[] = [];
  const headCalls: Array<[string, number]> = [];
  const storage = {
    stat: vi.fn(async () => stat()),
    readHead: vi.fn(async (key: string, bytes: number) => {
      headCalls.push([key, bytes]);
      return head();
    }),
    deleteObject: vi.fn(async (key: string) => {
      deleted.push(key);
    }),
  } as unknown as StorageAdapter;
  return { verifier: new UploadVerifier(storage), deleted, headCalls, storage };
}

const ok = (over: Partial<ObjectStat> = {}): ObjectStat => ({ size: 50_000, contentType: "image/jpeg", etag: '"e1"', ...over });

async function rejection(p: Promise<unknown>): Promise<{ status: number; reason: string }> {
  const err = await p.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: unknown) => e,
  );
  const ex = err as UnprocessableEntityException | ServiceUnavailableException;
  return { status: ex.getStatus(), reason: (ex.getResponse() as { reason: string }).reason };
}

const KEY = "kyc/rider-1/a.jpg";

describe("UploadVerifier — the attach-time stat matrix (C1 / E8)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a real JPEG within the cap and returns size + etag for the row", async () => {
    const { verifier, deleted, headCalls } = fake(async () => ok());
    await expect(verifier.verify(KEY, "kyc")).resolves.toEqual({ size: 50_000, contentType: "image/jpeg", etag: '"e1"' });
    expect(headCalls).toEqual([[KEY, MAGIC_HEAD_BYTES]]); // one 12-byte range GET
    expect(deleted).toEqual([]);
  });

  it("accepts a real PNG (content-type parameters and case are tolerated)", async () => {
    const { verifier } = fake(async () => ok({ contentType: "Image/PNG; charset=binary" }), async () => PNG);
    await expect(verifier.verify(KEY, "kyc")).resolves.toMatchObject({ contentType: "image/png" });
  });

  it("404 → 422 upload_missing, nothing deleted", async () => {
    const { verifier, deleted } = fake(async () => null);
    await expect(rejection(verifier.verify(KEY, "kyc"))).resolves.toEqual({ status: 422, reason: "upload_missing" });
    expect(deleted).toEqual([]);
  });

  it("0 bytes → delete, then 422", async () => {
    const { verifier, deleted } = fake(async () => ok({ size: 0 }));
    await expect(rejection(verifier.verify(KEY, "kyc"))).resolves.toEqual({ status: 422, reason: "upload_empty" });
    expect(deleted).toEqual([KEY]);
  });

  it.each([
    ["kyc", MAX_PHOTO_BYTES],
    ["pickup", MAX_PHOTO_BYTES],
    ["delivery-proof", MAX_PHOTO_BYTES],
    ["dish", MAX_DISH_PHOTO_BYTES],
    ["banner", MAX_BANNER_PHOTO_BYTES],
  ] as const)("%s: exactly the cap passes, one byte over → delete, then 422", async (kind, cap) => {
    await expect(fake(async () => ok({ size: cap })).verifier.verify(KEY, kind)).resolves.toBeTruthy();
    const over = fake(async () => ok({ size: cap + 1 }));
    await expect(rejection(over.verifier.verify(KEY, kind))).resolves.toEqual({ status: 422, reason: "upload_too_large" });
    expect(over.deleted).toEqual([KEY]);
  });

  it.each(["text/html", "image/gif", "application/octet-stream", null])("Content-Type %s → delete, then 422", async (contentType) => {
    const { verifier, deleted, storage } = fake(async () => ok({ contentType }));
    await expect(rejection(verifier.verify(KEY, "kyc"))).resolves.toEqual({ status: 422, reason: "upload_bad_type" });
    expect(deleted).toEqual([KEY]);
    expect(storage.readHead).not.toHaveBeenCalled();
  });

  it("magic bytes that don't match the declared type → delete, then 422 (HTML posing as image/png, S8)", async () => {
    const html = fake(async () => ok({ contentType: "image/png" }), async () => HTML);
    await expect(rejection(html.verifier.verify(KEY, "kyc"))).resolves.toEqual({ status: 422, reason: "upload_bad_content" });
    expect(html.deleted).toEqual([KEY]);
    // A real JPEG declared as PNG is a mismatch too — the declared type must be the real one.
    const swapped = fake(async () => ok({ contentType: "image/png" }), async () => JPEG);
    await expect(rejection(swapped.verifier.verify(KEY, "kyc"))).resolves.toEqual({ status: 422, reason: "upload_bad_content" });
    // A blob shorter than the signature is rejected, not accepted.
    const tiny = fake(async () => ok({ size: 2 }), async () => Buffer.from([0xff, 0xd8]));
    await expect(rejection(tiny.verifier.verify(KEY, "kyc"))).resolves.toEqual({ status: 422, reason: "upload_bad_content" });
  });

  it("an object gone between stat and the range GET → 422 upload_missing", async () => {
    const { verifier } = fake(async () => ok(), async () => null);
    await expect(rejection(verifier.verify(KEY, "kyc"))).resolves.toEqual({ status: 422, reason: "upload_missing" });
  });

  it("storage 5xx on stat → 503, retryable; nothing deleted", async () => {
    const { verifier, deleted } = fake(async () => {
      throw Object.assign(new Error("InternalError"), { statusCode: 500 });
    });
    await expect(rejection(verifier.verify(KEY, "kyc"))).resolves.toEqual({ status: 503, reason: "uploads_unavailable" });
    expect(deleted).toEqual([]);
  });

  it("storage 5xx on the range GET → 503; nothing deleted", async () => {
    const { verifier, deleted } = fake(async () => ok(), async () => {
      throw Object.assign(new Error("ServerBusy"), { statusCode: 503 });
    });
    await expect(rejection(verifier.verify(KEY, "kyc"))).resolves.toEqual({ status: 503, reason: "uploads_unavailable" });
    expect(deleted).toEqual([]);
  });

  it("a storage call that hangs past the timeout → 503", async () => {
    vi.useFakeTimers();
    const { verifier, deleted } = fake(() => new Promise<ObjectStat | null>(() => {}));
    const outcome = rejection(verifier.verify(KEY, "kyc"));
    await vi.advanceTimersByTimeAsync(STORAGE_VERIFY_TIMEOUT_MS + 1);
    await expect(outcome).resolves.toEqual({ status: 503, reason: "uploads_unavailable" });
    expect(deleted).toEqual([]);
  });
});
