import { tokens } from "@lynia/shared/tokens";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Text, TextInput, useWindowDimensions, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { useReduceMotion } from "../useReduceMotion";
import { CtaBar, CtaButton, IconDisc, OrderToast, SmBtn } from "../order/kit";
import { OrderHeader } from "../order/panels";
import { OrderSheet, PeekMark } from "../order/OrderSheet";
import { Dot, Sq } from "../send/kit";
import { RIDER_COPY as R } from "./copy";
import { MSheet, RCard, RRow } from "./kit";

/**
 * Rider v2 active job (ledger D-54, handoff § 2 · Active job): the rider-side mirror of After Send.
 * JobShell = AHeader (stage title + Help) · a full-bleed JobMap · a sheet sized to its content · the CTA
 * bar with one primary. Both the parcel and the food job screens render through it.
 */

const TABULAR = { fontVariant: ["tabular-nums" as const] };

export interface JobToast {
  text: string;
  icon?: IconName;
  action?: string;
  onAction?: () => void;
}

/** The shell: header, map (given the sheet's visible height), sheet, CTA bar, toast, overlays. */
export function JobShell({
  title,
  help = true,
  onBack,
  onHelp,
  map,
  content,
  bar,
  contentKey,
  toast,
  overlays,
}: {
  title: string;
  help?: boolean;
  onBack: () => void;
  onHelp: () => void;
  map: (padBottom: number) => React.ReactNode;
  content: React.ReactNode;
  bar: React.ReactNode;
  contentKey: string;
  toast?: JobToast | null;
  overlays?: React.ReactNode;
}): React.ReactElement {
  const reduceMotion = useReduceMotion();
  const { height: winH } = useWindowDimensions();
  const [areaH, setAreaH] = useState(0);
  const [ctaH, setCtaH] = useState(0);
  const [visible, setVisible] = useState(0);
  // Until the area is measured, estimate it (screen minus the header) so the sheet draws on frame one.
  const area = areaH || Math.max(0, winH - 80);
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <OrderHeader title={title} help={help} onBack={onBack} onHelp={onHelp} />
      <View testID="rider-job-area" style={{ flex: 1 }} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
        {map(visible || Math.round(area * 0.5))}
        {area > 0 ? (
          <OrderSheet areaHeight={area} fallbackShare={0.45} floor={0} bottomInset={bar ? ctaH : 0} contentKey={contentKey} reduceMotion={reduceMotion} onVisibleHeight={setVisible}>
            {content}
            <PeekMark />
          </OrderSheet>
        ) : null}
        {bar ? (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 25 }} onLayout={(e) => setCtaH(e.nativeEvent.layout.height)}>
            {bar}
          </View>
        ) : null}
        {toast ? (
          <View style={{ position: "absolute", left: 12, right: 12, bottom: (bar ? ctaH : 0) + 10, zIndex: 35 }}>
            <OrderToast text={toast.text} icon={toast.icon} action={toast.action} onAction={toast.onAction} />
          </View>
        ) : null}
      </View>
      {overlays}
    </SafeAreaView>
  );
}

/** A full screen with the header, a body and the CTA bar — code entry, done, terminals, return the cash. */
export function JobPage({
  title,
  help,
  onBack,
  onHelp,
  children,
  bar,
  centred,
  toast,
  overlays,
}: {
  title: string;
  help?: boolean;
  onBack: () => void;
  onHelp?: () => void;
  children: React.ReactNode;
  bar: React.ReactNode;
  centred?: boolean;
  toast?: JobToast | null;
  overlays?: React.ReactNode;
}): React.ReactElement {
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <OrderHeader title={title} help={!!help} onBack={onBack} onHelp={onHelp ?? (() => undefined)} />
      <View style={{ flex: 1 }}>
        {centred ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 }}>{children}</View>
        ) : (
          <View style={{ flex: 1, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>{children}</View>
        )}
        {toast ? (
          <View style={{ position: "absolute", left: 12, right: 12, bottom: 10, zIndex: 35 }}>
            <OrderToast text={toast.text} icon={toast.icon} action={toast.action} onAction={toast.onAction} />
          </View>
        ) : null}
      </View>
      {bar}
      {overlays}
    </SafeAreaView>
  );
}

