import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SIGNUP_ITEMS, type DeclineKind, type SignupItem } from "../../../logic/biker-signup";
import { Icon, type IconName } from "../../Icon";
import { Tappable } from "../../Tappable";
import { ExitButton, PinnedFooter } from "../../firstrun/actions";
import { Body, HeroDisc, HeroPanel, SplitTitle } from "../../firstrun/hero";
import { ListCard, ListRow } from "../../firstrun/lists";
import { useFirstRunMetrics } from "../../firstrun/metrics";
import { FirstRunScreen } from "../../firstrun/screen";
import { StepMarker } from "../../firstrun/steps";
import { KS } from "../signup-copy";

/**
 * Biker sign-up v1 (packages/design/handoff/biker-signup-v1, ledger D-135) — the parts the flow and the board
 * share, built from First Run v2 (README §4): the step header, the step hero, the five-step list and the three
 * board pages (K0 / B-todo-half / B-decl-*). B-wait is F1 exactly as shipped (IdCheckOutcome).
 */

/** README §4 "Step hero": the shell hero at 168 (124 at 320, 136 at font scale 1.3). */
export function useStepHeroHeight(): number {
  const m = useFirstRunMetrics();
  return m.compact ? 124 : m.largeFont ? 136 : 168;
}

export const STEP_LABEL: Record<SignupItem, string> = { idNumber: KS.st1, idFront: KS.st2, licenceNumber: KS.st3, licence: KS.st4, selfieId: KS.st5 };

/**
 * README §4 "Step header": 56 tall, 24 below the status bar (20 at 320). A 44 back (`surface`), N bars 6dp
 * radius 3 gap 4 (brand for done/current, `line` for open), the label 14/600 muted, a 44 ✕.
 */
export function StepHeader({ filled, total, label, onBack, onClose }: { filled: number; total: number; label: string; onBack: () => void; onClose: () => void }): React.ReactElement {
  const insets = useSafeAreaInsets();
  const m = useFirstRunMetrics();
  const round = { width: tokens.touchTargetMin, height: tokens.touchTargetMin, borderRadius: tokens.touchTargetMin / 2, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" } as const;
  return (
    <View style={{ paddingTop: insets.top + (m.compact ? 20 : 24), backgroundColor: tokens.color.bg }}>
      <View testID="step-header" style={{ height: 56, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12 }}>
        <Tappable testID="step-back" tone="icon" onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={round}>
          <Icon name="chevron-left" size={24} color={tokens.color.ink} />
        </Tappable>
        <View accessible accessibilityLabel={label} style={{ flex: 1, minWidth: 0, flexDirection: "row", gap: 4 }}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} testID={i < filled ? "step-bar-done" : "step-bar-open"} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < filled ? tokens.color.accent : tokens.color.line }} />
          ))}
        </View>
        <Text testID="step-label" numberOfLines={1} style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>
          {label}
        </Text>
        <Tappable testID="step-close" tone="icon" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={round}>
          <Icon name="x" size={20} color={tokens.color.ink} />
        </Tappable>
      </View>
    </View>
  );
}

/** One row of the five-step list: d = done (check), o = open numeral, n = next (green numeral), bad = to redo. */
export type FiveStepState = { k: "d" | "o" | "n" | "bad"; value?: string };

function BadMarker(): React.ReactElement {
  return (
    <View testID="step-bad" style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name="circle-alert" size={16} color={tokens.color.dangerInk} />
    </View>
  );
}

/** `list4` — the five steps as a compact list card (48 rows, not tappable). */
export function FiveSteps({ states, style }: { states: readonly FiveStepState[]; style?: ViewStyle }): React.ReactElement {
  return (
    <ListCard testID="five-steps" style={{ marginTop: 16, ...style }}>
      {SIGNUP_ITEMS.map((item, i) => {
        const s = states[i] ?? { k: "o" };
        const marker = s.k === "d" ? <StepMarker state="done" /> : s.k === "bad" ? <BadMarker /> : <StepMarker state={s.k === "n" ? "next" : "open"} n={i + 1} />;
        return (
          <ListRow
            key={item}
            testID={`five-step-${item}`}
            leading={marker}
            title={STEP_LABEL[item]}
            titleColor={s.k === "n" ? tokens.color.accentText : undefined}
            danger={s.k === "bad"}
            minHeight={48}
            right={
              s.value ? (
                <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: s.k === "bad" ? tokens.color.dangerInk : s.k === "d" ? tokens.color.accentText : tokens.color.muted }}>{s.value}</Text>
              ) : undefined
            }
            accessibilityLabel={`${i + 1}. ${STEP_LABEL[item]}${s.value ? `, ${s.value}` : ""}`}
          />
        );
      })}
    </ListCard>
  );
}

