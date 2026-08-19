import { tokens } from "@lynia/shared/tokens";
import { Tappable } from "../Tappable";
import React, { useState } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import { Card } from "../index";

/**
 * D4/R-09: the food delivery code. A WALLET order is already paid, so its code just shows (`masked`
 * false) — no gesture, matches a parcel's code card. A CASH order's code stays behind a deliberate
 * press-and-hold (`masked` true) even once it's fetched and cached — "no code to wave at the door
 * before paying." The reveal itself touches no network (it reads the already-cached `code` prop), so
 * it works exactly as well offline as online — that's what makes it the offline fallback too.
 */
export function DeliveryCodeCard({
  code,
  masked,
  unavailableHint,
  onReveal,
}: {
  code: string | null;
  masked: boolean;
  /** Shown in place of the code while `code` is still null (not yet eligible / not yet fetched). */
  unavailableHint: string;
  /** Fires once, the moment the customer actually reveals a masked code — the local half of R-09's
   *  "a deliberate act, logged and synced later" (no sync endpoint exists yet, see the D4 PR body). */
  onReveal?: () => void;
}): React.ReactElement {
  const [revealed, setRevealed] = useState(false);
  const showPlain = code != null && (!masked || revealed);

  const reveal = (): void => {
    if (!revealed) onReveal?.();
    setRevealed(true);
    AccessibilityInfo.announceForAccessibility("Delivery code revealed");
  };

  return (
    <Card style={{ alignItems: "center", backgroundColor: tokens.color.surface }}>
      <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>DELIVERY CODE</Text>
      {showPlain ? (
        <Text
          style={{ fontSize: 28, fontWeight: "700", letterSpacing: 6, color: tokens.color.ink, fontVariant: ["tabular-nums"], marginVertical: 4 }}
        >
          {code}
        </Text>
      ) : (
        <Tappable tone="icon"
          onLongPress={code != null ? reveal : undefined}
          disabled={code == null}
          accessibilityRole="button"
          accessibilityLabel={code != null ? "Press and hold to reveal the delivery code" : "Delivery code not available yet"}
          hitSlop={8}
          style={{ minHeight: tokens.touchTargetMin, justifyContent: "center", marginVertical: 4 }}
        >
          <Text style={{ fontSize: 28, fontWeight: "700", letterSpacing: 6, color: tokens.color.line, fontVariant: ["tabular-nums"] }}>
            ••• •••
          </Text>
        </Tappable>
      )}
      <View style={{ paddingHorizontal: 8 }}>
        <Text style={{ fontSize: 12, color: tokens.color.muted, textAlign: "center", lineHeight: 17 }}>
          {showPlain ? "Read this to your rider to finish." : code != null ? "Press and hold the code above to reveal it." : unavailableHint}
        </Text>
      </View>
    </Card>
  );
}
