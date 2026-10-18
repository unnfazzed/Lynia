"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cropRectFromView, MAX_ZOOM, MIN_ZOOM, type CropRect } from "../../lib/image-compress";
import { SF } from "../../lib/shop-front-copy";
import { useVocabulary, type Vocabulary } from "../../lib/vocabulary";
import { Icon } from "../icons";

/**
 * The reposition step between choosing a photo and uploading it, as a phone sheet (Shop front v1 "Crop
 * sheet", packages/design/handoff/shop-front-v1, ledger D-115): `top: 24px`, the body scrolls, the Save /
 * Cancel pair is pinned. The stage draws the WHOLE photo and dims everything outside the dashed frame, so
 * what gets cut off is visible; the banner frame marks where the logo will sit.
 *
 * The crop is REAL: the drag/zoom state resolves to a source-pixel rectangle (`cropRectFromView`) that
 * `compressImage` draws to canvas, so what the merchant frames here is literally the JPEG that gets uploaded.
 * The dish photo (M4·6) uses the same sheet with its own words and its menu-row preview.
 *
 * Pinch-to-zoom is still the slider (a real range input, so it is keyboard-operable; arrow keys nudge too).
 */

export type CropKind = "dish" | "banner" | "logo";

interface Copy {
  title: string;
  sub: string;
  save: string;
  previewLabel: string;
  tip: string;
}

const copyFor = (v: Vocabulary, kind: CropKind): Copy => {
  if (kind === "dish") {
    return {
      title: `Position the ${v.item} photo`,
      sub: v.itemCropSub,
      save: "Save photo",
      previewLabel: v.itemPreviewLabel,
      tip: `Customers scan photos before they read names. One clear daylight shot per ${v.item} is enough.`,
    };
  }
  const c = SF.crop[kind];
  return { title: c.title, sub: c.sub, save: c.save, previewLabel: SF.crop.livePreview, tip: kind === "banner" ? v.bannerPhotoTip : SF.logoSub };
};

interface View {
  zoom: number;
  panX: number;
  panY: number;
}

const INITIAL_VIEW: View = { zoom: 1, panX: 0, panY: 0 };

/** The stage and the frame inside it, from the stage's measured width (README "Crop sheet"). */
function geometry(kind: CropKind, width: number) {
  if (kind === "banner") {
    const height = Math.round(width * 0.5);
    const fw = width - 24;
    const fh = Math.round(fw / 3);
    return { height, frame: { left: 12, top: Math.round((height - fh) / 2), width: fw, height: fh } };
  }
  const height = Math.round(width * 0.72);
  const fw = height - 36;
  return { height, frame: { left: Math.round((width - fw) / 2), top: 18, width: fw, height: fw } };
}

/** A photo placed so that exactly `crop` fills the box, in percentages (it holds at any box size). */
export function croppedImageStyle(crop: CropRect, natural: { width: number; height: number }): React.CSSProperties {
  return {
    position: "absolute",
    left: `${(-crop.x / crop.width) * 100}%`,
    top: `${(-crop.y / crop.height) * 100}%`,
    width: `${(natural.width / crop.width) * 100}%`,
    height: `${(natural.height / crop.height) * 100}%`,
    maxWidth: "none",
    pointerEvents: "none",
    userSelect: "none",
  };
}

