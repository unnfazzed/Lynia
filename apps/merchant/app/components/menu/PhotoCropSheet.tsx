"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cropRectFromView, MAX_ZOOM, MIN_ZOOM, type CropRect } from "../../lib/image-compress";
import { Icon } from "../icons";
import { ghostButtonStyle, primaryButtonStyle } from "../queue/styles";

/**
 * M4·6 `dish_photo` (1:1) and M5·2 `shop_crop` (3:1) — the reposition step the gallery puts between
 * choosing a file and uploading it (`r-merchant.jsx:1450-1479`, `1378-1402`, frame at `1277-1298`):
 * a dashed aspect frame, "Drag to move", a zoom control, and a live customer preview beside it.
 *
 * The crop is REAL, not a mock frame: the drag/zoom state resolves to a source-pixel rectangle
 * (`cropRectFromView`) that `compressImage` draws to canvas in place of its automatic centre crop, so
 * what the merchant frames here is literally the JPEG that gets uploaded. No new dependency — pointer
 * events over the `<canvas>` pipeline `image-compress.ts` already had.
 *
 * Approximated, and flagged rather than silently decided: pinch-to-zoom. The kit's copy says "pinch or
 * slide to zoom"; this ships the slide (a real range input, so it is also keyboard-operable — arrow
 * keys nudge the frame too), because a two-pointer pinch gesture on a kitchen tablet is a meaningfully
 * bigger interaction surface than the zoom control itself and buys nothing the slider can't do.
 */

export type CropKind = "dish" | "banner" | "logo";

const COPY: Record<CropKind, { title: string; sub: string; save: string; previewLabel: string }> = {
  dish: {
    title: "Position the dish photo",
    sub: "Square crop. Fill the frame with the food, not the table.",
    save: "Save photo",
    previewLabel: "HOW IT LOOKS ON THE MENU",
  },
  banner: {
    title: "Position your banner",
    sub: "Drag the picture and slide to zoom. Anything outside the dashed frame is cut off.",
    save: "Save banner",
    previewLabel: "LIVE PREVIEW",
  },
  logo: {
    title: "Position your logo",
    sub: "Square crop. Drag the picture and slide to zoom — anything outside the dashed frame is cut off.",
    save: "Save logo",
    previewLabel: "LIVE PREVIEW",
  },
};

interface View {
  zoom: number;
  panX: number;
  panY: number;
}

const INITIAL_VIEW: View = { zoom: 1, panX: 0, panY: 0 };

/** Geometry of the crop row: the gap between the frame and the live preview, and the narrowest the
 *  preview column is allowed to get before the row wraps instead.
 *
 *  `CROP_PREVIEW_MIN` must equal `BannerPreview`'s own box width, not merely approach it: the
 *  preview is a fixed-width card, so a row-break threshold that reserved LESS than it needs would
 *  keep the columns side by side at a width where the preview then overflows its own column. One
 *  number, used by both. */
const CROP_ROW_GAP = 22;
const CROP_PREVIEW_MIN = 260;

/** The dashed viewport's own display size. 3:1 gets the kit's 430-wide banner frame, 1:1 its 240
 *  square (`r-merchant.jsx:1387`, `1461`); height always follows from the ratio so the frame IS the
 *  aspect it claims.
 *
 *  `available` is the measured width of the column the frame sits in, and only ever shrinks it: on a
 *  tablet the sheet is far wider than 420 so the drawn size wins, while on a phone the 420-wide
 *  banner frame would otherwise be wider than the whole screen. It has to be a real number rather
 *  than a CSS clamp because the crop maths converts drag distances through `frame.width` — a frame
 *  whose true width the component could not read would pan at the wrong rate. */
function frameSize(aspect: number, available?: number | null): { width: number; height: number } {
  const drawn = aspect >= 2 ? 430 : 240;
  const width = available != null && available > 0 ? Math.max(160, Math.min(drawn, Math.round(available))) : drawn;
  return { width, height: Math.round(width / aspect) };
}

/** Maps a source-pixel crop rect onto a display box: the `<img>` styles that make exactly `crop` fill
 *  `boxWidth × boxHeight`. Shared by the frame and every live preview, so the preview can never drift
 *  from what will actually be uploaded. */
