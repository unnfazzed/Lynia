"use client";

import Link from "next/link";
import { useEffect } from "react";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { liveBar, type LiveBarView } from "../../lib/orders-view";
import { useNow } from "../../lib/use-now";
import { useVocabulary } from "../../lib/vocabulary";
import { Icon } from "../icons";
import { useKitchenConnection } from "../KitchenConnectionProvider";

/**
 * T1 · the live bar (Merchant v2, packages/design/handoff/merchant-v2, ledger D-77): on every tab but
 * Orders, a dark bar floats 12px above the tab bar while an order needs the merchant or is live, so a
 * rider at the counter is never hidden. Tapping it opens that order. It reads the shell's one queue poll
 * (C20, `KitchenConnectionProvider`) — the same copy as the Orders home; the alarm and the ringing screen
 * are the shell's, so this bar neither polls nor rings by itself any more.
 */
export function LiveBar({ onShown }: { onShown?: (shown: boolean) => void }) {
  const { queue } = useKitchenConnection();
  const v = useVocabulary();
  const view = liveBar(queue.orders, v);

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