export function PhotoCropSheet({
  kind,
  aspect,
  file,
  shopName,
  bannerPreview,
  onCancel,
  onConfirm,
}: {
  kind: CropKind;
  aspect: number;
  file: File;
  /** Labels the logo's list-row preview. */
  shopName?: string;
  /** The banner's live preview: the screen's own storefront card, given the framed photo. */
  bannerPreview?: (photo: { url: string; crop: CropRect; natural: { width: number; height: number } }) => React.ReactNode;
  onCancel: () => void;
  /** The merchant's framing, in SOURCE pixels, and the photo's own size. Nothing is uploaded until this. */
  onConfirm: (crop: CropRect, natural: { width: number; height: number }) => void;
}) {
  const words = useVocabulary();
  const COPY = copyFor(words, kind);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [dragged, setDragged] = useState(false);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setNatural(null);
    setFailed(false);
    setView(INITIAL_VIEW);
    setDragged(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The frame's size comes from the stage's measured width: the pan maths converts drag distances through
  // it, so it has to be a real number, not a CSS value the component can't read.
  const [stageWidth, setStageWidth] = useState(328);
  const stageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    if (el.clientWidth > 0) setStageWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setStageWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [failed]);

  const geo = geometry(kind, stageWidth);
  const frame = geo.frame;
  const crop = natural ? cropRectFromView(natural.width, natural.height, aspect, view) : null;

  // How much source slack each axis has at the current zoom — 0 means that axis is flush with the source
  // edge, so dragging it does nothing and the sheet says so instead of feeling broken.
  const slack = natural ? { x: (natural.width - (crop?.width ?? 0)) / 2, y: (natural.height - (crop?.height ?? 0)) / 2 } : { x: 0, y: 0 };
  const canPan = slack.x > 0.5 || slack.y > 0.5;

  const nudge = useCallback(
    (dxDisplay: number, dyDisplay: number) => {
      if (!natural || !crop) return;
      const scale = frame.width / crop.width;
      setView((prev) => {
        const next = { ...prev };
        // Dragging the picture right (+dx) moves the visible rectangle LEFT across the source.
        if (slack.x > 0.5) next.panX = Math.min(1, Math.max(-1, prev.panX - dxDisplay / scale / slack.x));
        if (slack.y > 0.5) next.panY = Math.min(1, Math.max(-1, prev.panY - dyDisplay / scale / slack.y));
        return next;
      });
    },
    [natural, crop, frame.width, slack.x, slack.y],
  );

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!canPan) return;
    dragRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    nudge(e.clientX - drag.x, e.clientY - drag.y);
    dragRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    setDragged(true);
  }

  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? 24 : 8;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    nudge(move[0], move[1]);
  }

  // Dismiss: drag the handle down past 30% of the sheet's height (a drag on the photo never moves the sheet).
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const handleDrag = useRef<{ pointerId: number; y: number } | null>(null);
  const [pull, setPull] = useState(0);
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    handleDrag.current = { pointerId: e.pointerId, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = handleDrag.current;
    if (d && d.pointerId === e.pointerId) setPull(Math.max(0, e.clientY - d.y));
  };
  const onHandleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = handleDrag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    handleDrag.current = null;
    const height = sheetRef.current?.clientHeight ?? 0;
    if (height > 0 && pull > height * 0.3) onCancel();
    else setPull(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const ready = !!objectUrl && !!natural && !!crop && !failed;
  const scale = crop ? frame.width / crop.width : 1;
  const imageStyle: React.CSSProperties =
    crop && natural
      ? {
          position: "absolute",
          left: frame.left - crop.x * scale,
          top: frame.top - crop.y * scale,
          width: natural.width * scale,
          height: natural.height * scale,
          maxWidth: "none",
          pointerEvents: "none",
          userSelect: "none",
        }
      : { position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" };
  const logoSpot = Math.round((64 * frame.width) / 328);

  return (
    <div className="m-overlay m-crop" role="dialog" aria-modal="true" aria-label={COPY.title}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim m-crop-scrim" aria-label={SF.cancel} onClick={onCancel} />
        <div ref={sheetRef} className="m-crop-sheet" style={pull ? { transform: `translateY(${pull}px)` } : undefined}>
          <div className="m-crop-handle" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}>
            <span />
          </div>
          <div className="m-crop-hd">
            <div className="m-sf-sheet-t">{COPY.title}</div>
            <p className="m-sf-sheet-s">{COPY.sub}</p>
          </div>
          <div className="m-crop-bd">
            {failed ? (
              <div className="m-sf-strip" data-tone="bad" role="alert">
                <span className="m-sf-strip-ic">
                  <Icon name="circle-alert" size={16} />
                </span>
                <span className="m-sf-strip-body m-sf-strip-msg">{SF.crop.unreadable}</span>
              </div>
            ) : null}
            <div ref={stageRef} className="m-crop-stage" style={{ height: geo.height, display: failed ? "none" : undefined }}>
              {objectUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={objectUrl}
                  alt=""
                  draggable={false}
                  onLoad={(e) => {
                    // The intrinsic size is the only value that leaves the DOM here, and every crop/preview
                    // dimension derives from it. A decode that reports 0×0 (a truncated or unsupported file the
                    // browser still fires `load` for) would divide into NaN geometry: treat it as the failure it
                    // is. The numeric guard also ends the DOM→style taint path CodeQL flags (js/xss-through-dom).
                    const width = Number(e.currentTarget.naturalWidth);
                    const height = Number(e.currentTarget.naturalHeight);
                    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) setNatural({ width, height });
                    else setFailed(true);
                  }}
                  onError={() => setFailed(true)}
                  style={imageStyle}
                />
              )}
              {ready && (
                <>
                  {/* Everything outside the frame, dimmed: four rects, not a 999px shadow (slow on cheap Android). */}
                  <i className="m-crop-dim" style={{ left: 0, top: 0, width: stageWidth, height: frame.top }} />
                  <i className="m-crop-dim" style={{ left: 0, top: frame.top + frame.height, width: stageWidth, height: geo.height - frame.top - frame.height }} />
                  <i className="m-crop-dim" style={{ left: 0, top: frame.top, width: frame.left, height: frame.height }} />
                  <i className="m-crop-dim" style={{ left: frame.left + frame.width, top: frame.top, width: stageWidth - frame.left - frame.width, height: frame.height }} />
                </>
              )}
              {/* A real <button>: the frame is operated to pan, so it gets focus, the arrow keys, and a label. */}
              <button
                type="button"
                className="m-crop-frame"
                aria-label={`${COPY.title} — drag, or use the arrow keys, to move the picture inside the frame`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onKeyDown}
                style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height, cursor: canPan ? "grab" : "default" }}
              >
                {kind === "banner" && (
                  <span
                    className="m-crop-ring"
                    style={{ left: Math.round((14 * frame.width) / 328), top: frame.height - Math.round(logoSpot / 2) - 2, width: logoSpot, height: logoSpot }}
                  />
                )}
                {kind !== "banner" && <span className="m-crop-ring" style={{ inset: 4 }} />}
                <span className="m-crop-badge">{aspect >= 2 ? "3:1" : "1:1"}</span>
                {ready && canPan && !dragged && (
                  <span className="m-crop-drag">
                    <Icon name="move" size={16} />
                    {SF.crop.drag}
                  </span>
                )}
              </button>
            </div>

            <div className="m-crop-zoom">
              <button type="button" className="m-crop-zb" onClick={() => setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom - 0.2) }))} disabled={!ready} aria-label={SF.crop.zoomOut}>
                <Icon name="minus" size={16} />
              </button>
              <input
                type="range"
                className="m-crop-range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.05}
                value={view.zoom}
                disabled={!ready}
                aria-label={SF.crop.zoom}
                onChange={(e) => setView((v) => ({ ...v, zoom: Number(e.target.value) }))}
                style={{ ["--fill" as string]: `${((view.zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }}
              />
              <button type="button" className="m-crop-zb" onClick={() => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom + 0.2) }))} disabled={!ready} aria-label={SF.crop.zoomIn}>
                <Icon name="plus" size={16} />
              </button>
              <span className="m-crop-zv">{view.zoom.toFixed(1)}×</span>
            </div>

            <div className="m-sf-sl">{COPY.previewLabel}</div>
            {kind === "banner" && bannerPreview && objectUrl && crop && natural ? (
              bannerPreview({ url: objectUrl, crop, natural })
            ) : kind === "dish" ? (
              <DishPreview crop={crop} natural={natural} url={objectUrl} words={words} />
            ) : (
              <LogoPreview crop={crop} natural={natural} url={objectUrl} name={shopName} />
            )}
            <p className="m-sf-tip">{COPY.tip}</p>
            {ready && !canPan && <p className="m-sf-tip">{SF.crop.alreadyFits}</p>}
          </div>
          <div className="m-crop-ft">
            <button type="button" className="m-btn" disabled={!ready} onClick={() => crop && natural && onConfirm(crop, natural)}>
              {COPY.save}
            </button>
            <button type="button" className="m-btn2" onClick={onCancel}>
              {SF.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The logo at list size: a 56px circle in a row with the shop's name (README "LIVE PREVIEW"). */
function LogoPreview({ crop, natural, url, name }: { crop: CropRect | null; natural: { width: number; height: number } | null; url: string | null; name?: string }) {
  return (
    <div className="m-crop-row">
      <div className="m-crop-thumb" style={{ borderRadius: "50%" }}>
        {url && crop && natural && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" draggable={false} style={croppedImageStyle(crop, natural)} />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <b>{name || SF.nameFallback}</b>
        <span>{SF.crop.logoPreviewSub}</span>
      </div>
    </div>
  );
}

/** M4·6's "HOW IT LOOKS ON THE MENU": the cropped square in a menu row, judged at the size it is seen at. */
function DishPreview({ crop, natural, url, words }: { crop: CropRect | null; natural: { width: number; height: number } | null; url: string | null; words: Vocabulary }) {
  return (
    <div className="m-crop-row">
      <div className="m-crop-thumb">
        {url && crop && natural && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" draggable={false} style={croppedImageStyle(crop, natural)} />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <b>{`This ${words.item}`}</b>
        <span>{words.itemPreviewSub}</span>
      </div>
    </div>
  );
}
