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
 * client PUTs/GETs the object directly and the API never proxies bytes. Same interface as Azure Blob —
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

  async createUploadUrl(key: string, contentType: string, expiresInSeconds = 900): Promise<UploadTarget> {
    const [url] = await this.storage
      .bucket(this.bucket)
      .file(key)
      .getSignedUrl({
        version: "v4",
        action: "write",
        // The client MUST send this exact Content-Type on the PUT, or the signature won't match.
        contentType,
        expires: Date.now() + expiresInSeconds * 1000,
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
}
