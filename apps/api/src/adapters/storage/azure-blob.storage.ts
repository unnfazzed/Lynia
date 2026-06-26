import { Logger } from "@nestjs/common";
import type { CloudProvider, StorageAdapter, UploadTarget } from "./storage.interface";

/**
 * Azure Blob Storage adapter (primary). Generates SAS-token URLs.
 * Lane A wires the shape and the URL contract; the @azure/storage-blob SAS signing call lands
 * with the first real upload (KYC/photo lane). The interface is what keeps D7 portable.
 */
export class AzureBlobStorage implements StorageAdapter {
  private readonly logger = new Logger(AzureBlobStorage.name);

  constructor(private readonly bucket: string) {}

  provider(): CloudProvider {
    return "azure";
  }

  async createUploadUrl(key: string, _contentType: string, expiresInSeconds = 900): Promise<UploadTarget> {
    // TODO(KYC lane): generateBlobSASQueryParameters(...) for a real SAS.
    const url = `https://${this.bucket}.blob.core.windows.net/${encodeURIComponent(key)}?sv=PLACEHOLDER&se=${expiresInSeconds}`;
    return { url, key };
  }

  async createReadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return `https://${this.bucket}.blob.core.windows.net/${encodeURIComponent(key)}?sv=PLACEHOLDER&se=${expiresInSeconds}`;
  }
}
