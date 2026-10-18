"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compressImage, MAX_DIMENSION_BY_KIND, type CropRect } from "../../lib/image-compress";
import { mintBannerPhotoUpload, uploadPhotoBlob } from "../../lib/menu-api";

// D-32's own budget for the shop's cover banner/logo (mirrors MAX_BANNER_PHOTO_BYTES in
// apps/api/src/uploads/uploads.controller.ts).
const MAX_BANNER_PHOTO_BYTES = 250 * 1024;

export type ShopPhotoKind = "banner" | "logo";

/** Where a framed photo sits inside the card while it is still being shrunk or uploaded. */
export interface PhotoPreview {
  url: string;
  crop?: CropRect;
  natural?: { width: number; height: number };
}

export type ShopPhotoState =
  | { kind: "idle" }
  | { kind: "cropping"; file: File }
  | { kind: "shrinking"; preview: PhotoPreview }
  | { kind: "uploading"; preview: PhotoPreview; progress: number | null }
  | { kind: "failed"; reason: "prepare" | "upload"; preview: PhotoPreview };

/**
 * Shop front v1 (D-115) "Photos": a framed photo shows in the storefront card straight away, under a scrim,
 * while it is shrunk and then uploaded (XHR, so the strip can show progress). A failure keeps what it needs to
 * go again: the file and its framing and, once shrunk, the bytes, so Retry only re-mints and re-PUTs (MJ-RL21).
 * `onUploaded` hands the page the storage key to save and a local preview of it.
 */
export function useShopPhoto(kind: ShopPhotoKind, onUploaded: (key: string, previewUrl: string) => void) {
  const [state, setState] = useState<ShopPhotoState>({ kind: "idle" });
  const retryRef = useRef<{ file: File; crop?: CropRect; natural?: { width: number; height: number }; blob?: Blob } | null>(null);
  const urls = useRef<string[]>([]);
  const alive = useRef(true);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  useEffect(() => {
    alive.current = true;
    const owned = urls.current;
    return () => {
      alive.current = false;
      for (const url of owned) URL.revokeObjectURL(url);
    };
  }, []);

  const objectUrl = (b: Blob) => {
    const url = URL.createObjectURL(b);
    urls.current.push(url);
    return url;
  };

  const run = useCallback(
    async (file: File, crop?: CropRect, natural?: { width: number; height: number }, compressed?: Blob) => {
      let preview: PhotoPreview = { url: objectUrl(file), crop, natural };
      let blob = compressed;
      if (!blob) {
        setState({ kind: "shrinking", preview });
        try {
          blob = await compressImage(file, { maxBytes: MAX_BANNER_PHOTO_BYTES, aspect: kind === "banner" ? 3 : 1, maxDimension: MAX_DIMENSION_BY_KIND[kind], crop });
        } catch {
          retryRef.current = { file, crop, natural };
          if (alive.current) setState({ kind: "failed", reason: "prepare", preview });
          return;
        }
      }
      // From here the preview is the shrunk photo itself: already the crop, so no framing maths.
      preview = { url: objectUrl(blob) };
      if (!alive.current) return;
      setState({ kind: "uploading", preview, progress: null });
      try {
        // The logo shares the banner's mint endpoint (same size budget, same guard chain).
        const target = await mintBannerPhotoUpload();
        await uploadPhotoBlob(target.uploadUrl, blob, target.headers, undefined, (progress) => {
          if (alive.current) setState({ kind: "uploading", preview, progress });
        });
        retryRef.current = null;
        if (!alive.current) return;
        setState({ kind: "idle" });
        onUploadedRef.current(target.key, preview.url);
      } catch {
        retryRef.current = { file, crop, natural, blob };
        if (alive.current) setState({ kind: "failed", reason: "upload", preview });
      }
    },
    [kind],
  );

  return {
    state,
    busy: state.kind === "shrinking" || state.kind === "uploading",
    /** A file picked from the camera or the gallery: frame it first; nothing is shrunk or sent yet. */
    choose: (file: File) => setState({ kind: "cropping", file }),
    cancelCrop: () => setState({ kind: "idle" }),
    confirmCrop: (crop: CropRect, natural?: { width: number; height: number }) => {
      if (state.kind !== "cropping") return;
      void run(state.file, crop, natural);
    },
    retry: () => {
      const r = retryRef.current;
      if (r) void run(r.file, r.crop, r.natural, r.blob);
    },
    /** Drops a failed photo: the slot goes back to what it showed before. */
    dismiss: () => {
      retryRef.current = null;
      setState({ kind: "idle" });
    },
  };
}
