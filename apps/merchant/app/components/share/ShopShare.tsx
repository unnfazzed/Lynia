"use client";

import type { MerchantShareLinkResponse } from "@lynia/shared";
import { useEffect, useRef, useState } from "react";
import { displayLink, getCounterQrSvg, shareOnWhatsAppUrl } from "../../lib/share-api";
import { fill, SH } from "../../lib/shop-share-copy";
import { Icon } from "../icons";

/** Who the preview card is about: the name and photos customers see (DR16: name, logo, cover only). */
export interface SharePreview {
  name: string;
  coverUrl: string | null;
  logoUrl: string | null;
  /** The section, for the no-photo tint (README §4 "No photo"). */
  service: "restaurants" | "shops" | "pharmacy";
}

const BAND: Record<SharePreview["service"], string> = { restaurants: "#FFD9CC", shops: "#DDD5FF", pharmacy: "#C5E9DF" };
const COPIED_MS = 2000;

/**
 * SH-M1 · the Share your shop row (handoff shop-share-v1 README §4 "Share row", D-129). Only while the shop is live
 * (the caller hides it otherwise, DR6). Whole row is the target.
 */
export function ShareRow({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="m-sh-row" onClick={onOpen}>
      <span className="m-sh-row-ic">
        <Icon name="share-2" size={20} />
      </span>
      <span className="m-sh-row-txt">
        <span className="m-sh-row-t">{SH.merchant.rowT}</span>
        <span className="m-sh-row-s">{SH.merchant.rowS}</span>
      </span>
      <span className="m-sh-row-chev">
        <Icon name="chevron-right" size={20} />
      </span>
    </button>
  );
}

/** The preview card: cover 3:1, logo 56 with a 3px ring overlapping 28, the name (2 lines) and "lyniago.com". */
export function SharePreviewCard({ preview }: { preview: SharePreview }) {
  return (
    <div className="m-sh-prev">
      <div className="m-sh-prev-cover" style={preview.coverUrl ? { backgroundImage: `url("${preview.coverUrl}")` } : { background: BAND[preview.service] }} />
      <div className="m-sh-prev-logo" style={preview.logoUrl ? { backgroundImage: `url("${preview.logoUrl}")` } : undefined}>
        {preview.logoUrl ? null : preview.name.trim().charAt(0).toUpperCase()}
      </div>
      <div className="m-sh-prev-body">
        <div className="m-sh-prev-name">{preview.name}</div>
        <div className="m-sh-prev-host">lyniago.com</div>
      </div>
    </div>
  );
}

/**
 * SH-M2/M3 · the share sheet: title, sub, preview card, Share on WhatsApp (wa.me with `waText`, WhatsApp's own
 * picker), a list card with Copy link ("Copied" for 2 s and a toast) and Show QR for your counter, then the link as
 * text. Swipe down / scrim / Escape closes it. The link is for the branch the app is working on (each branch has its
 * own); the branch picker (SH-M5) is not built, see D-129.
 */
