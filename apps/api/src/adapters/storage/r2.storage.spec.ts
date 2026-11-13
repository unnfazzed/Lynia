import { describe, expect, it, vi } from "vitest";
import { R2Storage, type R2Client } from "./r2.storage";
import { ObjectTooLargeError } from "./storage.interface";

const ACCOUNT = "0123456789abcdef0123456789abcdef";

/** The SDK's error shape: `name` + `$metadata.httpStatusCode`. */
const s3Error = (status: number, name = "Error") => Object.assign(new Error(`status ${status}`), { name, $metadata: { httpStatusCode: status } });

type Cmd = { constructor: { name: string }; input: Record<string, unknown> };

/**
 * Fakes only the network edge (`send`). Presigning runs through the REAL @aws-sdk/s3-request-presigner
 * against a real S3Client (it signs locally, no network), so the URL assertions are what R2 would get.
 */
function harness(reply: (cmd: Cmd) => unknown = () => ({})) {
  const sent: Cmd[] = [];
  const client: R2Client = {
    send: vi.fn(async (cmd: unknown) => {
      sent.push(cmd as Cmd);
      const r = reply(cmd as Cmd);
      if (r instanceof Error) throw r;
      return r;
    }) as unknown as R2Client["send"],
  };
  const presigning = new R2Storage({ accountId: ACCOUNT, bucket: "lynia-media", accessKeyId: "AKID", secretAccessKey: "SECRET" });
  const storage = new R2Storage({ accountId: ACCOUNT, bucket: "lynia-media", accessKeyId: "AKID", secretAccessKey: "SECRET", client });
  return { storage, presigning, sent };
}

const q = (url: string) => new URL(url).searchParams;

describe("R2Storage presigned URLs", () => {
  it("upload: a PUT URL on the bucket's endpoint, create-only, Content-Type + If-None-Match signed, ≤ 10 min", async () => {
    const { presigning } = harness();
    const target = await presigning.createUploadUrl("kyc/rider-1/a.jpg", "image/jpeg", 3600, 8 * 1024 * 1024);
    expect(target.key).toBe("kyc/rider-1/a.jpg");
    const u = new URL(target.url);
    expect(u.origin).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com`);
    expect(u.pathname).toBe("/lynia-media/kyc/rider-1/a.jpg");
    expect(q(target.url).get("X-Amz-Expires")).toBe("600");
    const signed = (q(target.url).get("X-Amz-SignedHeaders") ?? "").split(";");
    expect(signed).toEqual(expect.arrayContaining(["content-type", "host", "if-none-match"]));
    // The client must echo exactly the signed headers.
    expect(target.headers).toEqual({ "Content-Type": "image/jpeg", "If-None-Match": "*" });
    // No secret ever lands in the URL.
    expect(target.url).not.toContain("SECRET");
  });

  it("read: GET URL pins an inline image response; a KYC read is capped at 5 min", async () => {
    const { presigning } = harness();
    const kyc = await presigning.createReadUrl("kyc/rider-1/a.jpg", 3600);
    expect(q(kyc).get("X-Amz-Expires")).toBe("300");
    expect(q(kyc).get("response-content-disposition")).toBe("inline");
    expect(q(kyc).get("response-content-type")).toBe("image/jpeg");
    const dish = await presigning.createReadUrl("dish/m-1/b.png", 24 * 3600);
    expect(q(dish).get("X-Amz-Expires")).toBe(String(24 * 3600));
    expect(q(dish).get("response-content-type")).toBe("image/png");
  });

  it("read: never asks for more than S3's 7-day presign ceiling", async () => {
    const { presigning } = harness();
    const url = await presigning.createReadUrl("dish/m-1/b.jpg", 30 * 24 * 3600);
    expect(q(url).get("X-Amz-Expires")).toBe(String(7 * 24 * 3600));
  });

  it("refuses an unsafe key before signing", async () => {
    const { presigning } = harness();
    await expect(presigning.createUploadUrl("dish/me/../../kyc/x.jpg", "image/jpeg")).rejects.toThrow();
    await expect(presigning.createReadUrl("../kyc/x.jpg")).rejects.toThrow();
  });
});

describe("R2Storage object calls", () => {
  it("stat maps HeadObject, and 404 → null", async () => {
    const { storage } = harness(() => ({ ContentLength: 12, ContentType: "image/jpeg", ETag: '"e"' }));
    expect(await storage.stat("dish/m/a.jpg")).toEqual({ size: 12, contentType: "image/jpeg", etag: '"e"' });
    const missing = harness(() => s3Error(404, "NotFound"));
    expect(await missing.storage.stat("dish/m/a.jpg")).toBeNull();
  });

  it("stat throws on anything but 404, so 'could not ask' is never 'not there'", async () => {
    const { storage } = harness(() => s3Error(503));
    await expect(storage.stat("dish/m/a.jpg")).rejects.toThrow("503");
  });

  it("readHead asks for a byte range; 416 is an empty object, 404 is null", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    const { storage, sent } = harness(() => ({ Body: { transformToByteArray: async () => bytes } }));
    expect(await storage.readHead("dish/m/a.jpg", 12)).toEqual(Buffer.from(bytes));
    expect(sent[0].input.Range).toBe("bytes=0-11");
    expect(await harness(() => s3Error(416)).storage.readHead("dish/m/a.jpg", 12)).toEqual(Buffer.alloc(0));
    expect(await harness(() => s3Error(404, "NoSuchKey")).storage.readHead("dish/m/a.jpg", 12)).toBeNull();
  });

  it("readObject checks the size before downloading", async () => {
    const { storage, sent } = harness(() => ({ ContentLength: 10_000 }));
    await expect(storage.readObject("dish/m/a.jpg", 100)).rejects.toBeInstanceOf(ObjectTooLargeError);
    expect(sent.map((c) => c.constructor.name)).toEqual(["HeadObjectCommand"]);
  });

  it("listObjects pages through continuation tokens", async () => {
    const pages = [
      { Contents: [{ Key: "dish/a.jpg", LastModified: new Date(1) }], IsTruncated: true, NextContinuationToken: "t2" },
      { Contents: [{ Key: "dish/b.jpg", LastModified: new Date(2) }], IsTruncated: false },
    ];
    let i = 0;
    const { storage, sent } = harness(() => pages[i++]);
    const keys: string[] = [];
    for await (const o of storage.listObjects("dish/")) keys.push(o.key);
    expect(keys).toEqual(["dish/a.jpg", "dish/b.jpg"]);
    expect(sent[1].input.ContinuationToken).toBe("t2");
    expect(sent[0].input.Prefix).toBe("dish/");
  });

  it("deleteObject swallows failures (best-effort erasure contract)", async () => {
    const { storage } = harness(() => s3Error(500));
    await expect(storage.deleteObject("kyc/r/a.jpg")).resolves.toBeUndefined();
  });

  it("provider() is cloudflare", () => {
    expect(harness().storage.provider()).toBe("cloudflare");
  });
});
