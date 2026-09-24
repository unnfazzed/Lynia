import { Inject, Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { STORAGE, type StorageAdapter } from "./storage.interface";
import { UPLOAD_KINDS, type UploadKind } from "./upload-kinds";

/** Bytes 0–11 cover both signatures below (E8). */
export const MAGIC_HEAD_BYTES = 12;
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAGIC: Readonly<Record<string, Buffer>> = { "image/jpeg": JPEG_MAGIC, "image/png": PNG_MAGIC };

/** A storage round-trip slower than this is treated like a 5xx: retryable 503, attach not accepted. */
export const STORAGE_VERIFY_TIMEOUT_MS = 5_000;

export interface VerifiedUpload {
  size: number;
  contentType: string;
  etag: string | null;
}

class StorageTimeoutError extends Error {}

/**
 * Attach-time upload verification (C1 / E8) — the ONE check every attach path runs before it records
 * an object key on a row. An Azure SAS binds neither Content-Type nor size (unlike a GCS V4
 * signature), and the client sets Content-Type itself, so the only trustworthy answer is the stored
 * object. Matrix:
 *  - object missing (404)                         → 422 `upload_missing`
 *  - 0 bytes, or over the kind's cap              → delete, then 422
 *  - Content-Type not image/jpeg | image/png      → delete, then 422
 *  - magic bytes don't match the declared type    → delete, then 422
 *  - storage 5xx / network / timeout              → 503, retryable; nothing deleted, attach NOT accepted
 *
 * Callers MUST have checked the key sits under the caller's own namespace first: a rejection deletes
 * the object, so verifying a key the caller doesn't own would let them delete someone else's photo.
 */
@Injectable()
export class UploadVerifier {
  private readonly logger = new Logger(UploadVerifier.name);

  constructor(@Inject(STORAGE) private readonly storage: StorageAdapter) {}

  async verify(key: string, kind: UploadKind): Promise<VerifiedUpload> {
    const { maxBytes } = UPLOAD_KINDS[kind];
    const stat = await this.guarded("stat", key, () => this.storage.stat(key));
    if (!stat) throw missing();
    if (stat.size <= 0) return this.reject(key, "upload_empty", "That photo didn't upload — please retake it.");
    if (stat.size > maxBytes) {
      return this.reject(key, "upload_too_large", `That photo is too large (max ${Math.floor(maxBytes / 1024)} KB) — please retake it.`);
    }
    const contentType = (stat.contentType ?? "").split(";")[0]!.trim().toLowerCase();
    const magic = MAGIC[contentType];
    if (!magic) return this.reject(key, "upload_bad_type", "Photos must be JPEG or PNG — please retake it.");

    const head = await this.guarded("readHead", key, () => this.storage.readHead(key, MAGIC_HEAD_BYTES));
    if (!head) throw missing();
    if (head.length < magic.length || !head.subarray(0, magic.length).equals(magic)) {
      return this.reject(key, "upload_bad_content", "That file isn't a valid photo — please retake it.");
    }
    return { size: stat.size, contentType, etag: stat.etag };
  }

  /** Delete the rejected object (best-effort by the adapter's contract), then 422. */
  private async reject(key: string, reason: string, message: string): Promise<never> {
    this.logger.warn(`Upload ${key} rejected at attach: ${reason}`);
    await this.storage.deleteObject(key);
    throw new UnprocessableEntityException({ reason, message });
  }

  /** Any storage failure other than a clean 404 — or a slow call — is a retryable 503 (E8). */
  private async guarded<T>(op: string, key: string, call: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        call(),
        new Promise<never>((_, rejectTimeout) => {
          timer = setTimeout(() => rejectTimeout(new StorageTimeoutError(`timed out after ${STORAGE_VERIFY_TIMEOUT_MS}ms`)), STORAGE_VERIFY_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      this.logger.error(`Upload verification ${op}(${key}) failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException({ reason: "uploads_unavailable", message: "Couldn't check your photo — please try again." });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function missing(): UnprocessableEntityException {
  return new UnprocessableEntityException({ reason: "upload_missing", message: "We couldn't find that photo — please retake it." });
}
