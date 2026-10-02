"use client";

import { useEffect, useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { ORDER_FLOW as OF } from "../../lib/vocabulary";
import { Icon, type IconName } from "../icons";
import { ProposerLine } from "./proposer";

/**
 * Order flow v2 round 2's merchant parts (packages/design/handoff/order-flow-v2, of-kit.js `note`,
 * `photoRow`, of-screens-mrg.js `M2`/`M4`/`M5`; ledger D-59): the note card, the photo row and its
 * full-screen viewer (the rider's sealed-bag photo on M4/M4b, the door photo on M5b/M6b), and M2's lines
 * while the customer answers a substitution round.
 */

/** `note(tone, icon, html)`: a tinted card, an icon, a bold line, then the sub-line. */
export function Note({ tone, icon, title, children }: { tone?: "ok" | "hi"; icon: IconName; title: React.ReactNode; children?: React.ReactNode }) {
  const color = tone === "hi" ? "var(--highlight-ink)" : "var(--accent-text)";
  return (
    <div className="m-note" data-tone={tone}>
      <Icon name={icon} size={18} color={color} style={{ marginTop: 1, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        <b>{title}</b>
        {children}
      </span>
    </div>
  );
}

/**
 * `photoRow`: a 72 thumb, the title (14/700) and a muted sub, then "View" (44) opening the viewer. While
 * the photo is still to come (M4b) the thumb is a dashed frame with a spinner and there is nothing to view.
 */
export function PhotoRow({ title, sub, url, waiting = false }: { title: string; sub: string; url?: string | null; waiting?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="m-card" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {waiting ? (
        <span className="m-photo-wait" aria-hidden>
          <span className="m-spin" />
        </span>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not a static asset
        <img className="m-photo" src={url} alt="" />
      ) : (
        <span className="m-photo" style={{ display: "grid", placeItems: "center" }} aria-hidden>
          <Icon name="image" size={22} color="var(--muted)" />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 14, display: "block" }}>{title}</b>
        <span className="m-hint" style={{ fontSize: 13 }}>
          {sub}
        </span>
      </div>
      {!waiting && url && (
        <button type="button" className="m-gh" style={{ flexShrink: 0 }} onClick={() => setOpen(true)}>
          <Icon name="image" size={16} />
          {OF.view}
        </button>
      )}
      {open && url && <PhotoViewer url={url} caption={`${title} · ${sub}`} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The viewer (T8b's merchant twin): ink full screen, the photo at r16, the caption, Close. */
export function PhotoViewer({ url, caption, onClose }: { url: string; caption: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="m-overlay" style={{ zIndex: 80 }}>
      <div className="m-overlay-frame">
        <div className="m-viewer" role="dialog" aria-modal="true" aria-label={caption}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
          <img src={url} alt={caption} />
          <p>{caption}</p>
          <button type="button" className="m-btn" onClick={onClose}>
            {OF.close}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * M2: the order's lines while the customer answers — a removed line struck with "Removing", a swapped
 * one with its ⇄ replacement and "Swap asked". Lines a swap added (after a yes) don't exist yet.
 */
export function RoundLines({ order }: { order: MerchantOrderResponse }) {
  const round = order.substitution;
  const byItem = new Map((round?.lines ?? []).map((l) => [l.itemId, l]));
  return (
    <div>
      {order.items
        .filter((i) => !i.replacesItemId)
        .map((item, k) => {
          const l = item.itemId ? byItem.get(item.itemId) : undefined;
          if (l?.action === "swap" && l.swapName && l.swapPriceUsd != null) {
            return (
              <ProposerLine
                key={item.itemId ?? k}
                item={{ ...item, priceUsd: l.priceUsd, quantity: l.quantity }}
                change={{ kind: "swap", dishId: l.swapDishId ?? "", name: l.swapName, priceUsd: l.swapPriceUsd }}
                pill={{ label: OF.mAsked, tone: "gold" }}
                plain
              />
            );
          }
          if (l?.action === "remove" || (!l && item.available === false)) {
            return <ProposerLine key={item.itemId ?? k} item={item} change={{ kind: "remove" }} />;
          }
          return <ProposerLine key={item.itemId ?? k} item={item} />;
        })}
    </div>
  );
}
