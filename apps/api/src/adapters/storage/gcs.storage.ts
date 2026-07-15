import { Storage } from "@google-cloud/storage";
import { Logger } from "@nestjs/common";
import type { CloudProvider, StorageAdapter, UploadTarget } from "./storage.interface";

export interface GcsStorageOptions {
  projectId?: string;
  /**
   * Explicit signing credentials. **Omit on Cloud Run** — Application Default Credentials use the
   * attached service account and IAM `signBlob` to sign (needs the Service Account Token Creator
   * role). Pass them only for local/offline signing (e.g. tests).
   */
  credentials?: { client_email: string; private_key: string };
}

/**
 * Google Cloud Storage adapter (primary — GCP is the chosen cloud). Generates V4 signed URLs so the
 * client PUTs/GETs the object directly and the API never proxies bytes. Everything behind the seam —
 * switching clouds is a `CLOUD_PROVIDER` change, no business-logic edits (D7).
 */
export class GcsStorage implements StorageAdapter {
  private readonly logger = new Logger(GcsStorage.name);
  private readonly storage: Storage;

  constructor(
    private readonly bucket: string,
    opts: GcsStorageOptions = {},
  ) {
    // No network at construction — credentials are resolved lazily on the first signing call.
    this.storage = new Storage({ projectId: opts.projectId, credentials: opts.credentials });
  }

  provider(): CloudProvider {
    return "gcp";
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 900,
    maxBytes?: number,
  ): Promise<UploadTarget> {
    const [url] = await this.storage
      .bucket(this.bucket)
      .file(key)
      .getSignedUrl({
        version: "v4",
        action: "write",
        // The client MUST send this exact Content-Type on the PUT, or the signature won't match.
        contentType,
        expires: Date.now() + expiresInSeconds * 1000,
        // Bind an upper size bound into the signature: the client echoes this exact
        // `X-Goog-Content-Length-Range` header on the PUT and GCS rejects any object outside [0,
        // maxBytes], so a signed photo URL can't be reused to store an arbitrary multi-GB object.
        ...(maxBytes != null ? { extensionHeaders: { "x-goog-content-length-range": `0,${maxBytes}` } } : {}),
      });
    return { url, key };
  }

  async createReadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const [url] = await this.storage
      .bucket(this.bucket)
      .file(key)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + expiresInSeconds * 1000,
      });
    return url;
  }

  /**
   * DS15-03: purge the object from the bucket (right-to-erasure). Best-effort by contract — an object
   * that's already gone (404 / never uploaded) is a success, and any other storage hiccup is logged and
   * swallowed so a bucket blip can't hard-fail the erasure that runs this post-commit. `ignoreNotFound`
   * makes GCS return quietly instead of throwing on a missing object.
   */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.storage.bucket(this.bucket).file(key).delete({ ignoreNotFound: true });
    } catch (err) {
      this.logger.warn(`deleteObject(${key}) failed (swallowed): ${(err as Error).message}`);
    }
  }
}
