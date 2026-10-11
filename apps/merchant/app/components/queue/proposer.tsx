"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MerchantDishResponse, MerchantOrderItemView, MerchantOrderResponse } from "@lynia/shared";
import { listDishes } from "../../lib/menu-api";
import { money } from "../../lib/orders-view";
import { changeableLines, type Changes, type LineChange, priceDiff, proposalTotals, swapLine, swapsAllowed } from "../../lib/substitution";
import { ORDER_FLOW as OF } from "../../lib/vocabulary";
import { Icon } from "../icons";

/**
 * Order flow v2's merchant proposer (packages/design/handoff/order-flow-v2, of-screens-mrg.js `U1a`,
 * `U1b`, `M2`; README "Merchant proposer"; ledger D-59): inside the ringing sheet, or the mid-prep
 * "Change items" sheet (U4a), a tapped line greys and shows "Remove it" / "Swap for…" (44). A removed line
 * strikes through with a "Removing" pill; a swap shows a green ⇄ line with the replacement and the price
 * difference. A customer who asked for missing items to be removed gets no swaps. The swap picker (U1b)
 * lists the venue's own live items with their price against the line.
 */

/** One drawn line (`mline`): quantity, name, price; selected, struck, swapped, or carrying a pill. */
export function ProposerLine({
  item,
  change,
  selected,
  swaps,
  disabled,
  onTap,
  onRemove,
  onSwap,
  pill,
  plain = false,
}: {
  item: MerchantOrderItemView;
  change?: LineChange;
  selected?: boolean;
  swaps?: boolean;
  disabled?: boolean;
  onTap?: () => void;
  onRemove?: () => void;
  onSwap?: () => void;
  /** M2: the pill under a line ("Swap asked", "Removing"). */
  pill?: { label: string; tone: "gold" | "grey" };
  /** M2 draws the swap without the price difference ("Bakers Inn 700g · $1.20"). */
  plain?: boolean;
}) {
  const strike = change?.kind === "remove";
  const shownPill = pill ?? (strike ? { label: OF.mRemoved, tone: "grey" as const } : null);
  const body = (
    <>
      <b>{item.quantity}×</b>
      <div>
        <span style={strike ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{item.name}</span>
        {item.note && <q>{item.note}</q>}
        {change?.kind === "swap" && (
          <span className="m-swapln">
            <Icon name="arrow-left-right" size={14} />
            {plain ? `${change.name} · ${money(change.priceUsd)}` : swapLine(change, item.priceUsd, OF.mSame)}
          </span>
        )}
        {shownPill && (
          <span className={`m-pl ${shownPill.tone === "gold" ? "m-hl" : "m-grey"}`} style={{ marginTop: 4 }}>
            {shownPill.label}
          </span>
        )}
      </div>
      <span style={strike ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{money(item.priceUsd * item.quantity)}</span>
    </>
  );
  return (
    <div className="m-ol-wrap" data-sel={selected ? "" : undefined}>
      {onTap ? (
        <button type="button" className="m-ol m-ol-btn" aria-expanded={selected} disabled={disabled} onClick={onTap}>
          {body}
        </button>
      ) : (
        <div className="m-ol">{body}</div>
      )}
      {selected && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" className="m-btn-sec" style={{ flex: 1 }} disabled={disabled} onClick={onRemove}>
            <Icon name="trash-2" size={16} />
            {OF.mRemove}
          </button>
          {swaps && (
            <button type="button" className="m-btn m-sm" style={{ flex: 1 }} disabled={disabled} onClick={onSwap}>
              <Icon name="arrow-left-right" size={16} />
              {OF.mSwap}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The proposer's state: which line is open and what each line becomes. */
export function useProposer(order: MerchantOrderResponse) {
  const [changes, setChanges] = useState<Changes>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState<(MerchantOrderItemView & { itemId: string }) | null>(null);
  const swaps = swapsAllowed(order);
  const count = Object.keys(changes).length;
  const totals = proposalTotals(order, changes);
  function tap(itemId: string) {
    // A changed line taps back to as ordered; any other opens (or closes) its two buttons.
    if (changes[itemId]) {
      setChanges((c) => {
        const next = { ...c };
        delete next[itemId];
        return next;
      });
      setSelected(null);
      return;
    }
    setSelected((s) => (s === itemId ? null : itemId));
  }
  function set(itemId: string, change: LineChange) {
    setChanges((c) => ({ ...c, [itemId]: change }));
    setSelected(null);
    setPicking(null);
  }
  return { changes, selected, picking, setPicking, swaps, count, totals, tap, set };
}

export type Proposer = ReturnType<typeof useProposer>;

/** The lines, tappable. */
export function ProposerLines({ order, p, disabled }: { order: MerchantOrderResponse; p: Proposer; disabled?: boolean }) {
  return (
    <div>
      {changeableLines(order).map((item) => (
        <ProposerLine
          key={item.itemId}
          item={item}
          change={p.changes[item.itemId]}
          selected={p.selected === item.itemId}
          swaps={p.swaps}
          disabled={disabled}
          onTap={() => p.tap(item.itemId)}
          onRemove={() => p.set(item.itemId, { kind: "remove" })}
          onSwap={() => p.setPicking(item)}
        />
      ))}
    </div>
  );
}

/** "$14.60 → $11.60" once something changed. */
export function ProposerTotal({ p, fallback }: { p: Proposer; fallback: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{OF.total}</span>
      <b className="m-num" style={{ fontSize: 20 }}>
        {p.count > 0 ? `${money(p.totals.was)} → ${money(p.totals.now)}` : money(fallback)}
      </b>
    </div>
  );
}

/** MJ-RL20 (D7): the 40 px tile draws the server's thumbnail, lazily, never the full photo; a thumbnail
 *  that fails to load falls back to the full photo once (D7 review). */
function SwapThumb({ thumbUrl, photoUrl }: { thumbUrl?: string; photoUrl: string }) {
  const [src, setSrc] = useState(thumbUrl ?? photoUrl);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a signed catalogue URL, not a static asset
    <img
      src={src}
      alt=""
      width={40}
      height={40}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (src !== photoUrl) setSrc(photoUrl);
      }}
      style={{ borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
    />
  );
}

/**
 * U1b · Swap picker: "Swap Bread (Lobels 700g) for", a search field, the venue's own live items (not the
 * line's own, nothing out of stock or still a draft) with "price · difference", a radio, then
 * "Swap for Bakers Inn 700g".
 */
export function SwapPicker({ item, onPick, onCancel }: { item: MerchantOrderItemView; onPick: (c: LineChange) => void; onCancel: () => void }) {
  const [dishes, setDishes] = useState<MerchantDishResponse[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    listDishes()
      .then((d) => alive && setDishes(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (dishes ?? []).filter((d) => !d.isDraft && !d.outOfStock && d.id !== item.dishId && (!needle || d.name.toLowerCase().includes(needle)));
  }, [dishes, q, item.dishId]);
  const pick = options.find((d) => d.id === chosen) ?? null;

  return (
    <div className="m-overlay" style={{ zIndex: 70 }}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label={OF.keep} onClick={onCancel} />
        <div className="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-swap-title" style={{ maxHeight: "85%", overflowY: "auto" }}>
          <div className="m-grab" />
          <b id="m-swap-title" style={{ fontSize: 19 }}>
            {OF.mPick(item.name)}
          </b>
          <label className="m-in">
            <Icon name="search" size={18} color="var(--muted)" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={OF.mSearch} aria-label={OF.mSearch} />
          </label>
          {failed && <div className="m-alert">Couldn’t load your items. Close and try again.</div>}
          {dishes === null && !failed && <div className="m-hint">Loading…</div>}
          <div role="radiogroup" aria-label={OF.mPick(item.name)}>
            {options.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={chosen === d.id}
                className="m-li"
                style={{ minHeight: 56, width: "100%", gap: 12 }}
                onClick={() => setChosen(d.id)}
              >
                {d.photoUrl ? (
                  <SwapThumb thumbUrl={d.thumbUrl} photoUrl={d.photoUrl} />
                ) : (
                  <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--surface)", flexShrink: 0 }} />
                )}
                <div className="m-t">
                  <b>{d.name}</b>
                  <span className="m-num">
                    {money(d.priceUsd)} · {priceDiff(item.priceUsd, d.priceUsd, OF.mSame)}
                  </span>
                </div>
                <span className="m-rad" style={chosen === d.id ? { border: "7px solid var(--accent)" } : undefined} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="m-btn"
            disabled={!pick}
            onClick={() => pick && onPick({ kind: "swap", dishId: pick.id, name: pick.name, priceUsd: pick.priceUsd })}
          >
            {pick ? OF.mSwapTo(pick.name) : OF.mSwap}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * U4a · "Change items" mid-prep: the same proposer in a sheet. "Send n changes to customer" opens the
 * customer's 3-minute round; cooking carries on (M2).
 */
export function ProposerSheet({
  order,
  busy,
  error,
  making,
  onSend,
  onCancel,
}: {
  order: MerchantOrderResponse;
  busy: boolean;
  error: string | null;
  making: string;
  onSend: (p: Proposer) => void;
  onCancel: () => void;
}) {
  const p = useProposer(order);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !p.picking) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, p.picking]);
  return (
    <div className="m-overlay" style={{ zIndex: 70 }}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label={OF.keep} onClick={onCancel} />
        <div className="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-items-title" style={{ maxHeight: "90%", overflowY: "auto" }}>
          <div className="m-grab" />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <b id="m-items-title" style={{ fontSize: 18 }}>
              {OF.changeItems}
            </b>
            <span className="m-hint" style={{ fontSize: 13 }}>
              {OF.mHint}
            </span>
          </div>
          <ProposerLines order={order} p={p} disabled={busy} />
          <ProposerTotal p={p} fallback={proposalTotals(order, {}).was} />
          {error && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
          <button type="button" className="m-btn" disabled={busy || p.count === 0} onClick={() => onSend(p)}>
            {OF.mSend(Math.max(1, p.count))}
          </button>
          {p.count > 0 && <span className="m-hint" style={{ textAlign: "center", fontSize: 13 }}>{OF.mSendHint(making)}</span>}
          <button type="button" className="m-lnk" onClick={onCancel}>
            {OF.keep}
          </button>
        </div>
      </div>
      {p.picking && <SwapPicker item={p.picking} onPick={(c) => p.set(p.picking!.itemId, c)} onCancel={() => p.setPicking(null)} />}
    </div>
  );
}