/** Rider step track: Pickup · Collected · Drop-off · Done (done / current with halo / upcoming). */
export function RSteps({ cur, labels = [R.stPickup, R.stCollected, R.stDrop, R.stDone] }: { cur: number; labels?: readonly string[] }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row" }} accessible accessibilityLabel={`Step ${cur + 1} of ${labels.length}, ${labels[cur]}`}>
      {labels.map((label, i) => {
        const done = i < cur;
        const now = i === cur;
        return (
          <View key={label} style={{ flex: 1, alignItems: "center", gap: 4, minWidth: 0 }}>
            {i > 0 ? <View style={{ position: "absolute", top: 8, left: 0, right: "50%", height: 3, backgroundColor: i <= cur ? tokens.color.accentText : tokens.color.line }} /> : null}
            {i < labels.length - 1 ? <View style={{ position: "absolute", top: 8, left: "50%", right: 0, height: 3, backgroundColor: i < cur ? tokens.color.accentText : tokens.color.line }} /> : null}
            <View style={{ width: now ? 28 : 20, height: now ? 28 : 20, marginTop: now ? -4 : 0, marginBottom: now ? -4 : 0, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: now ? tokens.color.accentWash : "transparent" }}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: done || now ? tokens.color.accentText : tokens.color.surface,
                  borderWidth: done || now ? 0 : 1,
                  borderColor: tokens.color.line,
                }}
              >
                {done ? (
                  <Icon name="check" size={12} color={tokens.color.onAccent} strokeWidth={3} />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, color: now ? tokens.color.onAccent : tokens.color.muted }}>{i + 1}</Text>
                )}
              </View>
            </View>
            <Text
              numberOfLines={2}
              style={{ textAlign: "center", paddingHorizontal: 3, fontSize: 12, lineHeight: 16, fontWeight: now ? tokens.font.weight.bold : tokens.font.weight.semibold, color: now ? tokens.color.ink : done ? tokens.color.accentText : tokens.color.muted }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** The current stop: marker + PICKUP / DROP-OFF (· FOOD), name 20/700, distance or "You're here", who, Call · WhatsApp · Navigate. */
export function StopCard({
  drop,
  food,
  name,
  line,
  here,
  who,
  onCall,
  onWhatsApp,
  onNavigate,
}: {
  drop?: boolean;
  food?: boolean;
  name: string;
  line?: string | null;
  here?: boolean;
  who?: string | null;
  onCall?: (() => void) | null;
  onWhatsApp?: (() => void) | null;
  onNavigate?: (() => void) | null;
}): React.ReactElement {
  const label = `${drop ? R.dropL : R.pickupL}${food ? ` · ${R.food}` : ""}`;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ paddingTop: 3 }}>{drop ? <Sq size={14} /> : <Dot size={14} />}</View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.bold, letterSpacing: 0.5, color: tokens.color.muted }}>{label}</Text>
          <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{name}</Text>
          {here ? (
            <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{R.here}</Text>
          ) : line ? (
            <Text style={{ fontSize: 14, color: tokens.color.muted, ...TABULAR }}>{line}</Text>
          ) : null}
        </View>
      </View>
      {who ? <Text style={{ fontSize: 13, color: tokens.color.muted, marginTop: 4 }}>{who}</Text> : null}
      {onCall || onWhatsApp || (onNavigate && !here) ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {onCall ? <SmBtn flex={1} label={R.call} icon="phone" onPress={onCall} /> : null}
          {onWhatsApp ? <SmBtn flex={1} label={R.whatsapp} icon="message-circle" onPress={onWhatsApp} /> : null}
          {onNavigate && !here ? <SmBtn flex={1} label={R.navigate} icon="navigation" onPress={onNavigate} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** "Problem with this job?" — a 1px line above a centred 44 row. */
export function ProblemLink({ onPress }: { onPress: () => void }): React.ReactElement {
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: tokens.color.line }}>
      <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={R.problem} style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Icon name="circle-alert" size={16} color={tokens.color.muted} />
        <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{R.problem}</Text>
        <Icon name="chevron-right" size={16} color={tokens.color.muted} />
      </Tappable>
    </View>
  );
}

/** A tick row for one pickup item (26px box). */
export function ItemTick({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 12, paddingHorizontal: 12 }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: on ? tokens.color.accentText : tokens.color.bg,
          borderWidth: on ? 0 : 2,
          borderColor: tokens.color.line,
        }}
      >
        {on ? <Icon name="check" size={16} color={tokens.color.onAccent} strokeWidth={3} /> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{label}</Text>
    </Tappable>
  );
}

/** The pickup-photo row: 56 thumb + "Take a pickup photo" / "Photo saved" + Take photo / Retake. */
export function PhotoRow({ saved, thumb, onTake }: { saved: boolean; thumb?: React.ReactNode; onTake: () => void }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 12, padding: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 8, overflow: "hidden", backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
        {saved && thumb ? thumb : <Icon name={saved ? "image" : "camera"} size={22} color={tokens.color.muted} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{saved ? R.photoSaved : R.photoNeed}</Text>
        <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted }}>{R.photoNeedB}</Text>
      </View>
      <SmBtn label={saved ? R.retake : R.takePhoto} icon="camera" kind={saved ? "ghost" : "fill"} onPress={onTake} />
    </View>
  );
}

