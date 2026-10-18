// Shop front v1 · state model for apps/merchant/app/shop (design reference; adapt to the app's own types)
import type { MerchantProfileResponse } from "@lynia/shared";

/** One photo slot (banner 3:1 or logo 1:1) on the storefront card. */
export type PhotoSlot =
  | { kind: "empty" }
  | { kind: "photo"; url: string } // saved, or uploaded-but-unsaved (MJ-RM14 local preview)
  | { kind: "shrinking"; previewUrl: string }
  | { kind: "uploading"; previewUrl: string; progress: number | null } // 0–100, null = no progress events
  | { kind: "failed"; previewUrl?: string; reason: "prepare" | "upload"; retry: () => void }
  | { kind: "removed"; previousUrl: string }; // cleared until Save; Undo restores `previousUrl`

export type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string } // SF.loadFailT unless the API sends one
  | { status: "ready"; profile: MerchantProfileResponse };

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number } // shows the toast for 2.5 s
  | { status: "failed"; message: string }; // SF.saveFail unless the API sends one

/** The editable form. `dirty` = !equal(form, fromProfile(profile)) — computed, never stored. */
export interface ShopFrontForm {
  name: string; // trimmed on save, max 120, required
  description: string; // max 500
  tags: string[]; // max 3, each ≤ 24, unique (case-insensitive, trimmed)
  priceLevel: 1 | 2 | 3 | null; // tap selected again → null
  banner: PhotoSlot;
  logo: PhotoSlot;
}

export interface TagEntryUi {
  draft: string;
  /** Tag outlined for 2 s after a duplicate was ignored. */
  flash: string | null;
}

/** Save is enabled only when all of these hold. */
export const canSave = (f: ShopFrontForm, dirty: boolean, save: SaveState) =>
  dirty &&
  save.status !== "saving" &&
  f.name.trim().length > 0 &&
  !["shrinking", "uploading"].includes(f.banner.kind) &&
  !["shrinking", "uploading"].includes(f.logo.kind);

/** API change (additive): `null` clears a photo; omitting the key leaves it as is. */
export interface UpdateProfileBody {
  name: string;
  description: string;
  cuisineTags: string[];
  priceLevel?: 1 | 2 | 3 | null; // null = clear (NEW)
  coverPhotoUrl?: string | null; // null = remove (NEW)
  logoUrl?: string | null; // null = remove (NEW)
}
