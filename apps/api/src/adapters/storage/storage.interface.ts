/**
 * Storage seam (D7). The adapter abstracts time-limited URL *generation* — Azure Blob SAS vs
 * GCS signed URLs differ in API and semantics, so the rest of the app only ever sees this interface.
 */
export type CloudProvider = "azure" | "gcp";

export interface UploadTarget {
  /** Pre-authorized URL the client PUTs the object to. */
  url: string;
  /** The object key/path to persist on the entity once uploaded. */
  key: string;
}

export interface StorageAdapter {
  provider(): CloudProvider;
  /** Time-limited upload URL (rider selfie/KYC, item photo). */
  createUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<UploadTarget>;
  /** Time-limited read URL. */
  createReadUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export const STORAGE = Symbol("STORAGE_ADAPTER");
