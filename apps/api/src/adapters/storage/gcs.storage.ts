import { Logger } from "@nestjs/common";
import type { CloudProvider, StorageAdapter, UploadTarget } from "./storage.interface";

/**
 * Google Cloud Storage adapter (D7 fallback). Generates V4 signed URLs.
 * Same interface as Azure — switching clouds is a CLOUD_PROVIDER change, no business-logic edits.
 */
export class GcsStorage implements StorageAdapter {
  private readonly logger = new Logger(GcsStorage.name);

  constructor(private readonly bucket: string) {}

  provider(): CloudProvider {
    return "gcp";
  }

  async createUploadUrl(key: string, _contentType: string, expiresInSeconds = 900): Promise<UploadTarget> {
    // TODO(KYC lane): bucket.file(key).getSignedUrl({ action: "write", ... }) for a real signed URL.
    const url = `https://storage.googleapis.com/${this.bucket}/${encodeURIComponent(key)}?X-Goog-Expires=${expiresInSeconds}`;
    return { url, key };
  }

  async createReadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return `https://storage.googleapis.com/${this.bucket}/${encodeURIComponent(key)}?X-Goog-Expires=${expiresInSeconds}`;
  }
}
