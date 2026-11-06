/**
 * Delivery ceiling v1 (ledger D-125, `packages/design/handoff/delivery-ceiling-v1/`): the customer-side parts.
 *
 * - `DeliveryCeilingCard` — R1c / R1c-low / R1c-high / R1c-max: the DELIVERY card on Review & place.
 * - `CeilingStepper` — the full-width "− $3.00 +" pill (Review, and the T11c raise bar).
 * - `AtMost` — an amount followed by "at most" 13/600 muted ("Ceiling value in rows").
 * - `SearchingRow` (T4u), `DoorAmountRow` (T6p), `RaiseCard` + `RaiseBar` (T11c).
 *
 * Specs come from the handoff README "Specs for new parts"; every string from `DC` (`ceiling-copy.ts`).
 */
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View, type TextStyle } from "react-native";
import { formatMoney } from "../../logic/money";
import { TABULAR } from "../browse/kit";
import { Icon } from "../Icon";
import { Tappable } from "../Tappable";
import { DC } from "./ceiling-copy";
import { ofFmt } from "./copy";

const LABEL: TextStyle = { fontSize: 12, fontWeight: tokens.font.weight.bold, letterSpacing: 0.84, color: tokens.color.muted, textTransform: "uppercase" };

/** "$3.00 at most": the amount in the row's own weight, a 4px gap, then "at most" 13/600 muted. */
export function AtMost({ amount, style }: { amount: number; style: TextStyle }): React.ReactElement {
  const [, suffix] = ofFmt(DC.r.feeUpTo, { p: "\u0000" }).split("\u0000");
  return (
    <Text style={{ textAlign: "right" }}>
      <Text style={{ ...style, ...TABULAR }}>{formatMoney(amount)}</Text>
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{suffix}</Text>
    </Text>
  );
}

/** One 44 white circle of the stepper; disabled = no fill, idle icon, `aria-disabled`. */
function StepButton({ kind, disabled, label, onPress }: { kind: "minus" | "plus"; disabled: boolean; label: string; onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      tone="icon"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{
        width: tokens.touchTargetMin,
        height: tokens.touchTargetMin,
        borderRadius: tokens.radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: disabled ? "transparent" : tokens.color.bg,
        borderWidth: disabled ? 0 : 1,
        borderColor: tokens.color.line,
      }}
    >
      <Icon name={kind} size={20} color={disabled ? tokens.color.illusIdleMid : tokens.color.accentText} />
    </Tappable>
  );
}

/** The kit stepper surface at full width, 56 tall: two 44 circles with the amount between them. */
export function CeilingStepper({
  value,
  min,
  max,
  onChange,
  size = 26,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  /** 26 on Review, 22 in the raise bar. */
  size?: number;
}): React.ReactElement {
  const atMin = Math.round(value * 100) <= Math.round(min * 100);
  const atMax = Math.round(value * 100) >= Math.round(max * 100);
  const step = (dir: 1 | -1): void => {
    const next = Math.round(value * 100 + dir * 50) / 100;
    onChange(Math.min(max, Math.max(min, next)));
  };
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 6,
        borderRadius: tokens.radius.pill,
        backgroundColor: tokens.color.surface,
      }}
    >
      <StepButton kind="minus" disabled={atMin} label={atMin ? ofFmt(DC.r.lowest, { p: formatMoney(min) }) : DC.r.lower} onPress={() => step(-1)} />
      <Text accessibilityLiveRegion="polite" style={{ fontSize: size, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>
        {formatMoney(value)}
      </Text>
      <StepButton kind="plus" disabled={atMax} label={atMax ? ofFmt(DC.r.highest, { p: formatMoney(max) }) : DC.r.raise} onPress={() => step(1)} />
    </View>
  );
}

