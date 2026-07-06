/**
 * Storage seam (D7). The adapter abstracts time-limited URL *generation* — signed-URL APIs and
 * semantics differ per provider, so the rest of the app only ever sees this interface.
 */
export type CloudProvider = "gcp";

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