/**
 * The 6-digit delivery code: boxes 3 + 3 (an extra 8 before box 4), 42 × 56 (36 × 50 under 340dp), the
 * focused box ringed with a caret; error = every box danger; locked = surface boxes with a lock. The OS
 * number pad types into one hidden input, so the code is always a string.
 */
export function CodeBoxes({ value, onChange, error, locked, autoFocus = true, length = 6, label = R.codeL }: { value: string; onChange: (v: string) => void; error?: boolean; locked?: boolean; autoFocus?: boolean; length?: 4 | 6; label?: string }): React.ReactElement {
  const narrow = useWindowDimensions().width < 340;
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const w = narrow ? 36 : 42;
  const h = narrow ? 50 : 56;
  return (
    <Tappable tone="icon" disabled={locked} onPress={() => ref.current?.focus()} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: "center" }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {Array.from({ length }, (_, i) => i).map((i) => {
          const ch = value[i] ?? "";
          const isFocus = focused && !locked && i === Math.min(value.length, length - 1);
          return (
            <View
              key={i}
              style={{
                width: w,
                height: h,
                marginLeft: length === 6 && i === 3 ? 8 : 0,
                borderRadius: 10,
                borderWidth: error || isFocus ? 2 : 1.5,
                borderColor: error ? tokens.color.danger : isFocus ? tokens.color.accentText : tokens.color.line,
                backgroundColor: locked ? tokens.color.surface : tokens.color.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {locked ? (
                <Icon name="lock" size={16} color={tokens.color.muted} />
              ) : ch ? (
                <Text style={{ fontSize: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{ch}</Text>
              ) : isFocus ? (
                <View style={{ width: 2, height: 26, backgroundColor: tokens.color.accentText }} />
              ) : null}
            </View>
          );
        })}
      </View>
      {locked ? null : (
        <TextInput
          ref={ref}
          value={value}
          onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, length))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          maxLength={length}
          caretHidden
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.011, fontSize: 16 }}
        />
      )}
    </Tappable>
  );
}

/** the wrong-code line — 13/600 danger, centred. */
export function CodeError({ text }: { text: string }): React.ReactElement {
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center" }}>
      <Icon name="circle-alert" size={14} color={tokens.color.danger} />
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.danger }}>{text}</Text>
    </View>
  );
}

/** Title 20/700 + muted 14 body (the code page and the can't-reach sheet). */
export function JobTitle({ title, body }: { title: string; body?: string }): React.ReactElement {
  return (
    <View style={{ gap: 6 }}>
      <Text accessibilityRole="header" style={{ fontSize: 20, lineHeight: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{title}</Text>
      {body ? <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.color.muted }}>{body}</Text> : null}
    </View>
  );
}

/** Key / value row (the done page). */
export function KV({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: 36 }}>
      <Text style={{ flex: 1, fontSize: 14, color: tokens.color.muted }}>{k}</Text>
      <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{v}</Text>
    </View>
  );
}

/** Centred terminal body: 72 disc, title, body, an optional ShieldCheck note. */
export function TerminalBody({ icon, tone, title, body, note, children }: { icon: IconName; tone?: "calm" | "ok" | "danger"; title: string; body?: string; note?: string; children?: React.ReactNode }): React.ReactElement {
  return (
    <>
      <IconDisc name={icon} tone={tone} size={72} />
      <Text accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "center" }}>{title}</Text>
      {body ? <Text style={{ fontSize: 15, lineHeight: 22, color: tokens.color.muted, textAlign: "center" }}>{body}</Text> : null}
      {note ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="shield-check" size={16} color={tokens.color.accentText} />
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{note}</Text>
        </View>
      ) : null}
      {children}
    </>
  );
}

/** A waiting line: spinner 14 + text 13. */
export function WaitLine({ text }: { text: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
      <ActivityIndicator size="small" color={tokens.color.accentText} />
      <Text style={{ fontSize: 13, color: tokens.color.ink }}>{text}</Text>
    </View>
  );
}

/**
 * X1 / X2 — "What's wrong?" (also the header's Help). Before pickup: Cancel this job (parcel) / Drop this
 * job (food); after: Can't reach the customer · Can't deliver. Then Get help · Report · the 999 row · Close.
 */
