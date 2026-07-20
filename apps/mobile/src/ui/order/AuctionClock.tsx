import { tokens } from "@lynia/shared";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Text, View } from "react-native";
import { auctionHeaderText, formatClock, spokenRemaining } from "../../logic/order-labels";

/** Last-20s window: the clock crossfades muted → amber-urgency and the parent surfaces its
 *  pre-dead-end recovery affordance (via onUrgentChange). */
export const URGENT_MS = 20_000;

/**
 * PERF20-02: the auction header + 1s countdown, extracted so the per-second tick re-renders THIS
 * small row instead of the entire ~1200-line order screen. A screen-level `remainingMs` state used to
 * re-render every bid card, sort chip and animation once per second for the whole ~90s auction on the
 * exact low-end-Android JS thread the highest-stakes tap (Choose) competes with — the same
 * anti-pattern the rider board already fixed by moving its ticker inside SentOfferCard (see
 * rider/index.tsx "The 1s countdown clock itself lives INSIDE each SentOfferCard (PERF)").
 *
 * The parent hears only THRESHOLD CROSSINGS, each at most once per mount:
 *  - `onUrgentChange(true)` when the clock enters the last {@link URGENT_MS} (drives the parent's
 *    "Raise price & send again" pre-surface), and `onUrgentChange(false)` on unmount/reset;
 *  - `onZero()` once when the countdown hits 0:00 — the JOURNEY-BUGS nudge that refetches the
 *    snapshot immediately instead of letting the screen sit on "Finding riders…" for up to a poll
 *    interval.
 * SR announcements (60s/30s/closing) fire once each from in here, exactly as before.
 *
 * Mounted only inside the `open_for_offers` render branch, and the PARENT keys it by orderId — a
 * rider-bail rebroadcast navigates to a NEW order id on the SAME screen instance, and the remount
 * both resets the fired-once thresholds and re-arms the callbacks for the new auction.
 *
 * Freeze semantics are unchanged: while the socket is down after having been live (`frozen`) the
 * interval stops and the last value holds with the paused dot — we can't trust wall-clock drift vs.
 * the server mid-reconnect.
 */
export function AuctionClock(props: {
  /** Server auction deadline (ISO), or null while unknown — renders the header without a clock. */
  expiresAt: string | null;
  frozen: boolean;
  reduceMotion: boolean;
  reconnecting: boolean;
  bidCount: number;
  noRiders: boolean;
  onUrgentChange: (urgent: boolean) => void;
  onZero: () => void;
  /** SR announcer — injectable for tests; production always uses the AccessibilityInfo default. */
  announce?: (msg: string) => void;
}): React.ReactElement {
  const { expiresAt, frozen, reduceMotion, reconnecting, bidCount, noRiders, onUrgentChange, onZero } = props;
  const announce = props.announce ?? AccessibilityInfo.announceForAccessibility;
  const announceRef = useRef(announce);
  announceRef.current = announce;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  // Hold the latest callbacks in refs so the ticking/threshold effects never re-subscribe (and never
  // demand referentially-stable props from the 1200-line parent).
  const onUrgentRef = useRef(onUrgentChange);
  onUrgentRef.current = onUrgentChange;
  const onZeroRef = useRef(onZero);
  onZeroRef.current = onZero;

  useEffect(() => {
    if (expiresAt == null) {
      setRemainingMs(null);
      return;
    }
    const end = new Date(expiresAt).getTime();
    const compute = () => setRemainingMs(Math.max(0, end - Date.now()));
    compute();
    if (frozen) return; // hold the last value; don't advance a clock we can't trust
    const iv = setInterval(compute, 1000);
    return () => clearInterval(iv);
  }, [expiresAt, frozen]);

  // SR thresholds fire once each (not a per-second live region, which is unusable). Keyed lifetime =
  // this mount = one auction (parent keys by orderId).
  const firedThresholds = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (remainingMs == null) return;
    const fire = (key: number, msg: string) => {
      if (remainingMs <= key && !firedThresholds.current.has(key)) {
        firedThresholds.current.add(key);
        announceRef.current(msg);
      }
    };
    fire(60_000, "Offer window: 1 minute left");
    fire(30_000, "Offer window: 30 seconds left");
    fire(0, "Offer window closing");
    if (remainingMs <= 0 && !firedThresholds.current.has(-1)) {
      firedThresholds.current.add(-1);
      onZeroRef.current();
    }
  }, [remainingMs]);

  // Amber-urgency colour crossfade over the last 20s (instant under reduce-motion), plus the one-shot
  // parent signal. onUrgentChange(false) on unmount so the parent's affordance can never outlive the
  // auction that armed it.
  const urgent = remainingMs != null && remainingMs <= URGENT_MS;
  const urgencyAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    onUrgentRef.current(urgent);
    const to = urgent ? 1 : 0;
    if (reduceMotion) {
      urgencyAnim.setValue(to);
      return;
    }
    Animated.timing(urgencyAnim, { toValue: to, duration: 200, useNativeDriver: false }).start();
  }, [urgent, reduceMotion, urgencyAnim]);
  useEffect(() => () => onUrgentRef.current(false), []);

  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: tokens.space.lg }}>
      <Text style={{ flex: 1, fontSize: 14, color: tokens.color.muted }}>
        {auctionHeaderText({ remainingMs, bidCount, noRiders, reconnecting })}
      </Text>
      {remainingMs != null ? (
        <Animated.Text
          accessibilityLabel={spokenRemaining(remainingMs)}
          style={{
            fontSize: 14,
            fontVariant: ["tabular-nums"],
            fontWeight: urgent ? "700" : "400",
            color: urgencyAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [tokens.color.muted, tokens.color.danger],
            }),
          }}
        >
          {formatClock(remainingMs)}
          {frozen ? " ·" : ""}
        </Animated.Text>
      ) : null}
    </View>
  );
}