function imageStyleFor(crop: CropRect, natural: { width: number; height: number }, boxWidth: number): React.CSSProperties {
  const scale = boxWidth / crop.width;
  return {
    position: "absolute",
    left: -crop.x * scale,
    top: -crop.y * scale,
    width: natural.width * scale,
    height: natural.height * scale,
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
  onCancel,
  onConfirm,
}: {
  kind: CropKind;
  aspect: number;
  file: File;
  /** Only used to label the banner/logo customer preview — falls back to a neutral placeholder. */
  shopName?: string;
  onCancel: () => void;
  /** The merchant's framing, in SOURCE pixels. Nothing is uploaded until this resolves. */
  onConfirm: (crop: CropRect) => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setNatural(null);
    setFailed(false);
    setView(INITIAL_VIEW);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Measured rather than assumed. The row is what gets measured, never the frame's own column: the
  // column is content-sized, so measuring it and then sizing the frame from the result would be a
  // loop. The row's width comes from the sheet above it and is independent of anything below.
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRowWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const drawnFrame = frameSize(aspect);
  // Wide enough for the drawn frame (plus its pad and the gap) AND the preview beside it? Then
  // nothing changes — this is the tablet, and the kit's geometry stands. Otherwise the row has
  // already wrapped, the frame column owns the full row, and the frame shrinks to fit it.
  const fitsBesidePreview = rowWidth == null || rowWidth >= drawnFrame.width + 16 + CROP_ROW_GAP + CROP_PREVIEW_MIN;
  const frame = frameSize(aspect, fitsBesidePreview ? null : (rowWidth ?? 0) - 16);
  const crop = natural ? cropRectFromView(natural.width, natural.height, aspect, view) : null;

  // How much source slack each axis has at the current zoom — 0 means that axis is already flush with
  // the source edge, so dragging it does nothing and the hint says so instead of feeling broken.
  const slack = natural
    ? {
        x: (natural.width - (crop?.width ?? 0)) / 2,
        y: (natural.height - (crop?.height ?? 0)) / 2,
      }
    : { x: 0, y: 0 };
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
  }

  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? 24 : 8;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    nudge(move[0], move[1]);
  }

  const ready = !!objectUrl && !!natural && !!crop && !failed;

  return (
    <div className="kitchen-sheet-overlay" role="dialog" aria-modal="true" aria-label={COPY[kind].title}>
      <div className="kitchen-sheet" style={{ maxWidth: kind === "banner" ? 800 : 660 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{COPY[kind].title}</div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>{COPY[kind].sub}</div>

        {failed && (
          <div style={{ fontSize: 13.5, color: "var(--danger-ink)", background: "var(--danger-wash)", borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontWeight: 700 }}>
            That file couldn&apos;t be opened as a photo. Pick a JPEG or PNG from this tablet.
          </div>
        )}

        <div ref={rowRef} style={{ display: "flex", gap: CROP_ROW_GAP, flexWrap: "wrap" }}>
          <div style={{ flex: "0 0 auto", minWidth: 0, maxWidth: "100%" }}>
            {/* Kit's CropFrame: the surface pad, the dashed accent boundary, the ratio badge and the
             *  "Drag to move" chip (r-merchant.jsx:1279-1285). The dashed rect IS the crop viewport
             *  here, so "anything outside it is cut off" is literally true rather than decorative. */}
            <div style={{ width: frame.width + 16, padding: 8, borderRadius: 12, background: "var(--surface)", position: "relative" }}>
              {/* A real <button>, not a focusable div: the frame IS an interactive control (you
               *  operate it to pan), so it gets native focus, native keyboard reachability, and a
               *  label that says how. It has no onClick — activating it does nothing; the arrow keys
               *  are the keyboard equivalent of the drag. */}
              <button
                type="button"
                aria-label={`${COPY[kind].title} — drag, or use the arrow keys, to move the picture inside the frame`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onKeyDown}
                style={{
                  width: frame.width,
                  height: frame.height,
                  padding: 0,
                  position: "relative",
                  overflow: "hidden",
                  borderRadius: 8,
                  border: "2px dashed var(--accent)",
                  background: "var(--bg)",
                  touchAction: "none",
                  cursor: canPan ? "grab" : "default",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {objectUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={objectUrl}
                    alt=""
                    draggable={false}
                    onLoad={(e) => {
                      // The image's intrinsic size is the only value that leaves the DOM here, and every
                      // crop/preview dimension is derived from it. Coerce and validate rather than trust
                      // it: a decode that reports 0×0 (a truncated or unsupported file the browser still
                      // fires `load` for) would otherwise divide through into NaN geometry and render an
                      // invisible, un-croppable frame. Treat that as the load failure it is. The explicit
                      // numeric guard also terminates the DOM→style taint path CodeQL flags here
                      // (js/xss-through-dom): nothing but finite numbers can reach the style object.
                      const width = Number(e.currentTarget.naturalWidth);
                      const height = Number(e.currentTarget.naturalHeight);
                      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) setNatural({ width, height });
                      else setFailed(true);
                    }}
                    onError={() => setFailed(true)}
                    style={
                      crop && natural
                        ? imageStyleFor(crop, natural, frame.width)
                        : { position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }
                    }
                  />
                )}
                {!ready && <span style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>{failed ? "unreadable file" : "opening your file…"}</span>}
                {ready && canPan && (
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%,-50%)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "rgba(20,24,27,.72)",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      borderRadius: 999,
                      padding: "6px 12px",
                      pointerEvents: "none",
                    }}
                  >
                    <Icon name="navigation" size={13} color="#fff" />
                    Drag to move
                  </span>
                )}
              </button>
              <span
                style={{
                  position: "absolute",
                  right: 14,
                  top: 12,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: "var(--muted)",
                  background: "var(--bg)",
                  borderRadius: 999,
                  padding: "3px 9px",
                }}
              >
                {aspect >= 2 ? "3:1" : "1:1"}
              </span>
            </div>

            {/* Zoom: minus / track / plus / "1.4×" (r-merchant.jsx:1288-1296). A real range input, so
             *  the control is keyboard- and screen-reader-operable, not just a drawn track. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, width: frame.width + 16 }}>
              <button type="button" onClick={() => setView((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom - 0.2) }))} disabled={!ready} style={zoomButtonStyle(!ready)} aria-label="Zoom out">
                <Icon name="minus" size={16} color="var(--muted)" />
              </button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.05}
                value={view.zoom}
                disabled={!ready}
                aria-label="Zoom"
                onChange={(e) => setView((v) => ({ ...v, zoom: Number(e.target.value) }))}
                style={{ flex: 1, accentColor: "var(--accent)" }}
              />
              <button type="button" onClick={() => setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom + 0.2) }))} disabled={!ready} style={zoomButtonStyle(!ready)} aria-label="Zoom in">
                <Icon name="plus" size={16} color="var(--muted)" />
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", minWidth: 42, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {view.zoom.toFixed(1)}×
              </span>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 16, width: frame.width + 16, maxWidth: "100%" }}>
              <button type="button" onClick={onCancel} style={{ ...ghostButtonStyle, flex: 1 }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() => crop && onConfirm(crop)}
                style={{ ...primaryButtonStyle, flex: 1, opacity: ready ? 1 : 0.5 }}
              >
                {COPY[kind].save}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: `min(${CROP_PREVIEW_MIN}px, 100%)` }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>{COPY[kind].previewLabel}</div>
            {kind === "banner" ? (
              <BannerPreview crop={crop} natural={natural} url={objectUrl} shopName={shopName} />
            ) : (
              <DishPreview crop={crop} natural={natural} url={objectUrl} square={kind === "logo"} />
            )}
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10, lineHeight: 1.45 }}>
              {kind === "dish"
                ? "Customers scan photos before they read names. One clear daylight shot per dish is enough."
                : "A real photo of your food beats a logo on the banner. Shoot in daylight, no flash — and keep the left edge clear, your logo sits there."}
            </div>
            {ready && !canPan && (
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.45 }}>
                This photo is already exactly the right shape — nothing is being cut off, so there is nothing to move. Zoom in if you
                want a closer crop.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** M5·2's miniature of the customer's restaurant page (`CustomerPreview`, r-merchant.jsx:1302-1323) —
 *  the same shop card the Shop screen already renders under "WHAT CUSTOMERS SEE". */
function BannerPreview({
  crop,
  natural,
  url,
  shopName,
}: {
  crop: CropRect | null;
  natural: { width: number; height: number } | null;
  url: string | null;
  shopName?: string;
}) {
  const boxWidth = CROP_PREVIEW_MIN;
  return (
    <div style={{ width: boxWidth, borderRadius: 16, border: "1px solid var(--line)", overflow: "hidden", background: "var(--bg)" }}>
      <div style={{ height: Math.round(boxWidth / 3), background: "var(--surface)", position: "relative", overflow: "hidden" }}>
        {url && crop && natural && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" draggable={false} style={imageStyleFor(crop, natural, boxWidth)} />
        )}
      </div>
      <div style={{ padding: "12px 12px 14px" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{shopName || "Your shop"}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>The line customers read under your name.</div>
      </div>
    </div>
  );
}

/** M4·6's "HOW IT LOOKS ON THE MENU" — the cropped square in the same 44px thumb the merchant's own
 *  menu list uses, so the framing is judged at the size it is actually seen at. */
function DishPreview({
  crop,
  natural,
  url,
  square,
}: {
  crop: CropRect | null;
  natural: { width: number; height: number } | null;
  url: string | null;
  square: boolean;
}) {
  const thumb = 56;
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 14, padding: "6px 14px", background: "var(--bg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0" }}>
        <div style={{ width: thumb, height: thumb, borderRadius: square ? "50%" : 10, background: "var(--surface)", overflow: "hidden", position: "relative", flexShrink: 0 }}>
          {url && crop && natural && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" draggable={false} style={imageStyleFor(crop, natural, thumb)} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{square ? "Your shop" : "This dish"}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{square ? "Your logo, as customers see it" : "How the photo reads at menu size"}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderTop: "1px solid var(--line)", opacity: 0.45 }}>
        <div style={{ width: thumb, height: thumb, borderRadius: 10, background: "var(--surface)", flexShrink: 0 }} />
        <div style={{ fontSize: 15, fontWeight: 700 }}>Another dish</div>
      </div>
    </div>
  );
}

function zoomButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "grid",
    placeItems: "center",
    width: 34,
    height: 34,
    borderRadius: 999,
    border: "1px solid var(--line)",
    background: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    flexShrink: 0,
  };
}