export function ProblemSheet({
  visible,
  onClose,
  beforePickup,
  food,
  onCancel,
  onReach,
  onDeliver,
  onHelp,
  onReport,
  onSos,
}: {
  visible: boolean;
  onClose: () => void;
  beforePickup: boolean;
  food?: boolean;
  onCancel?: (() => void) | null;
  onReach?: (() => void) | null;
  onDeliver?: (() => void) | null;
  onHelp: () => void;
  onReport: () => void;
  onSos: () => void;
}): React.ReactElement {
  const rows: { icon: IconName; label: string; sub: string; onPress: () => void }[] = [];
  if (beforePickup && onCancel) rows.push({ icon: "x", label: food ? R.pDrop : R.pCancel, sub: food ? R.pDropS : R.pCancelS, onPress: onCancel });
  if (!beforePickup && onReach) rows.push({ icon: "phone-off", label: R.pReach, sub: R.pReachS, onPress: onReach });
  if (!beforePickup && onDeliver) rows.push({ icon: "package", label: R.pDeliver, sub: R.pDeliverS, onPress: onDeliver });
  rows.push({ icon: "message-circle", label: R.pHelp, sub: R.pHelpS, onPress: onHelp });
  rows.push({ icon: "triangle-alert", label: R.pReport, sub: R.pReportS, onPress: onReport });
  return (
    <MSheet visible={visible} onClose={onClose} title={R.probT} body={R.probSub} buttons={<CtaGhost label={R.close} onPress={onClose} />}>
      <RCard>
        {rows.map((r, i) => (
          <RRow key={r.label} first={i === 0} icon={r.icon} label={r.label} sub={r.sub} onPress={r.onPress} />
        ))}
      </RCard>
      <Tappable
        onPress={onSos}
        accessibilityRole="button"
        accessibilityLabel={`${R.sos} ${R.sosS}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, backgroundColor: tokens.color.dangerWash, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 }}
      >
        <Icon name="siren" size={22} color={tokens.color.dangerInk} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.dangerInk }}>{R.sos}</Text>
          <Text style={{ fontSize: 12, color: tokens.color.dangerInk }}>{R.sosS}</Text>
        </View>
        <Icon name="chevron-right" size={18} color={tokens.color.dangerInk} />
      </Tappable>
    </MSheet>
  );
}

/** The 52 ghost button inside a sheet (re-exported shape of CtaButton ghost, kept local for sheets). */
function CtaGhost({ label, onPress }: { label: string; onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ minHeight: 52, borderRadius: tokens.radius.pill, borderWidth: 1.5, borderColor: tokens.color.line, alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.bg }}
    >
      <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{label}</Text>
    </Tappable>
  );
}

/** X13 — Call 999? A danger-filled 52 "📞 Call 999" + ghost "Not now". */
export function SosSheet({ visible, onClose, onCall }: { visible: boolean; onClose: () => void; onCall: () => void }): React.ReactElement {
  return (
    <MSheet
      visible={visible}
      onClose={onClose}
      icon="siren"
      iconTone="danger"
      title={R.sosT}
      body={R.sosB}
      buttons={
        <>
          <Tappable
            tone="onDark"
            onPress={onCall}
            accessibilityRole="button"
            accessibilityLabel={R.sosCall}
            style={{ minHeight: 52, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.danger, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Icon name="phone" size={18} color={tokens.color.onAccent} />
            <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent }}>{R.sosCall}</Text>
          </Tappable>
          <CtaGhost label={R.sosCancel} onPress={onClose} />
        </>
      }
    />
  );
}

/** The danger-wash warning box (X7). */
export function DangerNote({ text, style }: { text: string; style?: ViewStyle }): React.ReactElement {
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: tokens.color.dangerWash, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", gap: 10, ...style }}>
      <Icon name="triangle-alert" size={18} color={tokens.color.dangerInk} />
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, fontWeight: tokens.font.weight.semibold, color: tokens.color.dangerInk }}>{text}</Text>
    </View>
  );
}

/** A4 / A5 — the shot on ink, "✓ Use this photo" (spinner "Saving photo…") + ghost "Retake". */
export function PhotoPreview({ uri, saving, onUse, onRetake, onClose }: { uri: string | null; saving: boolean; onUse: () => void; onRetake: () => void; onClose: () => void }): React.ReactElement {
  return (
    <Modal visible={uri != null} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <OrderHeader title={R.tPhoto} help={false} onBack={onClose} onHelp={() => undefined} />
        <View style={{ flex: 1, backgroundColor: tokens.color.ink, alignItems: "center", justifyContent: "center" }}>
          {uri ? <Image source={{ uri }} accessibilityLabel={R.tPhoto} resizeMode="contain" style={{ width: "100%", height: "100%" }} /> : null}
        </View>
        <CtaBar>
          <CtaButton label={saving ? R.photoUploading : R.usePhoto} icon="check" loading={saving} onPress={onUse} />
          <CtaButton ghost label={R.retake} icon="camera" disabled={saving} onPress={onRetake} />
        </CtaBar>
      </SafeAreaView>
    </Modal>
  );
}

export { CtaBar, CtaButton };
