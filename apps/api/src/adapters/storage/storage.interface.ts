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
  /** Time-limited upload URL (rider selfie/KYC, item photo). When `maxBytes` is set the signed URL
   *  binds an upper size bound the client must echo and the store enforces (no arbitrary-size uploads). */
  createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds?: number,
    maxBytes?: number,
  ): Promise<UploadTarget>;
  /** Time-limited read URL. */
  createReadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  /**
   * Hard-delete the underlying object (DS15-03). Used by right-to-erasure to purge the KYC selfie /
   * ID-document (and profile photo) from the bucket after the DB pointers are nulled — the signed-URL
   * seam above only ever *references* objects, so without this the media outlived the erasure forever.
   * Best-effort by contract: a missing object (already deleted / never uploaded) is a success, and a
   * transient storage error must NOT hard-fail the erasure it runs behind.
   */
  deleteObject(key: string): Promise<void>;
}

export const STORAGE = Symbol("STORAGE_ADAPTER");
