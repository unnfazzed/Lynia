import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Text, View, type ViewStyle } from "react-native";
import { Icon } from "../Icon";
import { useReduceMotion } from "../useReduceMotion";
import { KY } from "./copy";
import { ListCard, ListRow } from "./lists";

/**
 * Step markers, the phone-settings steps and the KYC checklist (README §1 "Step markers", `fr-kit.js`
 * `.stp` / `steps()` / `kyc()`, ledger D-82). Markers are 28: done = brand fill + white 16 check; open =
 * a 1.5 `line` ring with a 13/700 numeral; next = the same ring in brand green; active = a 3 mint ring
 * with a brand top arc, spinning at 1s linear.
 */

/** The active ring (`.stp.a`): a `width`-wide mint ring with a brand top arc, one turn per second. */
export function Spinner({ size = 28, width = 3, testID }: { size?: number; width?: number; testID?: string }): React.ReactElement {
  const reduceMotion = useReduceMotion();
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: width,
        borderColor: tokens.color.accentWash,
        borderTopColor: tokens.color.accent,
        transform: [{ rotate }],
      }}
    />
  );
}

export type StepState = "done" | "open" | "next" | "active";

/** One 28 step marker. `n` is the numeral an open/next marker shows. */
export function StepMarker({ state, n }: { state: StepState; n?: number }): React.ReactElement {
  if (state === "active") return <Spinner testID="step-active" />;
  if (state === "done") {
    return (
      <View testID="step-done" style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
        <Icon name="check" size={16} color={tokens.color.onAccent} />
      </View>
    );
  }
  const next = state === "next";
  return (
    <View
      testID={next ? "step-next" : "step-open"}
      style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: next ? tokens.color.accent : tokens.color.line, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: next ? tokens.color.accentText : tokens.color.muted, fontVariant: ["tabular-nums"] }}>{n ?? ""}</Text>
    </View>
  );
}

export interface StepItem {
  label: string;
  state?: StepState;
  /** Trailing meta ("Done", "In review", "~2 min"). */
  value?: string;
  valueOk?: boolean;
}

/** A list card of numbered steps (`steps()` and the settings steps). Open markers by default. */
export function StepList({ steps, style, testID }: { steps: readonly (StepItem | string)[]; style?: ViewStyle; testID?: string }): React.ReactElement {
  return (
    <ListCard testID={testID} style={{ marginTop: 16, ...style }}>
      {steps.map((raw, i) => {
        const s: StepItem = typeof raw === "string" ? { label: raw } : raw;
        const state = s.state ?? "open";
        return (
          <ListRow
            key={s.label}
            leading={<StepMarker state={state} n={i + 1} />}
            title={s.label}
            titleColor={state === "active" ? tokens.color.accentText : undefined}
            value={s.value}
            valueOk={s.valueOk}
            accessibilityLabel={`${i + 1}. ${s.label}${s.value ? `, ${s.value}` : ""}`}
          />
        );
      })}
    </ListCard>
  );
}

/**
 * The three "Open phone settings" steps (PC5, P6, P11, P12). `shakeKey` — bump it to shake the card
 * (P6 "I've turned it on" while the permission is still off); the shake is skipped under reduce motion.
 */
export function SystemSettingsSteps({ steps, shakeKey = 0, style }: { steps: readonly [string, string, string]; shakeKey?: number; style?: ViewStyle }): React.ReactElement {
  const reduceMotion = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!shakeKey || reduceMotion) return;
    x.setValue(0);
    Animated.sequence([8, -8, 6, -6, 3, 0].map((v) => Animated.timing(x, { toValue: v, duration: 50, useNativeDriver: true }))).start();
  }, [shakeKey, reduceMotion, x]);
  return (
    <Animated.View style={{ transform: [{ translateX: x }] }}>
      <StepList testID="settings-steps" steps={steps} style={style} />
    </Animated.View>
  );
}

/**
 * The 3-step ID-check checklist (`kyc(st, label)`): 1 Your account (done) · 2 ID check · 3 Go online.
 * `step2`: `active` (spinning, green title, `label` muted on the right), `next` (green ring + numeral,
 * `label` on the right), `done` (check, "Done" in green).
 */
export function KycChecklist({ step2, label, style }: { step2: "active" | "next" | "done"; label?: string; style?: ViewStyle }): React.ReactElement {
  const s2: StepItem = step2 === "done" ? { label: KY.s2, state: "done", value: KY.done, valueOk: true } : { label: KY.s2, state: step2, value: label };
  return <StepList testID="kyc-checklist" style={{ marginTop: 20, ...style }} steps={[{ label: KY.s1, state: "done", value: KY.done, valueOk: true }, s2, { label: KY.s3 }]} />;
}