/** R1c: the DELIVERY card, between "Note for the biker" and Pay. */
export function DeliveryCeilingCard({
  km,
  recommended,
  ceiling,
  min,
  max,
  onChange,
}: {
  km: number | null;
  recommended: number;
  ceiling: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}): React.ReactElement {
  const below = Math.round(ceiling * 100) < Math.round(recommended * 100);
  return (
    <View style={{ backgroundColor: tokens.color.bg, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, gap: 6 }}>
      <View style={{ minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={LABEL}>{DC.r.dlv}</Text>
        {km != null ? (
          <Text numberOfLines={1} style={{ fontSize: 13, color: tokens.color.muted, ...TABULAR }}>
            {ofFmt(DC.r.trip, { km: km.toFixed(1) })}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{DC.r.rec}</Text>
        <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{formatMoney(recommended)}</Text>
      </View>
      {below ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Icon name="clock" size={16} color={tokens.color.muted} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{DC.r.slow}</Text>
        </View>
      ) : null}
      <View style={{ height: 1, backgroundColor: tokens.color.line, marginTop: 6, marginBottom: 4 }} />
      <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{DC.r.upTo}</Text>
      <CeilingStepper value={ceiling} min={min} max={max} onChange={onChange} />
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: tokens.color.accentWash }}>
        <Icon name="shield-check" size={18} color={tokens.color.accentText} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: 13, lineHeight: 18.85, color: tokens.color.ink }}>{DC.r.promise}</Text>
      </View>
    </View>
  );
}

/** T4u: "Delivery $3.00 at most · finding a lower price" under the prep bar. */
export function SearchingRow({ ceiling }: { ceiling: number }): React.ReactElement {
  return (
    <View style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: tokens.color.surface }}>
      <Icon name="bike" size={18} color={tokens.color.accentText} />
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 19.6, color: tokens.color.ink }}>
        <Text style={{ fontWeight: tokens.font.weight.bold, ...TABULAR }}>{ofFmt(DC.t.searching, { d: formatMoney(ceiling) })}</Text>
        <Text style={{ color: tokens.color.muted }}>{` · ${DC.t.searchingSub}`}</Text>
      </Text>
    </View>
  );
}

/** T6p / T6p-same: "Have $69.50 ready" · "Delivery $2.50 · you saved $0.50". */
export function DoorAmountRow({ due, delivery, saved }: { due: number; delivery: number; saved: number | null }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: tokens.color.accentWash }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}>
        <Icon name="banknote" size={20} color={tokens.color.accentText} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{ofFmt(DC.t.payReady, { p: formatMoney(due) })}</Text>
        <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.ink, ...TABULAR }}>
          {ofFmt(DC.t.payFee, { d: formatMoney(delivery) })}
          {saved != null && saved > 0 ? (
            <Text style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{` · ${ofFmt(DC.t.saved, { s: formatMoney(saved) })}`}</Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
}

/** T11c: the 2px accent card, "Raise to $3.50?". */
export function RaiseCard({ next }: { next: number }): React.ReactElement {
  return (
    <View style={{ padding: 14, gap: 4, borderRadius: 16, borderWidth: 2, borderColor: tokens.color.accent, backgroundColor: tokens.color.bg }}>
      <Text style={{ fontSize: 18, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{ofFmt(DC.t.raiseT, { d: formatMoney(next) })}</Text>
      <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{DC.t.raiseSub}</Text>
    </View>
  );
}

/** T11c's pinned bar body: label row, the stepper (22), the 52 primary and the 48 "Keep waiting". */
export function RaiseBarBody({
  value,
  min,
  max,
  totalAtMost,
  onChange,
  primary,
  secondary,
}: {
  value: number;
  min: number;
  max: number;
  totalAtMost: number;
  onChange: (next: number) => void;
  primary: React.ReactNode;
  secondary: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: 8 }}>
        <Text style={LABEL}>{DC.t.raiseNew}</Text>
        <Text style={{ fontSize: 13, color: tokens.color.muted, ...TABULAR }}>{ofFmt(DC.t.raiseTotal, { p: formatMoney(totalAtMost) })}</Text>
      </View>
      <CeilingStepper value={value} min={min} max={max} onChange={onChange} size={22} />
      {primary}
      {secondary}
    </View>
  );
}
