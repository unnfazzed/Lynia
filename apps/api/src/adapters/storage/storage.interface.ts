/**
 * Storage seam (D7). The adapter abstracts time-limited URL *generation* — signed-URL APIs and
 * semantics differ per provider, so the rest of the app only ever sees this interface.
 */
export type CloudProvider = "gcp" | "azure";

export interface UploadTarget {
  /** Pre-authorized URL the client PUTs the object to. */
  url: string;
  /** The object key/path to persist on the entity once uploaded. */
  key: string;
  /**
   * The exact headers the client must send on the PUT. Provider-owned (C1): GCS binds `Content-Type`
   * and `X-Goog-Content-Length-Range` into the V4 signature; Azure Blob needs `Content-Type` plus
   * `x-ms-blob-type: BlockBlob`. Clients echo whatever comes back, so they stay provider-agnostic.
   */
  headers: Record<string, string>;
}

/** What the store says about an uploaded object — read at attach time (C1 / E8). */
export interface ObjectStat {
  size: number;
  /** The Content-Type the object was stored with (client-set on the PUT, so it proves nothing alone). */
  contentType: string | null;
  etag: string | null;
}

/** One listed object, for the orphan sweep (E2). */
export interface StoredObject {
  key: string;
  /** When the object was written — the sweep's age clock. */
  createdAt: Date;
}

export interface StorageAdapter {
  provider(): CloudProvider;
  /** Time-limited upload URL (rider selfie/KYC, item photo). When `maxBytes` is set and the provider can
   *  bind it (GCS), the signed URL carries an upper size bound the client must echo and the store
   *  enforces. Providers that cannot bind it (Azure SAS) rely on the attach-time {@link stat} check. */
  createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds?: number,
    maxBytes?: number,
  ): Promise<UploadTarget>;
  /** Time-limited read URL. */
  createReadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  /**
   * Object metadata, or `null` when the object does not exist (404). Any other failure (5xx, auth,
   * network) THROWS — the caller must not mistake "couldn't ask" for "not there".
   */
  stat(key: string): Promise<ObjectStat | null>;
  /**
   * The first `bytes` bytes of the object (a range GET) for magic-byte sniffing, or `null` on 404.
   * Throws on any other failure, like {@link stat}.
   */
  readHead(key: string, bytes: number): Promise<Buffer | null>;
  /**
   * Every object under `prefix`, for the orphan sweep (E2). Pages lazily so a large bucket never
   * lands in memory at once.
   */
  listObjects(prefix: string): AsyncIterable<StoredObject>;
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
