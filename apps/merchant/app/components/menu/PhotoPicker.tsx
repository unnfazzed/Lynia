"use client";

import { useRef, useState } from "react";
import { compressImage } from "../../lib/image-compress";
import { mintBannerPhotoUpload, mintDishPhotoUpload, uploadPhotoBlob } from "../../lib/menu-api";
import { ghostButtonStyle } from "../queue/styles";

type Status = { kind: "idle" } | { kind: "compressing" } | { kind: "uploading" } | { kind: "error"; message: string; retryFile: File };

/**
 * D-32 "we compress on the merchant's behalf and say so" + D-31's REQUIRED dish photo. Uploads
 * immediately on file choice (not deferred to the form's own Save) — `onUploaded` hands the parent the
 * raw storage key to persist via updateDish/updateProfile, decoupling the photo round trip from the
 * rest of the form.
 *
 * Scope cut, flagged: no drag-to-reposition crop UI (see image-compress.ts's own doc comment) — the
 * source is auto center-cropped to `aspect`. Also no reboot-surviving offline upload queue: a failed
 * upload (network drop mid-PUT) surfaces a Retry button and keeps the chosen file in memory for this
 * session, but a full page reload/app-restart loses an in-flight retry — D-32's "offline upload is
 * queued on the tablet and retried rather than lost" is only honored within one tablet session, not
 * across a restart. A persistent (IndexedDB-backed) queue is a real follow-up, not built here.
 */
export function PhotoPicker({
  kind,
  aspect,
  maxBytes,
  currentUrl,
  required,
  disabled,
  onUploaded,
}: {
  kind: "dish" | "banner" | "logo";
  aspect: number;
  maxBytes: number;
  currentUrl: string | null;
  required?: boolean;
  disabled?: boolean;
  onUploaded: (key: string) => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function runUpload(file: File) {
    setStatus({ kind: "compressing" });
    let blob: Blob;
    try {
      blob = await compressImage(file, { maxBytes, aspect, maxDimension: 1600 });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Couldn't prepare that photo.", retryFile: file });
      return;
    }
    setPreviewUrl(URL.createObjectURL(blob));
    setStatus({ kind: "uploading" });
    try {
      // The logo shares the banner's mint endpoint (same size budget, same guard chain) — the backend
      // namespaces by profile id, not by which shop-front slot the photo fills.
      const target = kind === "dish" ? await mintDishPhotoUpload() : await mintBannerPhotoUpload();
      await uploadPhotoBlob(target.uploadUrl, blob, target.headers);
      setStatus({ kind: "idle" });
      onUploaded(target.key);
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Upload failed.", retryFile: file });
    }
  }

  const busy = status.kind === "compressing" || status.kind === "uploading";
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
            {kind === "dish" ? "dish photo · 1:1" : kind === "logo" ? "logo · 1:1" : "cover banner · 1200×400"}
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void runUpload(file);
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
            onClick={() => void runUpload(status.retryFile)}
            style={{ fontWeight: 700, color: "var(--danger-ink)", background: "none", border: "none", textDecoration: "underline", cursor: "pointer", padding: 0 }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
