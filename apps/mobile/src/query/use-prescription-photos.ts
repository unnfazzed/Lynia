import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
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
  /** R8c/R8d (brief 09, D-97): drop a page at once — an upload still in flight is cancelled. */
  remove: (id: string) => void;
  /** R8d's Undo: put a removed page back at its old index, with its uri and key (re-uploads it if its
   *  upload was cancelled by the remove). Ignored if the page is back already or the block is full. */
  restore: (page: RxPage, index: number) => void;
  /** R8e's Retake: a new shot replaces the page in place (same position), then uploads. */
  replace: (id: string, from: "camera" | "gallery") => void;
  /** U29: drop every page (the block goes back to R8a) — placement refused one of them (`upload_*`). */
  clear: () => void;
}

type Asset = { uri: string; contentType: UploadImageSource["contentType"] };

/** Camera or gallery → the downscaled asset, or null (refused / cancelled). */
async function pickPage(from: "camera" | "gallery"): Promise<Asset | null> {
  // U30: no camera (refused, or refused for good) → the gallery, which R8a draws beside it.
  let source = from;
  if (source === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted) source = "gallery";
  if (source === "gallery" && !(await ImagePicker.requestMediaLibraryPermissionsAsync()).granted) return null;
  const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled) return null;
  const a = result.assets[0];
  if (!a) return null;
  const shot: UploadImageSource = { uri: a.uri, width: a.width, height: a.height, contentType: a.mimeType === "image/png" ? "image/png" : "image/jpeg" };
  try {
    return await downscaleForUpload(shot);
  } catch {
    return shot; // upload the original
  }
}

/**
 * Order flow v2 R8a/R8b (BRIEF §13, behind `rxEnabled`): the prescription pages on Review. Each page is
 * picked (camera or gallery), downscaled and uploaded straight away through `POST
 * /uploads/prescription-photo` + the signed PUT — the same mint → PUT → key pattern as the rider's pickup
 * photo and KYC. A page whose upload fails is dropped with `onError`, so the block never shows a page the
 * order can't carry; the customer simply adds it again.
 *
 * U30 (reviewed list 2026-10-07): a refused camera falls back to the gallery (it used to do nothing, and
 * the + tile for pages 2–3 only opens the camera), and `onError` gets the failure, so the screen can say
 * the server's reason for a refused mint (4xx / 503) instead of "No connection" every time.
 *
 * U29 / brief 09 (D-97, R8c–R8e): a page can be removed (even mid-upload), restored by Undo and retaken.
 * Each page's upload holds one AbortController; only the page's CURRENT upload may land or fail it, so a
 * late answer for a removed or retaken page never brings it back, stamps the old key, or raises a toast.
 * A removed page is never deleted on the server: its uploaded object is simply left out of the place body.
 */
export function usePrescriptionPhotos(onError: (err: unknown) => void): PrescriptionPhotos {
  const [pages, setPages] = useState<RxPage[]>([]);
  const seq = useRef(0);
  const count = useRef(0);
  count.current = pages.length;
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const errRef = useRef(onError);
  errRef.current = onError;
  /** The page's current upload. A result whose controller isn't this one is stale and ignored. */
  const inflight = useRef(new Map<string, AbortController>());
  /** Each page's picked asset, so Undo can re-upload a page whose upload the remove cancelled. */
  const assets = useRef(new Map<string, Asset>());

  const cancel = useCallback((id: string) => {
    const ctl = inflight.current.get(id);
    inflight.current.delete(id);
    ctl?.abort();
  }, []);

  const upload = useCallback(async (id: string, asset: Asset): Promise<void> => {
    const ctl = new AbortController();
    inflight.current.get(id)?.abort();
    inflight.current.set(id, ctl);
    const current = (): boolean => inflight.current.get(id) === ctl;
    try {
      const { uploadUrl, key, headers } = await requestPrescriptionPhotoUpload(asset.contentType);
      if (!current()) return;
      await uploadImage(uploadUrl, asset.uri, headers ?? { "Content-Type": asset.contentType }, ctl.signal);
      if (!current()) return;
      inflight.current.delete(id);
      setPages((cur) => cur.map((p) => (p.id === id && p.uri === asset.uri ? { ...p, key } : p)));
    } catch (err) {
      if (!current()) return;
      inflight.current.delete(id);
      setPages((cur) => cur.filter((p) => p.id !== id));
      errRef.current(err);
    }
  }, []);

  const add = useCallback(
    (from: "camera" | "gallery") => {
      void (async () => {
        const asset = await pickPage(from);
        if (!asset) return;
        seq.current += 1;
        const id = `rx-${seq.current}`;
        if (count.current >= RX_MAX_PAGES) return;
        count.current += 1;
        assets.current.set(id, asset);
        setPages((cur) => [...cur, { id, uri: asset.uri, key: null }]);
        void upload(id, asset);
      })();
    },
    [upload],
  );

  const remove = useCallback(
    (id: string) => {
      cancel(id);
      count.current = Math.max(0, count.current - 1);
      setPages((cur) => cur.filter((p) => p.id !== id));
    },
    [cancel],
  );

  const restore = useCallback(
    (page: RxPage, index: number) => {
      const cur = pagesRef.current;
      const asset = assets.current.get(page.id);
      // A page without its key can only come back with the asset to upload it again.
      if (cur.some((p) => p.id === page.id) || count.current >= RX_MAX_PAGES || (page.key == null && !asset)) return;
      count.current += 1;
      const next = [...cur];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, page);
      pagesRef.current = next;
      setPages(next);
      if (page.key == null && asset) void upload(page.id, asset);
    },
    [upload],
  );

  const replace = useCallback(
    (id: string, from: "camera" | "gallery") => {
      void (async () => {
        const asset = await pickPage(from);
        if (!asset || !pagesRef.current.some((p) => p.id === id)) return;
        cancel(id);
        assets.current.set(id, asset);
        setPages((cur) => cur.map((p) => (p.id === id ? { ...p, uri: asset.uri, key: null } : p)));
        void upload(id, asset);
      })();
    },
    [cancel, upload],
  );

  const clear = useCallback(() => {
    for (const ctl of inflight.current.values()) ctl.abort();
    inflight.current.clear();
    assets.current.clear();
    count.current = 0;
    setPages([]);
  }, []);

  // Leaving Review drops whatever is still uploading.
  useEffect(() => {
    const live = inflight.current;
    return () => {
      for (const ctl of live.values()) ctl.abort();
      live.clear();
    };
  }, []);

  const uploading = pages.some((p) => p.key == null);
  const keys = !uploading ? pages.map((p) => p.key as string) : [];
  return { pages, uploading, keys, add, remove, restore, replace, clear };
}
