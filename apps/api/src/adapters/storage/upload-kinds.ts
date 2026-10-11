import { posix } from "node:path";

/**
 * The one table of upload kinds (C1): the key prefix each mint route writes under and the per-kind
 * size cap. The mint side (uploads.controller.ts) binds the cap into the signed URL where the provider
 * can (GCS); the attach side (upload-verifier.ts) re-checks it against the stored object for every
 * provider, because an Azure SAS cannot bind a size. The orphan sweep (storage-sweeper.ts) walks the
 * same prefixes. Keeping all three on this table is what stops the cap and the prefix drifting apart.
 */

// Cap an uploaded photo at 8 MiB — well above a phone-camera JPEG/PNG, far below storage-abuse/DoS
// territory.
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
// D-32 "we compress on the merchant's behalf and say so": these are the target sizes named in the
// design contract. The client's own downscale step (apps/mobile/src/logic/image-downscale.ts) lands
// most photos in this range but never guarantees it, so the server enforces them.
export const MAX_DISH_PHOTO_BYTES = 300 * 1024;
export const MAX_BANNER_PHOTO_BYTES = 250 * 1024;

export type UploadKind = "kyc" | "pickup" | "delivery-proof" | "dish" | "banner" | "rx";

export interface UploadKindSpec {
  /** Top-level key prefix, including the trailing slash. Keys are `<prefix><ownerId>/<uuid>.<ext>`. */
  prefix: string;
  maxBytes: number;
}

export const UPLOAD_KINDS: Readonly<Record<UploadKind, UploadKindSpec>> = {
  kyc: { prefix: "kyc/", maxBytes: MAX_PHOTO_BYTES },
  pickup: { prefix: "pickup/", maxBytes: MAX_PHOTO_BYTES },
  "delivery-proof": { prefix: "delivery-proof/", maxBytes: MAX_PHOTO_BYTES },
  dish: { prefix: "dish/", maxBytes: MAX_DISH_PHOTO_BYTES },
  // The shop's cover banner AND its logo share this namespace (apps/merchant/app/lib/menu-api.ts).
  banner: { prefix: "banner/", maxBytes: MAX_BANNER_PHOTO_BYTES },
  // Order flow v2 (BRIEF §13): a customer's prescription page, `rx/<customerId>/…`. Read URLs are minted
  // only for the order's customer, its pharmacy and admin (PrescriptionService.photos).
  rx: { prefix: "rx/", maxBytes: MAX_PHOTO_BYTES },
};

/** The caller-owned namespace for a kind: `<prefix><ownerId>/`. */
export function ownNamespace(kind: UploadKind, ownerId: string): string {
  return `${UPLOAD_KINDS[kind].prefix}${ownerId}/`;
}

/**
 * D7 review (2026-10-07): a key that is safe to hand to a storage SDK. The Azure SDK normalises
 * `dish/me/../../kyc/victim/x.jpg` to `kyc/victim/x.jpg`, so a key that merely STARTS with the caller's
 * namespace could still address another user's object. Refused: a leading `/`, `..`, `//`, `\`, `%`,
 * control characters, and any key that path normalisation would change.
 */
export function isSafeObjectKey(key: string): boolean {
  if (!key || key.length > 512) return false;
  if (key.startsWith("/") || key.includes("..") || key.includes("//") || key.includes("\\") || key.includes("%")) return false;
  // oxlint-disable-next-line no-control-regex -- control characters are exactly what this refuses
  if (/[\u0000-\u001f\u007f]/.test(key)) return false;
  return posix.normalize(key) === key;
}

/** A key directly inside the caller's own namespace for `kind` (`<prefix><ownerId>/<one name>`), and safe. */
export function isOwnedUploadKey(kind: UploadKind, ownerId: string, key: string): boolean {
  const ns = ownNamespace(kind, ownerId);
  return isSafeObjectKey(key) && key.startsWith(ns) && key.length > ns.length && !key.slice(ns.length).includes("/");
}

/** The exact name `POST /uploads/*` mints (uploads.controller.ts): a lower-case `randomUUID()` + `.jpg|.png`. */
const MINTED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;

/** Exactly a key the API minted for this owner and kind: `<prefix><ownerId>/<uuid>.(jpg|png)`. */
export function isMintedUploadKey(kind: UploadKind, ownerId: string, key: string): boolean {
  return isOwnedUploadKey(kind, ownerId, key) && MINTED_NAME.test(key.slice(ownNamespace(kind, ownerId).length));
}

/** Throws unless {@link isSafeObjectKey}: the storage adapters' own guard, for every caller. */
export function assertSafeObjectKey(key: string): void {
  if (!isSafeObjectKey(key)) throw new UnsafeObjectKeyError(key);
}

export class UnsafeObjectKeyError extends Error {
  constructor(key: string) {
    super(`Refused an unsafe storage key: ${JSON.stringify(key.slice(0, 80))}`);
    this.name = "UnsafeObjectKeyError";
  }
}
