import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { attachPickupPhoto } from "../api/orders";
import { requestPickupPhotoUpload, uploadImage } from "../api/uploads";
import { downscaleForUpload, type UploadImageSource } from "../logic/image-downscale";
import { clearPickupPhotoDraft, loadPickupPhotoDraft, savePickupPhotoDraft } from "../logic/pickup-photo-draft";

/**
 * Rider v2 A2–A6 (ledger D-54): the pickup photo the collect step needs. Take photo opens the phone's
 * camera (A3), the shot is previewed with "Use this photo" / "Retake" (A4), and once used it counts as
 * saved straight away (A6) — the upload runs behind it and an upload failure never blocks: the shot is
 * kept on the phone (the existing pickup-photo draft) and re-sent on the next foreground or mount.
 */
export interface PickupPhoto {
  /** The local uri of the used photo (or the server's url once attached on an earlier visit). */
  uri: string | null;
  /** A shot waiting on "Use this photo" / "Retake". */
  preview: UploadImageSource | null;
  /** Downscaling the used shot (A5 "Saving photo…"). */
  saving: boolean;
  uploaded: boolean;
  /** The camera permission was refused. */
  denied: boolean;
  take: () => void;
  use: () => void;
  retake: () => void;
  cancelPreview: () => void;
}

export function usePickupPhoto(orderId: string | null, serverUrl: string | null | undefined): PickupPhoto {
  const [uri, setUri] = useState<string | null>(null);
  const [preview, setPreview] = useState<UploadImageSource | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [denied, setDenied] = useState(false);
  const queued = useRef<UploadImageSource | null>(null);
  const busy = useRef(false);

  const upload = useCallback(
    async (asset: UploadImageSource): Promise<void> => {
      if (!orderId || busy.current) return;
      busy.current = true;
      try {
        const { uploadUrl, key, headers } = await requestPickupPhotoUpload(asset.contentType);
        await uploadImage(uploadUrl, asset.uri, headers ?? { "Content-Type": asset.contentType });
        await attachPickupPhoto(orderId, key);
        queued.current = null;
        setUploaded(true);
        void clearPickupPhotoDraft();
      } catch {
        // Kept on the phone (the draft written on use) — retried on the next foreground.
        queued.current = asset;
      } finally {
        busy.current = false;
      }
    },
    [orderId],
  );

  // A photo already attached on an earlier visit counts as saved.
  useEffect(() => {
    if (serverUrl && !uri) {
      setUri(serverUrl);
      setUploaded(true);
    }
  }, [serverUrl, uri]);

  // Resume a shot that was used but never confirmed uploaded (app killed, or no data).
  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    void loadPickupPhotoDraft().then((d) => {
      if (!alive || !d || d.orderId !== orderId) return;
      const asset = { uri: d.uri, width: d.width, height: d.height, contentType: d.contentType };
      setUri((cur) => cur ?? d.uri);
      queued.current = asset;
      void upload(asset);
    });
    return () => {
      alive = false;
    };
  }, [orderId, upload]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && queued.current) void upload(queued.current);
    });
    return () => sub.remove();
  }, [upload]);

  const take = useCallback(() => {
    void (async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setDenied(true);
        return;
      }
      setDenied(false);
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
      if (result.canceled) return;
      const a = result.assets[0];
      if (!a) return;
      setPreview({ uri: a.uri, width: a.width, height: a.height, contentType: a.mimeType === "image/png" ? "image/png" : "image/jpeg" });
    })();
  }, []);

  const use = useCallback(() => {
    const shot = preview;
    if (!shot || !orderId) return;
    setSaving(true);
    void (async () => {
      let asset = shot;
      try {
        asset = await downscaleForUpload(shot);
      } catch {
        /* upload the original */
      }
      void savePickupPhotoDraft({ orderId, uri: asset.uri, width: asset.width, height: asset.height, contentType: asset.contentType });
      setUri(asset.uri);
      setUploaded(false);
      setPreview(null);
      setSaving(false);
      queued.current = asset;
      void upload(asset);
    })();
  }, [preview, orderId, upload]);

  const retake = useCallback(() => {
    setPreview(null);
    take();
  }, [take]);

  return { uri, preview, saving, uploaded, denied, take, use, retake, cancelPreview: () => setPreview(null) };
}
