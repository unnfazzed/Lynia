import { tokens } from "@lynia/shared/tokens";
import React, { useRef, useState } from "react";
import { Text, TextInput, useWindowDimensions, View } from "react-native";
import { type FareBand, fareBandHint } from "../../logic/fare-band";
import { bandScaleMax, trackPos } from "../../logic/send-steps";
import { Icon } from "../Icon";
import { Tappable } from "../Tappable";
import { Notice, SEND_COPY, SendButton } from "./kit";

/**
 * Step 3 · Price (ledger D-52; handoff states 10–12). The fare is the screen's one big decision, so it
 * is the biggest thing on it: a 56px number (48 under 340px) the customer can tap to type, − / + $0.50
 * buttons, and a band bar that places their number against what riders usually accept. Both warnings
 * are soft — Review stays enabled for any price above zero.
 */
export function SendPriceStep(props: {
  priceText: string;
  onChangePriceText: (t: string) => void;
  onStep: (dir: 1 | -1) => void;
  price: number | null;
  band: FareBand | null;
  km: string | null;
  below: boolean;
  farAbove: boolean;
}): React.ReactElement {
  const { width } = useWindowDimensions();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const big = width < 340 ? 48 : 56;
  const max = props.band ? bandScaleMax(props.band.high) : 6;
  return (
    <View>
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, lineHeight: 18, marginBottom: 6 }}>
          {SEND_COPY.yourPrice}
        </Text>
        <Tappable
          onPress={() => input.current?.focus()}
          accessibilityRole="none"
          style={{ alignItems: "center", paddingHorizontal: 12, paddingVertical: 2, borderRadius: tokens.radius.input }}
        >
          {/* The number is drawn as text (the handoff's 56px figure over a dashed underline); a transparent
              decimal-pad input sits exactly over it, so tapping the figure types into it. */}
          <View>
            <Text
              importantForAccessibility="no-hide-descendants"
              style={{
                fontSize: big,
                lineHeight: Math.round(big * 1.15),
                fontWeight: tokens.font.weight.bold,
                letterSpacing: -1,
                color: tokens.color.ink,
                fontVariant: ["tabular-nums"],
                borderBottomWidth: 2,
                borderStyle: "dashed",
                borderBottomColor: focused ? tokens.color.accentText : tokens.color.line,
              }}
            >
              {`$${props.priceText || "0.00"}`}
            </Text>
            <TextInput
              ref={input}
              value={props.priceText}
              onChangeText={props.onChangePriceText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              keyboardType="decimal-pad"
              accessibilityLabel={`${SEND_COPY.yourPrice} in US dollars`}
              selectTextOnFocus
              caretHidden
              maxLength={7}
              style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: 0, fontSize: big }}
            />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
            <Icon name="pencil" size={12} color={tokens.color.muted} />
            <Text style={{ fontSize: 12, color: tokens.color.muted }}>{SEND_COPY.tapType}</Text>
          </View>
        </Tappable>
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 14, marginBottom: 18 }}>
        <View style={{ flex: 1 }}>
          <SendButton ghost label={SEND_COPY.minus} onPress={() => props.onStep(-1)} />
        </View>
        <View style={{ flex: 1 }}>
          <SendButton ghost label={SEND_COPY.plus} onPress={() => props.onStep(1)} />
        </View>
      </View>
      {props.band ? (
        <>
          <View
            accessible
            accessibilityLabel={`${fareBandHint(props.band)}. Your price ${props.price != null ? `$${props.price.toFixed(2)}` : "not set"}.`}
            style={{ height: 8, backgroundColor: tokens.color.line, borderRadius: 4, marginHorizontal: 6, marginBottom: 12 }}
          >
            <View
              style={{
                position: "absolute",
                left: `${trackPos(props.band.low, max) * 100}%`,
                width: `${(trackPos(props.band.high, max) - trackPos(props.band.low, max)) * 100}%`,
                top: 0,
                bottom: 0,
                backgroundColor: tokens.color.accent,
                borderRadius: 4,
              }}
            />
            {props.price != null ? (
              <View
                style={{
                  position: "absolute",
                  left: `${trackPos(props.price, max) * 100}%`,
                  top: -5,
                  marginLeft: -9,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: tokens.color.ink,
                  borderWidth: 3,
                  borderColor: tokens.color.bg,
                  ...tokens.shadow.card,
                }}
              />
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{fareBandHint(props.band)}</Text>
            {props.km ? <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{props.km}</Text> : null}
          </View>
        </>
      ) : null}
      {props.below ? <Notice icon="triangle-alert" tone="warn" text={SEND_COPY.low} style={{ marginBottom: 12 }} /> : null}
      {props.farAbove ? <Notice icon="triangle-alert" tone="warn" text={SEND_COPY.high} style={{ marginBottom: 12 }} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="banknote" size={18} color={tokens.color.accentText} />
        <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{SEND_COPY.cash}</Text>
      </View>
    </View>
  );
}
