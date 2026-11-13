import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Logger } from "@nestjs/common";
import { assertSafeObjectKey, imageContentTypeFor, UPLOAD_KINDS } from "./upload-kinds";
import { ObjectTooLargeError, type CloudProvider, type ObjectStat, type StorageAdapter, type StoredObject, type UploadTarget } from "./storage.interface";

/** An upload URL lives 10 minutes, whatever the caller asks for (same as the Azure SAS, S4/E13). */
const UPLOAD_URL_MAX_SECONDS = 10 * 60;
/** A read URL over a KYC / national-ID image lives 5 minutes, generated per view (S4). */
const KYC_READ_URL_MAX_SECONDS = 5 * 60;
/** Same default read lifetime as the other adapters. */
const DEFAULT_READ_SECONDS = 15 * 60;
/** S3 SigV4 presigned URLs cannot outlive 7 days. */
const PRESIGN_MAX_SECONDS = 7 * 24 * 60 * 60;

/** The subset of the SDK the adapter touches — a seam so specs can drive it with no network. */
export type R2Client = Pick<S3Client, "send">;
export type Presigner = typeof getSignedUrl;

export interface R2StorageOptions {
  /** Cloudflare account id: the endpoint is `https://<accountId>.r2.cloudflarestorage.com`. */
  accountId: string;
  bucket: string;
  /** An R2 API token's S3 credentials (Object Read & Write on this bucket only). */
  accessKeyId: string;
  secretAccessKey: string;
  /** Test seams. */
  client?: R2Client;
  presign?: Presigner;
}

const statusOf = (err: unknown): number | undefined =>
  (err as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
const isNotFound = (err: unknown): boolean => {
  const name = (err as { name?: string } | null)?.name;
  return statusOf(err) === 404 || name === "NotFound" || name === "NoSuchKey";
};

/**
 * Cloudflare R2 adapter (docs/AZURE-EXIT.md). The client PUTs/GETs the object directly through an S3
 * SigV4 presigned URL signed with an R2 API token scoped to this one bucket.
 *
 * Like the Azure SAS, a presigned PUT binds the Content-Type but not the size, so size and type are
 * checked at attach time (upload-verifier.ts) and the orphan sweep bounds unattached uploads.
 *
 * Create-only, like Azure's `c` permission: the PUT is signed with `If-None-Match: *`, so once an object
 * exists at the key the same URL cannot replace the bytes attach verified. A retried PUT whose first
 * attempt landed answers 412 (Precondition Failed); the clients treat 409 and 412 alike as success (E13).
 */
export class R2Storage implements StorageAdapter {
  private readonly logger = new Logger(R2Storage.name);
  private readonly client: R2Client;
  private readonly presign: Presigner;

  constructor(private readonly opts: R2StorageOptions) {
    // No network at construction.
    this.client =
      opts.client ??
      new S3Client({
        region: "auto",
        endpoint: `https://${opts.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
        // Path-style (`<account>.r2.cloudflarestorage.com/<bucket>/<key>`): one hostname for the R2 CORS rule.
        forcePathStyle: true,
        // R2 rejects the SDK's default CRC32 checksum headers on presigned PUTs from browsers.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
    this.presign = opts.presign ?? getSignedUrl;
  }

  provider(): CloudProvider {
    return "cloudflare";
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = UPLOAD_URL_MAX_SECONDS,
    _maxBytes?: number,
  ): Promise<UploadTarget> {
    assertSafeObjectKey(key);
    const command = new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, ContentType: contentType, IfNoneMatch: "*" });
    const url = await this.presign(this.client as S3Client, command, {
      expiresIn: Math.min(expiresInSeconds, UPLOAD_URL_MAX_SECONDS),
      // Both headers are part of the signature: the client must send exactly these.
      signableHeaders: new Set(["content-type", "if-none-match"]),
    });
    return { url, key, headers: { "Content-Type": contentType, "If-None-Match": "*" } };
  }

  async createReadUrl(key: string, expiresInSeconds = DEFAULT_READ_SECONDS): Promise<string> {
    assertSafeObjectKey(key);
    const cap = key.startsWith(UPLOAD_KINDS.kyc.prefix) ? KYC_READ_URL_MAX_SECONDS : PRESIGN_MAX_SECONDS;
    // Every stored object is a JPEG/PNG photo (or its JPEG thumb): pin the response headers so the
    // origin always serves it as an inline image, whatever Content-Type the uploader set.
    const command = new GetObjectCommand({
      Bucket: this.opts.bucket,
      Key: key,
      ResponseContentType: imageContentTypeFor(key),
      ResponseContentDisposition: "inline",
    });
    return this.presign(this.client as S3Client, command, { expiresIn: Math.min(expiresInSeconds, cap) });
  }

  async stat(key: string): Promise<ObjectStat | null> {
    assertSafeObjectKey(key);
    try {
      const h = await this.client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return { size: h.ContentLength ?? 0, contentType: h.ContentType ?? null, etag: h.ETag ?? null };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async readHead(key: string, bytes: number): Promise<Buffer | null> {
    assertSafeObjectKey(key);
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.opts.bucket, Key: key, Range: `bytes=0-${Math.max(bytes - 1, 0)}` }),
      );
      return await bodyToBuffer(res.Body);
    } catch (err) {
      if (isNotFound(err)) return null;
      // A range on an empty object is a 416: it exists but has no magic bytes, so the verifier rejects it.
      if (statusOf(err) === 416) return Buffer.alloc(0);
      throw err;
    }
  }

  async readObject(key: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer | null> {
    assertSafeObjectKey(key);
    try {
      const h = await this.client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }), { abortSignal: signal });
      const size = h.ContentLength ?? 0;
      if (size > maxBytes) throw new ObjectTooLargeError(key, size, maxBytes);
      if (size === 0) return Buffer.alloc(0);
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }), { abortSignal: signal });
      return await bodyToBuffer(res.Body);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async writeObject(key: string, body: Buffer, contentType: string, signal?: AbortSignal): Promise<void> {
    assertSafeObjectKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: body, ContentType: contentType }), {
      abortSignal: signal,
    });
  }

  async *listObjects(prefix: string): AsyncIterable<StoredObject> {
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.opts.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of page.Contents ?? []) {
        if (o.Key && o.LastModified) yield { key: o.Key, createdAt: o.LastModified };
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }

  /** DS15-03 best-effort purge — same contract as the other adapters. R2 answers 204 for a missing key. */
  async deleteObject(key: string): Promise<void> {
    try {
      assertSafeObjectKey(key);
      await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`deleteObject(${key}) failed (swallowed): ${(err as Error).message}`);
    }
  }
}

/** The SDK's body is a Node stream with `transformToByteArray` (SDK v3 stream mixin). */
async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const b = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof b.transformToByteArray === "function") return Buffer.from(await b.transformToByteArray());
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  throw new Error("Unexpected R2 response body type");
}
