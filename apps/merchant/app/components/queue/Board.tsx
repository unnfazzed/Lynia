"use client";

import Link from "next/link";
import type { BoardCard as Card, BoardSection } from "../../lib/board";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { useNow } from "../../lib/use-now";
import { Icon } from "../icons";

/**
 * Merchant v2's Orders board (K1 / S1 — packages/design/handoff/merchant-v2, ledger D-77): one list
 * sorted by urgency, in labelled sections. The cards are lib/board's; this only draws them.
 */
export function Board({ sections }: { sections: readonly BoardSection[] }) {
  const ticking = sections.some((s) => s.cards.some((c) => c.subDeadline || c.chipDeadline));
  const now = useNow(ticking ? 1000 : 30_000);
  return (
    <div className="m-board">
      {sections.map((s) => (
        <section key={s.id} aria-label={s.heading} className="m-board-sec">
          <h2 className="m-bh">{s.heading}</h2>
          {s.cards.map((c) => (
            // T1b: the live bar opens the board at this order (`/queue#o-<id>`).
            <div key={c.key} id={`o-${c.key}`} className="m-banchor">
              <BoardCard card={c} now={now} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function Tag({ tag }: { tag: Card["tag"] }) {
  if (!tag) return null;
  return <span className={`m-tag${tag === "BOOKED" ? " m-booked" : ""}`}>{tag}</span>;
}

function Sub({ card, now }: { card: Card; now: number }) {
  if (!card.sub) return null;
  const left = card.subDeadline ? msUntil(card.subDeadline, now) : null;
  return (
    <span className={`m-bsub${card.subTone === "gold" ? " m-gold-ink" : ""}`}>
      {card.sub}
      {left !== null && left > 0 ? ` · ${formatCountdown(left)}` : ""}
    </span>
  );
}

/** K1b: "$12.00 · #A105" and its rider line; a late one is gold with a LATE chip and a Call pill. */
function CashCard({ card, now }: { card: Card; now: number }) {
  const late = card.cash!.late;
  const body = (
    <>
      <div className="m-bt">
        <b className="m-num">
          {card.title}
          {late && <span className="m-late">LATE</span>}
        </b>
        <Sub card={card} now={now} />
      </div>
      {!late && <Icon name="chevron-right" size={20} color="var(--muted)" />}
    </>
  );
  if (!late || !card.cash!.phone) {
    return (
      <Link href={card.href} className={`m-bc m-row m-cashrow${late ? " m-late-row" : ""}`}>
        {body}
      </Link>
    );
  }
  // A Call pill can't sit inside the row's link, so the row is the link and the pill sits beside it.
  return (
    <div className="m-bc m-row m-cashrow m-late-row">
      <Link href={card.href} className="m-cashlink">
        {body}
      </Link>
      <a className="m-callpill" href={`tel:${card.cash!.phone}`}>
        <Icon name="phone" size={16} /> Call
      </a>
    </div>
  );
}

function BoardCard({ card, now }: { card: Card; now: number }) {
  if (card.cash) return <CashCard card={card} now={now} />;
  const chipLeft = card.chipDeadline ? msUntil(card.chipDeadline, now) : null;
  const chip = chipLeft !== null && chipLeft > 0 ? <span className="m-cchip m-num">{formatCountdown(chipLeft)}</span> : null;
  const cls = `m-bc${card.urgent ? " m-urgent" : ""}`;

  if (card.counter) {
    return (
      <Link href={card.href} className={`${cls} m-row`}>
        <i className={card.arrived ? "m-disc" : "m-disc m-disc-quiet"}>
          <Icon name="bike" size={20} />
        </i>
        <div className="m-bt">
          <b>{card.title}</b>
          <Sub card={card} now={now} />
        </div>
        {/* A1: no button until the rider is here. */}
        {card.arrived && <span className="m-pillbtn">Hand over</span>}
      </Link>
    );
  }

  if (card.bar) {
    return (
      <Link href={card.href} className={cls}>
        <div className="m-btop">
          <Tag tag={card.tag} />
          <b>{card.title}</b>
          {card.right && <b className="m-num">{card.right}</b>}
          {chip}
        </div>
        {"fraction" in card.bar ? (
          <div className="m-pbar" aria-hidden="true">
            <i style={{ width: `${Math.round(card.bar.fraction * 100)}%` }} />
          </div>
        ) : (
          <div className="m-steps" aria-label={`${card.bar.steps} of 5 steps`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} className={i < (card.bar as { steps: number }).steps ? "m-on" : undefined} />
            ))}
          </div>
        )}
        <Sub card={card} now={now} />
      </Link>
    );
  }

  return (
    <Link href={card.href} className={`${cls} m-row`}>
      <Tag tag={card.tag} />
      <div className="m-bt">
        <b>{card.title}</b>
        <Sub card={card} now={now} />
      </div>
      {card.right && <b className="m-num">{card.right}</b>}
      {chip}
      {card.chevron && <Icon name="chevron-right" size={20} color="var(--muted)" />}
    </Link>
  );
}
