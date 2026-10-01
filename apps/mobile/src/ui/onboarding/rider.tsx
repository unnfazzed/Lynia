import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ScooterRiderArt } from "../art/ScooterRiderArt";
import { TrustVerifiedArt } from "../art/TrustVerifiedArt";
import { Icon } from "../Icon";
import { RO } from "./copy";
import { Cta, GhostButton, H1, Note, OnbScreen, Pad } from "./kit";

/**
 * Calm Mint v2 rider onboarding (`packages/design/handoff/calm-mint-v2-2026-10` README §4,
 * `shared.js` `O.rider` / `O.pending`, `mint2.js` `OB.verified`; ledger D-55). R1 is the first page of
 * `app/rider/become.tsx`; R2 and R3 take the job board's place while the ID check runs and the first
 * time the rider comes back verified. Every measurement is the handoff's; zero shadows.
 */

/** The steps row divider the handoff draws as a literal (`.st` border, `#f0f2f4`). */
const STEP_DIVIDER = "#F0F2F4";
/** The unlit step number ring (`.st > span` border, `#c9d0d6`). */
const STEP_RING = "#C9D0D6";

type StepState = "done" | "now" | "todo";
export type ChecklistStep = { label: string; meta: string; state: StepState; n?: number };

/** `.steps` — a bordered card of rows: a 22px state mark, the label, the meta on the right. */
export function Checklist({ steps }: { steps: readonly ChecklistStep[] }): React.ReactElement {
  return (
    <View style={{ marginVertical: 12, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 16, paddingVertical: 2, paddingHorizontal: 12 }}>
      {steps.map((s, i) => (
        <View
          key={s.label}
          accessible
          accessibilityLabel={`${s.label}, ${s.meta}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: i === steps.length - 1 ? 0 : 1, borderBottomColor: STEP_DIVIDER }}
        >
          {s.state === "done" ? (
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
              <Icon name="check" size={14} color={tokens.color.onAccent} />
            </View>
          ) : s.state === "now" ? (
            <ActivityIndicator size="small" color={tokens.color.accent} style={{ width: 22, height: 22 }} />
          ) : (
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: STEP_RING, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{s.n ?? i + 1}</Text>
            </View>
          )}
          <Text style={{ flex: 1, fontSize: 14, fontWeight: tokens.font.weight.bold, color: s.state === "now" ? tokens.color.accentText : tokens.color.ink }}>{s.label}</Text>
          <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: s.state === "done" ? tokens.color.accentText : tokens.color.muted, fontVariant: ["tabular-nums"] }}>{s.meta}</Text>
        </View>
      ))}
    </View>
  );
}

/** R1's hero panel: inset 12px, radius 28, `--rider-wash`, 210 tall, the scooter art with 20px clear below. */
const R1_HERO_H = 210;
const R1_ART = 170;

/**
 * R1 · Why ride + what you need. `freeJobs` shows the note's "No top-up to start…" sentences — only
 * once the backend has a free-jobs rule (D-55: the handoff marks it NEEDS BACKEND); until then the note
 * says what is true today.
 */
export function RiderIntro({ onStart, busy = false, freeJobs = false }: { onStart: () => void; busy?: boolean; freeJobs?: boolean }): React.ReactElement {
  return (
    <OnbScreen padTop={0} footer={<Cta label={RO.startIdCheck} onPress={onStart} busy={busy} />}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ marginHorizontal: 12, marginTop: 12, height: R1_HERO_H, borderRadius: 28, backgroundColor: tokens.color.riderWash, overflow: "hidden", alignItems: "center", justifyContent: "flex-end" }}
      >
        <View style={{ marginBottom: 20 }}>
          <ScooterRiderArt width={R1_ART} />
        </View>
      </View>
      <Pad style={{ paddingTop: 16 }}>
        <H1 size={24} accent={RO.h1Accent} accentColor={tokens.color.free}>
          {RO.h1}
        </H1>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 12 }}>
          {RO.chips.map((c) => (
            <View key={c} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.accentWash }}>
              <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{c}</Text>
            </View>
          ))}
        </View>
        <Checklist
          steps={[
            { label: RO.stepAccount, meta: RO.done, state: "done" },
            { label: RO.stepId, meta: RO.stepIdTime, state: "todo", n: 2 },
            { label: RO.stepPhoto, meta: RO.stepPhotoTime, state: "todo", n: 3 },
          ]}
        />
        <Note icon="wallet">{freeJobs ? `${RO.noteFree} ${RO.notePapers}` : RO.notePapers}</Note>
      </Pad>
    </OnbScreen>
  );
}

/** R2 · ID pending — safe to leave; reopening the app lands here until the check resolves. */
export function RiderSetupPending({ onSendParcel }: { onSendParcel: () => void }): React.ReactElement {
  return (
    <OnbScreen footer={<GhostButton label={RO.sendWhileWait} onPress={onSendParcel} />}>
      <Pad>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text accessibilityRole="header" style={{ fontSize: 24, lineHeight: 27.6, letterSpacing: -0.4, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
            {RO.setupTitle}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.highlightChipWash }}>
            <Icon name="clock" size={14} color={tokens.color.highlightChipInk} />
            <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.highlightChipInk }}>{RO.checking}</Text>
          </View>
        </View>
        <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: tokens.color.accentWash }}>
          <View accessibilityElementsHidden importantForAccessibility="no">
            <TrustVerifiedArt width={72} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{RO.diditChecking}</Text>
            <Text style={{ marginTop: 4, fontSize: 15, lineHeight: 21.75, color: tokens.color.muted }}>{RO.diditCheckingB}</Text>
          </View>
        </View>
        <Checklist
          steps={[
            { label: RO.stepAccount, meta: RO.done, state: "done" },
            { label: RO.stepPhotoShort, meta: RO.done, state: "done" },
            { label: RO.stepIdShort, meta: RO.inReview, state: "now" },
            { label: RO.stepGoOnline, meta: RO.next, state: "todo", n: 4 },
          ]}
        />
        <Text style={{ fontSize: 13, lineHeight: 18.85, color: tokens.color.muted }}>{RO.fixNote}</Text>
      </Pad>
    </OnbScreen>
  );
}

/**
 * R3 · Verified — shown once. The "Commission-free jobs N of 5 left" card is drawn only when the
 * backend reports a free-jobs allowance (`freeJobs`; D-55, NEEDS BACKEND · free-jobs rule).
 */
export function RiderVerified({
  firstName,
  freeJobs = null,
  onGoOnline,
  onPapers,
}: {
  firstName: string | null;
  freeJobs?: { left: number; total: number } | null;
  onGoOnline: () => void;
  onPapers: () => void;
}): React.ReactElement {
  return (
    <OnbScreen
      footer={
        <>
          <Cta label={RO.goOnline} icon="power" onPress={onGoOnline} />
          <Text accessibilityRole="link" onPress={onPapers} style={{ textAlign: "center", fontSize: 13, lineHeight: 24, color: tokens.color.muted }}>
            {RO.papersLater}
          </Text>
        </>
      }
    >
      <Pad>
        <View style={{ marginTop: 8, padding: 18, borderRadius: 20, backgroundColor: tokens.color.accentWash, alignItems: "center" }}>
          <View accessibilityElementsHidden importantForAccessibility="no">
            <TrustVerifiedArt width={144} />
          </View>
          <Text accessibilityRole="header" style={{ marginTop: 6, textAlign: "center", fontSize: 24, letterSpacing: -0.4, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
            {RO.verifiedTitle(firstName)}
          </Text>
          <Text style={{ marginTop: 6, textAlign: "center", fontSize: 14, lineHeight: 20.3, color: tokens.color.muted }}>{RO.verifiedSub}</Text>
        </View>
        {freeJobs ? (
          <View style={{ marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: tokens.color.line }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>Commission-free jobs</Text>
              <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>
                {`${freeJobs.left} of ${freeJobs.total} left`}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 10, marginBottom: 6 }}>
              {Array.from({ length: freeJobs.total }, (_, k) => (
                <View key={k} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: k < freeJobs.left ? tokens.color.accent : tokens.color.tileSend }} />
              ))}
            </View>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: tokens.color.muted }}>
              After these, commission comes off a prepaid balance. We{"’"}ll remind you before you need to top up.
            </Text>
          </View>
        ) : null}
      </Pad>
    </OnbScreen>
  );
}
