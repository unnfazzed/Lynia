import * as ImagePicker from "expo-image-picker";
import { useCallback, useRef, useState } from "react";
import { requestPrescriptionPhotoUpload, uploadImage } from "../api/uploads";
import { downscaleForUpload, type UploadImageSource } from "../logic/image-downscale";

/** BRIEF §13 / R8: "Up to 3 pages." (the contract's `photoKeys` max). */
export const RX_MAX_PAGES = 3;

export interface RxPage {
  id: string;
  /** The local (downscaled) image, shown as the 64×80 thumb. */
  uri: string;
  /** The uploaded object key, once the signed PUT has landed. */
  key: string | null;
}

export interface PrescriptionPhotos {
  pages: RxPage[];
  /** A page is still uploading. */
  uploading: boolean;
  /** Every page is uploaded — the keys the place body carries. Empty until then. */
  keys: string[];
  add: (from: "camera" | "gallery") => void;
  remove: (id: string) => void;
}

/**
 * Order flow v2 R8a/R8b (BRIEF §13, behind `rxEnabled`): the prescription pages on Review. Each page is
 * picked (camera or gallery), downscaled and uploaded straight away through `POST
 * /uploads/prescription-photo` + the signed PUT — the same mint → PUT → key pattern as the rider's pickup
 * photo and KYC. A page whose upload fails is dropped with `onError`, so the block never shows a page the
 * order can't carry; the customer simply adds it again.
 */
export function usePrescriptionPhotos(onError: () => void): PrescriptionPhotos {
  const [pages, setPages] = useState<RxPage[]>([]);
  const seq = useRef(0);
  const count = useRef(0);
  count.current = pages.length;
  const errRef = useRef(onError);
  errRef.current = onError;

  const upload = useCallback(async (id: string, asset: { uri: string; contentType: UploadImageSource["contentType"] }): Promise<void> => {
    try {
      const { uploadUrl, key, headers } = await requestPrescriptionPhotoUpload(asset.contentType);
      await uploadImage(uploadUrl, asset.uri, headers ?? { "Content-Type": asset.contentType });
      setPages((cur) => cur.map((p) => (p.id === id ? { ...p, key } : p)));
    } catch {
      setPages((cur) => cur.filter((p) => p.id !== id));
      errRef.current();
    }
  }, []);

  const add = useCallback(
    (from: "camera" | "gallery") => {
      void (async () => {
        const perm = from === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 };
        const result = from === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
        if (result.canceled) return;
        const a = result.assets[0];
        if (!a) return;
        const shot: UploadImageSource = { uri: a.uri, width: a.width, height: a.height, contentType: a.mimeType === "image/png" ? "image/png" : "image/jpeg" };
        let asset: { uri: string; contentType: UploadImageSource["contentType"] } = shot;
        try {
          asset = await downscaleForUpload(shot);
        } catch {
          /* upload the original */
        }
        seq.current += 1;
        const id = `rx-${seq.current}`;
        if (count.current >= RX_MAX_PAGES) return;
        count.current += 1;
        setPages((cur) => [...cur, { id, uri: asset.uri, key: null }]);
        void upload(id, asset);
      })();
    },
    [upload],
  );

  const remove = useCallback((id: string) => setPages((cur) => cur.filter((p) => p.id !== id)), []);

  const uploading = pages.some((p) => p.key == null);
  const keys = !uploading ? pages.map((p) => p.key as string) : [];
  return { pages, uploading, keys, add, remove };
}
