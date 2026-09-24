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

export type UploadKind = "kyc" | "pickup" | "delivery-proof" | "dish" | "banner";

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
};

/** The caller-owned namespace for a kind: `<prefix><ownerId>/`. */
export function ownNamespace(kind: UploadKind, ownerId: string): string {
  return `${UPLOAD_KINDS[kind].prefix}${ownerId}/`;
}