/** K0 — "Become a biker in 5 steps": the sign-up's first page, and the board before anything is sent. */
export function SignupIntroPage({ onExit, onStart, testID = "signup-intro" }: { onExit: () => void; onStart: () => void; testID?: string }): React.ReactElement {
  const h = useStepHeroHeight();
  return (
    <FirstRunScreen testID={testID} footer={<PinnedFooter primary={{ label: KS.start, icon: "arrow-right", onPress: onStart, testID: "signup-start" }} />}>
      <HeroPanel height={h} topLeft={<ExitButton onPress={onExit} />}>
        <HeroDisc icon="id-card" />
      </HeroPanel>
      <SplitTitle a={KS.introA} b={KS.introB} />
      <Body>{KS.introBody}</Body>
      <FiveSteps states={[{ k: "n" }, { k: "o" }, { k: "o" }, { k: "o" }, { k: "o" }]} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, marginHorizontal: 4 }}>
        <Icon name="lock" size={16} color={tokens.color.muted} />
        <Text style={{ flex: 1, fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{KS.privacy}</Text>
      </View>
    </FirstRunScreen>
  );
}

/** B-todo-half — some steps sent; "Continue" resumes at the first open one. */
export function SignupHalfPage({
  firstName,
  done,
  onExit,
  onContinue,
}: {
  firstName: string | null | undefined;
  done: Record<SignupItem, boolean>;
  onExit: () => void;
  onContinue: () => void;
}): React.ReactElement {
  const h = useStepHeroHeight();
  const count = SIGNUP_ITEMS.filter((i) => done[i]).length;
  const next = SIGNUP_ITEMS.find((i) => !done[i]);
  const name = firstName?.trim() ?? "";
  return (
    <FirstRunScreen testID="signup-half" footer={<PinnedFooter primary={{ label: KS.cont, icon: "arrow-right", onPress: onContinue, testID: "signup-continue" }} />}>
      <HeroPanel height={h} topLeft={<ExitButton onPress={onExit} />}>
        <HeroDisc icon="id-card" />
      </HeroPanel>
      <SplitTitle a={name ? KS.halfA : KS.halfA.replace(/,\s*$/, "")} b={name} />
      {/* The drawn "2 of 5 done" with this biker's own count. */}
      <Body>{KS.halfBody.replace(/^\d+/, String(count))}</Body>
      <FiveSteps states={SIGNUP_ITEMS.map((i) => (done[i] ? { k: "d", value: KS.doneTag } : i === next ? { k: "n", value: KS.nextTag } : { k: "o" }))} />
    </FirstRunScreen>
  );
}

const DECLINE: Record<DeclineKind, { icon: IconName; a: string; b: string; body: string; cta: string }> = {
  photo: { icon: "camera", a: KS.dPhotoA, b: KS.dPhotoB, body: KS.dPhotoBody, cta: KS.dPhotoCta },
  licence: { icon: "id-card", a: KS.dLicA, b: KS.dLicB, body: KS.dLicBody, cta: KS.dLicCta },
  selfie: { icon: "user", a: KS.dSelA, b: KS.dSelB, body: KS.dSelBody, cta: KS.dSelCta },
};

/** B-decl-* — the danger hero, the reason, the five steps with only the bad ones in a danger row ("Redo"). */
export function SignupDeclinedPage({
  decline,
  items,
  onExit,
  onFix,
  onHelp,
}: {
  decline: DeclineKind;
  items: readonly SignupItem[];
  onExit: () => void;
  onFix: () => void;
  onHelp: () => void;
}): React.ReactElement {
  const h = useStepHeroHeight();
  const d = DECLINE[decline];
  return (
    <FirstRunScreen
      testID={`signup-declined-${decline}`}
      footer={<PinnedFooter primary={{ label: d.cta, icon: "camera", onPress: onFix, testID: "signup-fix" }} link={{ label: KS.help, icon: "message-circle", onPress: onHelp, testID: "signup-help" }} />}
    >
      <HeroPanel tone="danger" height={h} topLeft={<ExitButton onPress={onExit} />}>
        <HeroDisc icon={d.icon} />
      </HeroPanel>
      <SplitTitle a={d.a} b={d.b} tone="danger" />
      <Body>{d.body}</Body>
      <FiveSteps states={SIGNUP_ITEMS.map((i) => (items.includes(i) ? { k: "bad", value: KS.redo } : { k: "d", value: KS.ok }))} />
    </FirstRunScreen>
  );
}