export function ShopShareSheet({
  link,
  preview,
  onClose,
  onToast,
}: {
  link: MerchantShareLinkResponse & { link: string };
  preview: SharePreview;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !qr) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [qr]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard?.writeText(link.link).then(
      () => {
        setCopied(true);
        onToast(SH.merchant.toastCopied);
      },
      () => undefined,
    );
  };
  const waText = fill(SH.merchant.waText, { shop: preview.name, link: link.link });

  if (qr) return <CounterQr link={link.link} preview={preview} onClose={() => setQr(false)} onToast={onToast} />;

  return (
    <div className="m-overlay" style={{ zIndex: 70 }}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label="Close" onClick={onClose} />
        <div className="m-sheet m-sh-sheet" role="dialog" aria-modal="true" aria-labelledby="sh-sheet-t">
          <div className="m-grab" />
          <h2 id="sh-sheet-t" className="m-sh-title">
            {SH.merchant.sheetT}
          </h2>
          <p className="m-sh-sub">{SH.merchant.sheetS}</p>
          <SharePreviewCard preview={preview} />
          <a className="m-btn m-sh-wa" href={shareOnWhatsAppUrl(waText)} target="_blank" rel="noopener noreferrer">
            <Icon name="message-circle" size={20} />
            {SH.merchant.shareWa}
          </a>
          <div className="m-sh-list">
            <button type="button" className="m-sh-li" onClick={copy}>
              <span className="m-sh-li-ic">
                <Icon name={copied ? "check" : "copy"} size={20} />
              </span>
              <span className="m-sh-li-l">{SH.merchant.copyLink}</span>
              {copied ? <span className="m-sh-li-done">{SH.merchant.copied}</span> : null}
            </button>
            <button type="button" className="m-sh-li" onClick={() => setQr(true)}>
              <span className="m-sh-li-ic">
                <Icon name="qr-code" size={20} />
              </span>
              <span className="m-sh-li-l">{SH.merchant.qrRow}</span>
              <span className="m-sh-li-chev">
                <Icon name="chevron-right" size={18} />
              </span>
            </button>
          </div>
          <div className="m-sh-linktext">
            <span className="m-sh-linklabel">{SH.merchant.linkLabel}</span>
            <span className="m-sh-link">{displayLink(link.link)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A6 at 300 dpi (README §4 "Reading distance"): 1240×1748, the QR at 75 mm (886 px). */
export const A6_PX = { w: 1240, h: 1748, qr: 886 } as const;

/**
 * SH-M4 · QR for your counter, full screen. ✕ returns to the sheet. Save to phone writes the SH-M4p card (A6, the QR
 * at 75 mm, the name, "Scan to order", the link) as a PNG; Print opens the browser's print dialog with the same card
 * on an A6 page. The QR encodes the link with `?src=qr` (the API's).
 */
export function CounterQr({ link, preview, onClose, onToast }: { link: string; preview: SharePreview; onClose: () => void; onToast: (message: string) => void }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    getCounterQrSvg().then(
      (svg) => {
        if (!live) return;
        url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        setQrUrl(url);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (!qrUrl) return;
    void a6Card(qrUrl, preview.name, displayLink(link)).then((png) => {
      if (!png) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = "lyniago-counter-qr.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      onToast(SH.merchant.qrSaved);
    });
  };

  return (
    <div className="m-overlay m-sh-qrpage" style={{ zIndex: 80 }} role="dialog" aria-modal="true" aria-labelledby="sh-qr-t">
      <div className="m-sh-qrbar">
        <button type="button" className="m-sh-qrx" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={22} />
        </button>
        <h2 id="sh-qr-t" className="m-sh-qrtitle">
          {SH.merchant.qrTitle}
        </h2>
      </div>
      <div className="m-sh-qrbody">
        <div className="m-sh-qrcard">
          <div className="m-sh-qrshop">
            <span className="m-sh-qrlogo" style={preview.logoUrl ? { backgroundImage: `url("${preview.logoUrl}")` } : undefined}>
              {preview.logoUrl ? null : preview.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="m-sh-qrname">{preview.name}</span>
          </div>
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="m-sh-qrimg" src={qrUrl} alt={fill(SH.merchant.qrA11y, { link: displayLink(link) })} />
          ) : (
            <div className="m-sh-qrimg m-sh-qrwait" aria-busy={!failed}>
              {failed ? <Icon name="wifi-off" size={28} /> : null}
            </div>
          )}
          <div className="m-sh-qrscan">{SH.merchant.qrScan}</div>
          <div className="m-sh-qrlink">{displayLink(link)}</div>
        </div>
      </div>
      <div className="m-sh-qrfoot">
        <button type="button" className="m-btn" onClick={save} disabled={!qrUrl}>
          <Icon name="download" size={20} />
          {SH.merchant.qrSave}
        </button>
        <button type="button" className="m-btn2 m-sh-print-btn" onClick={() => window.print()} disabled={!qrUrl}>
          <Icon name="printer" size={20} />
          {SH.merchant.qrPrint}
        </button>
      </div>
      {/* SH-M4p, what Print puts on the A6 page (only visible in print). */}
      {qrUrl ? (
        <div className="m-sh-print" aria-hidden="true">
          <div className="m-sh-print-name">{preview.name}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="m-sh-print-qr" src={qrUrl} alt="" />
          <div className="m-sh-print-scan">{SH.merchant.qrScan}</div>
          <div className="m-sh-print-link">{displayLink(link)}</div>
          <div className="m-sh-print-sub">{SH.merchant.qrSub}</div>
        </div>
      ) : null}
    </div>
  );
}

/** Draws the SH-M4p card at A6 / 300 dpi and returns it as a PNG, or null when the canvas can't. */
export async function a6Card(qrUrl: string, name: string, link: string): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = A6_PX.w;
  canvas.height = A6_PX.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const qr = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", () => resolve(null), { once: true });
    img.src = qrUrl;
  });
  if (!qr) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A6_PX.w, A6_PX.h);
  ctx.fillStyle = "#14181B";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "700 68px Inter, system-ui, sans-serif";
  ctx.fillText(fitText(ctx, name, A6_PX.w - 160), A6_PX.w / 2, 140);
  const qrTop = 300;
  ctx.drawImage(qr, (A6_PX.w - A6_PX.qr) / 2, qrTop, A6_PX.qr, A6_PX.qr);
  ctx.font = "700 92px Inter, system-ui, sans-serif";
  ctx.fillText(SH.merchant.qrScan, A6_PX.w / 2, qrTop + A6_PX.qr + 70);
  ctx.font = "600 52px ui-monospace, Menlo, monospace";
  ctx.fillText(fitText(ctx, link, A6_PX.w - 120), A6_PX.w / 2, qrTop + A6_PX.qr + 200);
  ctx.fillStyle = "#5B6670";
  ctx.font = "400 44px Inter, system-ui, sans-serif";
  ctx.fillText(fitText(ctx, SH.merchant.qrSub, A6_PX.w - 120), A6_PX.w / 2, qrTop + A6_PX.qr + 290);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** `text`, cut with an ellipsis to fit `max` pixels in the context's current font. */
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}
