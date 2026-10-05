"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { alarmOrders } from "../../lib/alarm";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { liveBar, type LiveBarView } from "../../lib/orders-view";
import { useNow } from "../../lib/use-now";
import { useQueuePoll } from "../../lib/use-queue-poll";
import { useVocabulary } from "../../lib/vocabulary";
import { Icon } from "../icons";
import { useKitchenConnection } from "../KitchenConnectionProvider";

/**
 * T1 · the live bar (Merchant v2, packages/design/handoff/merchant-v2, ledger D-77): on every tab but
 * Orders, a dark bar floats 12px above the tab bar while an order needs the merchant or is live, so a
 * rider at the counter is never hidden. Tapping it opens that order. It reads the same queue poll as
 * the Orders home, and rings the alarm for a new order the way the Orders home does.
 */
export function LiveBar({ onShown }: { onShown?: (shown: boolean) => void }) {
  const { alarm } = useKitchenConnection();
  const v = useVocabulary();
  const { orders } = useQueuePoll(true);
  const view = liveBar(orders, v);
  const ringing = alarmOrders(orders).length;

  // Silence only what this bar started: Account's "Test the alarm" rings with nothing waiting.
  const rang = useRef(false);
  useEffect(() => {
    if (ringing > 0) {
      rang.current = true;
      alarm.ring();
    } else if (rang.current) {
      rang.current = false;
      alarm.silence();
    }
  }, [ringing, alarm]);

  useEffect(() => {
    onShown?.(view !== null);
  }, [view, onShown]);

  if (!view) return null;
  return <LiveBarLink view={view} />;
}

/** T1b: the sun-gold ringing bar, or the dark bar with its leading mark; a live countdown where drawn. */
function LiveBarLink({ view }: { view: LiveBarView }) {
  const now = useNow(view.deadline ? 1000 : 60_000);
  const left = view.deadline ? Math.max(0, msUntil(view.deadline, now)) : null;
  const title = view.kind === "waiting" && left !== null ? `${view.title} · ${formatCountdown(left)}` : view.title;
  const sub = view.kind === "ringing" && left !== null ? `${view.sub} · ${formatCountdown(left)} to answer` : view.sub;
  return (
    <Link href={view.href} className="m-live" data-kind={view.kind} aria-label={[title, sub].filter(Boolean).join(" · ")}>
      {view.kind === "ringing" ? <Icon name="volume-2" size={20} /> : <i aria-hidden="true" />}
      <div>
        <b className="m-num">{title}</b>
        {sub && <span className="m-num">{sub}</span>}
      </div>
      <Icon name="chevron-right" size={20} />
    </Link>
  );
}
