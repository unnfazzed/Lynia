import { tokens } from "@lynia/shared";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import { Button, Card } from "../index";

// Rating-on-tap undo window (D3): how long a tapped rating stays cancellable before it commits.
const RATE_UNDO_MS = 4_000;

/**
 * "Rate your rider" card for a delivered order. Rating-on-tap (D3): a star tap arms the submit; a
 * short undo window lets the customer change or cancel before it commits (rating is terminal
 * server-side → completed, so we hold, not un-rate). `onRate` fires once the undo window lapses;
 * `saving` reflects the caller's in-flight rating mutation.
 */
export function RatingCard({ saving, onRate }: { saving: boolean; onRate: (score: number) => void }): React.ReactElement {
  const [score, setScore] = useState(5);
  const [ratePending, setRatePending] = useState(false);
  const rateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The armed-but-not-yet-committed score, and a ref to the latest onRate so the unmount cleanup (which
  // captures only the initial render) flushes the current values.
  const pendingScore = useRef<number | null>(null);
  const onRateRef = useRef(onRate);
  onRateRef.current = onRate;

  // Rating-on-tap handlers (D3). Tapping a star sets the score and (re)arms a short commit window;
  // Undo cancels it. On unmount we FLUSH a still-armed rating rather than drop it: the customer saw
  // "Submitting {n}★", so leaving the screen (e.g. "Back home") within the window must still submit the
  // rating they intended — only Undo cancels it. The rating is terminal server-side, so firing the
  // mutation from the queryClient after teardown is safe and fires at most once.
  useEffect(() => () => {
    if (rateTimer.current) {
      clearTimeout(rateTimer.current);
      if (pendingScore.current != null) onRateRef.current(pendingScore.current);
    }
  }, []);
  function tapStar(n: number) {
    setScore(n);
    if (rateTimer.current) clearTimeout(rateTimer.current);
    setRatePending(true);
    pendingScore.current = n;
    rateTimer.current = setTimeout(() => {
      rateTimer.current = null;
      pendingScore.current = null;
      setRatePending(false);
      onRate(n);
    }, RATE_UNDO_MS);
    AccessibilityInfo.announceForAccessibility(`${n} star${n === 1 ? "" : "s"} — submitting, tap Undo to change`);
  }
  function undoRate() {
    if (rateTimer.current) clearTimeout(rateTimer.current);
    rateTimer.current = null;
    pendingScore.current = null;
    setRatePending(false);
    AccessibilityInfo.announceForAccessibility("Rating cancelled");
  }

  return (
    <Card>
      <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: tokens.space.sm }}>Rate your rider</Text>
      <View style={{ flexDirection: "row", gap: 4, marginBottom: tokens.space.sm }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            testID={`rate-rider-${n}`}
            onPress={() => tapStar(n)}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${n} star${n === 1 ? "" : "s"}`}
            accessibilityState={{ selected: n <= score }}
            hitSlop={12}
            style={{ minWidth: tokens.touchTargetMin, minHeight: tokens.touchTargetMin, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 28, color: n <= score ? tokens.color.highlight : tokens.color.line }}>★</Text>
          </Pressable>
        ))}
      </View>
      {ratePending ? (
        // Tap-to-rate is armed: submitting shortly, still cancellable.
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 14, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>Submitting {score}★…</Text>
          <Button label="Undo" variant="ghost" onPress={undoRate} />
        </View>
      ) : saving ? (
        <Text style={{ fontSize: 14, color: tokens.color.muted }}>Saving your rating…</Text>
      ) : (
        <Text style={{ fontSize: 14, color: tokens.color.muted }}>Tap a star to rate</Text>
      )}
    </Card>
  );
}
