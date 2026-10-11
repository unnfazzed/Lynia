"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage, MAX_DIMENSION_BY_KIND, type CropRect } from "../../lib/image-compress";
import { mintBannerPhotoUpload, mintDishPhotoUpload, uploadPhotoBlob } from "../../lib/menu-api";
import { useVocabulary } from "../../lib/vocabulary";
import { ghostButtonStyle } from "../queue/styles";
import { PhotoCropSheet } from "./PhotoCropSheet";

/** A failed run keeps what it needs to go again: the chosen file and its framing and, once compressed,
 *  the compressed bytes, so Retry only re-mints and re-PUTs (MJ-RL21) instead of re-decoding the photo. */
type Status =
  | { kind: "idle" }
  | { kind: "compressing" }
  | { kind: "uploading" }
  | { kind: "error"; message: string; retryFile: File; retryCrop?: CropRect; retryBlob?: Blob };

/**
 * D-32 "we compress on the merchant's behalf and say so" + D-31's REQUIRED dish photo. Uploads
 * immediately once the merchant has framed the photo (not deferred to the form's own Save) —
 * `onUploaded` hands the parent the raw storage key to persist via updateDish/updateProfile,
 * decoupling the photo round trip from the rest of the form.
 *
 * M4·6/M5·2: choosing a file now opens the reposition frame (`PhotoCropSheet`) before anything is
 * compressed or uploaded — cancelling there uploads nothing at all. The crop it returns is a real
 * source-pixel rectangle handed to `compressImage`, replacing the automatic centre crop.
 *
 * MJ-RM11 / MJ-RM17 (2026-10-07): the form's Save used to stay live while the photo was still on its way,
 * so a dish saved without the photo the merchant was looking at. `onBusy` reports the shrink + upload, and
 * the form holds its Save until it settles. MJ-RL21: the PUT gives up after 60 s and Retry reuses the
 * compressed bytes. MJ-RL14: any image the browser can decode is taken (a phone's WebP or HEIC too).
 *
 * Still flagged: no reboot-surviving offline upload queue. A failed upload (network drop mid-PUT)
 * surfaces a Retry button and keeps the chosen file AND its framing in memory for this session, but a
 * full page reload/app-restart loses an in-flight retry — D-32's "offline upload is queued on the
 * tablet and retried rather than lost" is only honored within one tablet session, not across a
 * restart. A persistent (IndexedDB-backed) queue is a real follow-up, not built here.
 */
export function PhotoPicker({
  kind,
  aspect,
  maxBytes,
  currentUrl,
  shopName,
  required,
  disabled,
  onUploaded,
  onBusy,
}: {
  kind: "dish" | "banner" | "logo";
  aspect: number;
  maxBytes: number;
  currentUrl: string | null;
  /** Labels the banner/logo customer preview inside the crop frame. */
  shopName?: string;
  required?: boolean;
  disabled?: boolean;
  /** The storage key to save, and a local preview of what was uploaded (MJ-RM14: the shop front's
   *  "What customers see" card shows the new photo, not the saved one). */
  onUploaded: (key: string, previewUrl: string) => void;
  /** True while a photo is being shrunk or uploaded (MJ-RM11 / MJ-RM14 / MJ-RM17). */
  onBusy?: (busy: boolean) => void;
}) {
  const v = useVocabulary();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function runUpload(file: File, crop?: CropRect, compressed?: Blob) {
    let blob: Blob;
    let preview = previewUrl;
    if (compressed) {
      blob = compressed;
    } else {
      setStatus({ kind: "compressing" });
      try {
        blob = await compressImage(file, { maxBytes, aspect, maxDimension: MAX_DIMENSION_BY_KIND[kind], crop });
      } catch (err) {
        setStatus({ kind: "error", message: err instanceof Error ? err.message : "Couldn't prepare that photo.", retryFile: file, retryCrop: crop });
        return;
      }
      preview = URL.createObjectURL(blob);
      setPreviewUrl(preview);
    }
    setStatus({ kind: "uploading" });
    try {
      // The logo shares the banner's mint endpoint (same size budget, same guard chain) — the backend
      // namespaces by profile id, not by which shop-front slot the photo fills.
      const target = kind === "dish" ? await mintDishPhotoUpload() : await mintBannerPhotoUpload();
      await uploadPhotoBlob(target.uploadUrl, blob, target.headers);
      setStatus({ kind: "idle" });
      onUploaded(target.key, preview ?? "");
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Upload failed.", retryFile: file, retryCrop: crop, retryBlob: blob });
    }
  }

  const busy = status.kind === "compressing" || status.kind === "uploading";
  const onBusyRef = useRef(onBusy);
  onBusyRef.current = onBusy;
  useEffect(() => {
    onBusyRef.current?.(busy);
  }, [busy]);

  const showUrl = previewUrl ?? currentUrl;
  const frameHeight = aspect >= 2 ? 100 : 140;

  return (
    <div>
      {required && !showUrl && (
        <span
          style={{
            display: "inline-block",
            fontSize: 11.5,
            fontWeight: 800,
            color: "var(--danger-ink)",
            background: "var(--danger-wash)",
            borderRadius: 999,
            padding: "2px 8px",
            marginBottom: 8,
          }}
        >
          REQUIRED
        </span>
      )}
      <div
        style={{
          height: frameHeight,
          borderRadius: 12,
          background: "var(--surface)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {showUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={showUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center" }}>
            {kind === "dish" ? `${v.item} photo · 1:1` : kind === "logo" ? "logo · 1:1" : "cover banner · 1200×400"}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        // MJ-RL14: any image. The upload is always re-encoded to JPEG, so the only real test is whether
        // this browser can decode the file: the crop frame says so when it can't ("That file couldn't be
        // opened as a photo…"), and the compress step's own error covers the rest.
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          // M4·6/M5·2: frame it first — nothing is compressed or uploaded until the crop is confirmed.
          setCropping(file);
        }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          style={{ ...ghostButtonStyle, flex: 1, opacity: disabled || busy ? 0.5 : 1 }}
        >
          {busy ? (status.kind === "compressing" ? "Shrinking…" : "Uploading…") : showUrl ? "Replace" : "Choose a file"}
        </button>
      </div>

      {status.kind === "error" && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger-ink)", lineHeight: 1.4 }}>
          {status.message}{" "}
          <button
            type="button"
            onClick={() => void runUpload(status.retryFile, status.retryCrop, status.retryBlob)}
            style={{ fontWeight: 700, color: "var(--danger-ink)", background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 }}
          >
            Retry
          </button>
        </div>
      )}

      {cropping && (
        <PhotoCropSheet
          kind={kind}
          aspect={aspect}
          file={cropping}
          shopName={shopName}
          onCancel={() => setCropping(null)}
          onConfirm={(crop) => {
            const file = cropping;
            setCropping(null);
            void runUpload(file, crop);
          }}
        />
      )}
    </div>
  );
}
