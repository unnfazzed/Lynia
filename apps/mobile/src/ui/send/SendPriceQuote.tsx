import { tokens } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import type { FareBand } from "../../logic/fare-band";
import { fareBandHint } from "../../logic/fare-band";
import { Button, Field } from "../index";

/**
 * RF-21: the "Price/quote" block of app/send.tsx, extracted verbatim (see
 * docs/RF-21-SEND-SCREEN.md). The suggested-fare preview + acceptance-band hint (once both pins are
 * set) above the name-your-price field, which carries its own below/far-above-band guidance.
 */
export function SendPriceQuote({
  quote,
  priceBand,
  belowBand,
  farAboveBand,
  proposedFare,
  onChangeProposedFare,
}: {
  quote: { distanceKm: number; suggestedFare: number } | null;
  priceBand: FareBand | null;
  belowBand: boolean;
  farAboveBand: boolean;
  proposedFare: string;
  onChangeProposedFare: (t: string) => void;
}): React.ReactElement {
  return (
    <>
      {quote ? (
        <View style={{ marginBottom: tokens.space.sm }}>
          <Text style={{ fontSize: 14, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
            Suggested fare ${quote.suggestedFare.toFixed(2)} · {quote.distanceKm} km
          </Text>
          {priceBand ? (
            // Soft acceptance band (guidance, never a hard floor) — anchors the customer away from an
            // unfillable lowball. "usually", not "must".
            <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 1, fontVariant: ["tabular-nums"] }}>{fareBandHint(priceBand)}</Text>
          ) : null}
          <Button label={`Use suggested $${quote.suggestedFare.toFixed(2)}`} variant="ghost" onPress={() => onChangeProposedFare(quote.suggestedFare.toFixed(2))} />
        </View>
      ) : null}
      <Field
        label="Your price (USD)"
        value={proposedFare}
        onChangeText={onChangeProposedFare}
        placeholder="2.50"
        keyboardType="decimal-pad"
        // Below the band is not an error (there's no hard floor) — a gentle hint that a low ask may
        // draw no riders. Far above the band nudges the "did you add a digit?" case. Both read as
        // guidance under the field, not a red validation failure. With no pins yet there's no quote to
        // show, so the kit's promise-of-a-suggestion line stands in (screens.jsx:189) rather than an
        // empty slot that reads as "name a number, good luck".
        hint={
          belowBand
            ? "That's below what riders usually take — they may pass. Nudge it up for a faster match."
            : farAboveBand
              ? "That's a lot more than usual for this trip — double-check you didn't add a digit by mistake."
              : quote == null
                ? "We'll suggest a fair price once your pins are set."
                : undefined
        }
      />
    </>
  );
}
