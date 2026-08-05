import { tokens } from "@lynia/shared";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { Card, Icon } from "../index";

/** mm:ss for the offer-sent auction countdown. */
function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * One sent offer on the rider board, with its own live "customer's window closes in" countdown (C2)
 * and the distinct taken / expired resolutions (3·b1 / C2).
 *
 * PERF: the 1s countdown clock used to live at screen level (`nowMs` state in rider/index.tsx), so
 * every tick re-rendered the ENTIRE board — every open-order card, the gates, the compose card — for
 * the whole length of any auction the rider had bid into. The ticker now lives HERE: each card
 * advances its own clock, so a tick repaints only the sent-offer cards, and it stops dead the moment
 * the card resolves (taken/expired flip the countdown row to static copy — nothing left to count).
 * `React.memo` closes the other direction: unrelated board churn (new orders streaming in, gate/state
 * flips) re-renders the screen but leaves these cards alone, since every prop is a primitive.
 */
export const SentOfferCard = React.memo(function SentOfferCard(props: {
  pickupLandmark: string;
  dropoffLandmark: string;
  /** The fare the rider offered, as typed (string — same as the compose field). */
  fare: string;
  etaMinutes: number;
  /** ISO auction close — createdAt + OFFER_WINDOW_MS, the same window the customer sees. */
  expiresAt: string;
  /** A customer picked SOMEONE ELSE (board.takenOrderIds) — wins over `expired` if both arrive. */
  taken: boolean;
  /** The auction closed with nobody picked (board.expiredOrderIds). */
  expired: boolean;
}): React.ReactElement {
  const live = !props.taken && !props.expired;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const remaining = new Date(props.expiresAt).getTime() - nowMs;
  // Self-heal a card whose resolving push was missed (e.g. the app was in a dead zone at the exact
  // moment `bid:expired`/`order:taken` fired — reconnect only re-fetches the open-orders list, not
  // this in-memory resolution state). Once we're a grace window (~10s, for server-side expiry lag)
  // past the shared auction close and still nominally "live" per props, treat it as resolved LOCALLY
  // and swap the dead "0:00" countdown for a neutral close message instead of counting forever.
  const staleClosed = live && remaining < -10_000;
  // Tick a 1s clock only while this offer is still counting down — a resolved card (taken/expired, or
  // the local stale-close fallback) renders static copy, so keeping a timer running for it would be
  // pure waste on the low-end devices this app targets.
  useEffect(() => {
    if (!live || staleClosed) return;
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [live, staleClosed]);

  return (
    <Card>
      <Text style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
        {props.pickupLandmark} → {props.dropoffLandmark}
      </Text>
      <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
        Your offer {formatMoney(props.fare)} · ETA {props.etaMinutes} min
      </Text>
      {props.taken ? (
        // Not chosen (3·b1): someone else was picked. Never framed as failure — the
        // rider is still online and first in line for the next one.
        <View style={{ flexDirection: "row", gap: tokens.space.sm, marginTop: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface }}>
          <Icon name="user" size={16} color={tokens.color.muted} />
          <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
            Not this time — the customer picked another rider. It happens; you&apos;re still online and first in line for the next one.
          </Text>
        </View>
      ) : props.expired ? (
        // Distinct from "not chosen": the whole auction closed with nobody picked (C2).
        <View style={{ flexDirection: "row", gap: tokens.space.sm, marginTop: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface }}>
          <Icon name="inbox" size={16} color={tokens.color.muted} />
          <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
            That window closed — the customer&apos;s auction ended with nobody picked. If they re-broadcast at a new price, it&apos;ll show up here as a fresh order.
          </Text>
        </View>
      ) : staleClosed ? (
        // Local fallback: the countdown ran out but no resolving push arrived (missed while offline).
        // Don't sit frozen at "0:00" as if still live — say the window has closed and point at where a
        // win would show up, so the card is never a dead end.
        <View style={{ flexDirection: "row", gap: tokens.space.sm, marginTop: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface }}>
          <Icon name="clock" size={16} color={tokens.color.muted} />
          <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
            That window has closed. If you were picked, the job will appear under Active job.
          </Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginTop: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface }}>
            <Text style={{ flex: 1, fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>Customer&apos;s window closes in</Text>
            <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatClock(remaining)}</Text>
          </View>
          {/* The one-round rule, said while it still matters (kit `rider-screens.jsx` OfferSent) —
              otherwise a rider watching the clock wonders whether to re-bid lower. */}
          <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18, marginTop: tokens.space.xs }}>
            One offer per order — yours stays live at this price until the window closes, even if a counter is declined.
          </Text>
        </>
      )}
    </Card>
  );
});
