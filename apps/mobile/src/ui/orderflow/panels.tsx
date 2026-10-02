import { tokens } from "@lynia/shared/tokens";
import React, { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { O, ofFmt } from "./copy";
import { ALPHA, Btn, Chips, Mut, StageTitle } from "./kit";

/**
 * The order screen's modal sheets for a merchant order (Order flow v2.1, ledger D-59; `of-screens-rt.js`
 * `cxSheet` / `helpSheet` / `reportSheet`): T15 cancel, T16a Get help and T16b Report a problem. A scrim,
 * a white r20 sheet with the 28 grabber row, padding 16, a 12 gap. The order keeps going underneath.
 */

const C = tokens.color;

function ModalSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: ALPHA.scrim }}>
        <Tappable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel={O.c.close} />
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          <View style={{ height: 28, alignItems: "center", justifyContent: "center", marginHorizontal: -16 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.line }} />
          </View>
          {children}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * T15a/c — "Cancel this order?": free before the rider collects; a reason (optional); Cancel order / Keep
 * order. T15b — after collection (`full`): the full-cost line and "Cancel and pay $X".
 */
export function CancelSheet({
  visible,
  venue,
  busy,
  onCancel,
  onKeep,
  full,
}: {
  visible: boolean;
  venue: string;
  busy: boolean;
  /** After collection: the full-cost sentence and the amount. */
  full?: { text: string; amount: string } | null;
  onCancel: (reason: string | undefined) => void;
  onKeep: () => void;
}): React.ReactElement {
  const [reason, setReason] = useState<number | null>(null);
  return (
    <ModalSheet visible={visible} onClose={onKeep}>
      <StageTitle>{O.t.cxT}</StageTitle>
      <Mut size={14}>{full ? full.text : ofFmt(O.t.cxFree, { v: venue })}</Mut>
      <Text style={{ fontSize: 13, fontWeight: "600", color: C.muted }}>{O.t.cxReason}</Text>
      <Chips list={O.t.cxR} on={reason == null ? [] : [reason]} onToggle={(i) => setReason((c) => (c === i ? null : i))} />
      <Btn kind="danger" label={busy ? O.t.cxBusy : full ? ofFmt(O.t.cxYesFull, { p: full.amount }) : O.t.cxYes} loading={busy} onPress={() => onCancel(reason == null ? undefined : O.t.cxR[reason])} />
      <Btn kind="ghost" label={O.t.cxKeep} onPress={onKeep} disabled={busy} />
    </ModalSheet>
  );
}

function HelpRow({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }): React.ReactElement {
  return (
    <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: C.surface }}>
      <Icon name={icon} size={20} color={C.accentText} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: C.ink }}>{title}</Text>
        <Mut>{sub}</Mut>
      </View>
      <Icon name="chevron-right" size={18} color={C.muted} />
    </Tappable>
  );
}

/** T16a — Get help: WhatsApp LyniaGo · Report a problem · Call the venue · Emergency (danger wash) · Close. */
export function HelpSheet({
  visible,
  venue,
  venuePhone,
  onWhatsApp,
  onReport,
  onCallVenue,
  onEmergency,
  onClose,
}: {
  visible: boolean;
  venue: string;
  venuePhone: string | null;
  onWhatsApp: (() => void) | null;
  onReport: () => void;
  onCallVenue: () => void;
  onEmergency: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <ModalSheet visible={visible} onClose={onClose}>
      <View>
        <StageTitle>{O.t.helpT}</StageTitle>
        <Mut>{O.t.helpSub}</Mut>
      </View>
      <View>
        {onWhatsApp ? <HelpRow icon="message-circle" title={O.t.hWa} sub={O.t.hWaSub} onPress={onWhatsApp} /> : null}
        <HelpRow icon="circle-alert" title={O.t.hReport} sub={O.t.hReportSub} onPress={onReport} />
        {venuePhone ? <HelpRow icon="phone" title={ofFmt(O.t.hCallV, { v: venue })} sub={ofFmt(O.t.hCallVSub, { ph: venuePhone })} onPress={onCallVenue} /> : null}
      </View>
      <Tappable
        onPress={onEmergency}
        accessibilityRole="button"
        accessibilityLabel={`${O.t.hSos}. ${O.t.hSosSub}`}
        style={{ minHeight: 56, borderRadius: 12, backgroundColor: C.dangerWash, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <Icon name="phone" size={20} color={C.dangerInk} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.dangerInk }}>{O.t.hSos}</Text>
          <Text style={{ fontSize: 13, color: C.dangerInk }}>{O.t.hSosSub}</Text>
        </View>
      </Tappable>
      <Btn kind="ghost" label={O.c.close} onPress={onClose} />
    </ModalSheet>
  );
}

/** The issue type each report chip files (index-aligned with `O.t.rp`). */
export const REPORT_ISSUE_TYPES = ["wrong_item", "wrong_item", "damaged", "damaged", "rider_conduct", "other"] as const;
const ASKS_WHICH = new Set([0, 1, 2]);

/** T16b — "What went wrong?": one type, "Which items?" for item problems, "What happened?", Send to our team. */
export function ReportSheet({
  visible,
  items,
  onSend,
  onClose,
}: {
  visible: boolean;
  items: string[];
  onSend: (typeIndex: number, which: string[], text: string) => Promise<boolean>;
  onClose: () => void;
}): React.ReactElement {
  const [type, setType] = useState<number | null>(null);
  const [which, setWhich] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const close = (): void => {
    onClose();
    setType(null);
    setWhich([]);
    setText("");
  };
  const send = (): void => {
    if (type == null || sending) return;
    setSending(true);
    void onSend(
      type,
      which.map((i) => items[i]!).filter(Boolean),
      text.trim(),
    )
      .then((ok) => {
        if (ok) close();
      })
      .finally(() => setSending(false));
  };
  return (
    <ModalSheet visible={visible} onClose={close}>
      <StageTitle>{O.t.rpT}</StageTitle>
      <Chips list={O.t.rp} on={type == null ? [] : [type]} onToggle={(i) => setType((c) => (c === i ? null : i))} />
      {type != null && ASKS_WHICH.has(type) && items.length ? (
        <>
          <Text style={{ fontSize: 13, fontWeight: "600", color: C.muted }}>{O.t.rpWhich}</Text>
          <Chips list={items} on={which} onToggle={(i) => setWhich((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))} />
        </>
      ) : null}
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        maxLength={900}
        placeholder={O.t.rpPh}
        placeholderTextColor={C.muted}
        accessibilityLabel={O.t.rpMore}
        style={{ minHeight: 64, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: C.ink, textAlignVertical: "top" }}
      />
      <Btn label={O.t.rpSend} onPress={send} disabled={type == null} loading={sending} />
    </ModalSheet>
  );
}

/** One schedule slot as the sheet draws it (the API's `ScheduleSlot`). */
export interface SlotView {
  start: string;
  label: string;
  full: boolean;
}

/**
 * T13a "Change time" → the R5a schedule sheet (`of-screens-rt.js` `schedSheet`): "When should it
 * arrive?" · the Today / Tomorrow segmented control · 2-column 44 slot chips (selected = mint + check,
 * full = surface + "· Full", not pickable) · the muted lead line · "Arrive {slot}". Only the slots the
 * venue can still meet are listed (the server's answer); a day with none draws no chips.
 */
export function ChangeTimeSheet({
  visible,
  venue,
  making,
  today,
  tomorrow,
  current,
  busy,
  onSave,
  onClose,
}: {
  visible: boolean;
  venue: string;
  /** `O.svc[s].making`, lower case ("cooking" / "packing"). */
  making: string;
  today: readonly SlotView[];
  tomorrow: readonly SlotView[];
  /** The order's slot start — preselected. */
  current: string | null;
  busy: boolean;
  onSave: (slot: SlotView, day: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const inTomorrow = current != null && tomorrow.some((s) => s.start === current);
  const [day, setDay] = useState<"today" | "tomorrow">(inTomorrow || today.length === 0 ? "tomorrow" : "today");
  const [picked, setPicked] = useState<string | null>(current);
  const list = day === "today" ? today : tomorrow;
  const sel = [...today, ...tomorrow].find((s) => s.start === picked) ?? null;
  const selDay = sel && tomorrow.some((s) => s.start === sel.start) ? O.r.tomorrow : O.r.today;
  return (
    <ModalSheet visible={visible} onClose={onClose}>
      <StageTitle>{O.r.schT}</StageTitle>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: C.surface, borderRadius: tokens.radius.pill, padding: 3, gap: 3 }}>
        {(["today", "tomorrow"] as const).map((d) => {
          const on = day === d;
          return (
            <Tappable
              key={d}
              onPress={() => setDay(d)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, minHeight: tokens.touchTargetMin, borderRadius: tokens.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.cta : "transparent" }}
            >
              <Text style={{ fontSize: 14, fontWeight: on ? "800" : "600", color: on ? C.onAccent : C.ink }}>{d === "today" ? O.r.today : O.r.tomorrow}</Text>
            </Tappable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {list.map((s) => {
          const on = s.start === picked;
          return (
            <Tappable
              key={s.start}
              onPress={() => setPicked(s.start)}
              disabled={s.full}
              accessibilityRole="radio"
              accessibilityLabel={s.full ? `${s.label} · ${O.r.slotFull}` : s.label}
              accessibilityState={{ checked: on, disabled: s.full }}
              style={{
                width: "48.5%",
                minHeight: tokens.touchTargetMin,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                borderRadius: tokens.radius.pill,
                borderWidth: on ? 1.5 : 1,
                borderColor: on ? C.accentText : s.full ? C.surface : C.line,
                backgroundColor: on ? C.accentWash : s.full ? C.surface : C.bg,
              }}
            >
              {on ? <Icon name="check" size={14} color={C.accentText} /> : null}
              <Text style={{ fontSize: 13, fontWeight: on ? "700" : "600", color: on ? C.accentText : s.full ? C.muted : C.ink, fontVariant: ["tabular-nums"] }}>
                {s.full ? `${s.label} · ${O.r.slotFull}` : s.label}
              </Text>
            </Tappable>
          );
        })}
      </View>
      <Mut>{ofFmt(O.r.schNote, { v: venue, making })}</Mut>
      <Btn
        label={ofFmt(O.r.schSave, { s: sel ? `${selDay.toLowerCase()} ${sel.label}` : "" }).trim()}
        disabled={!sel || sel.start === current}
        loading={busy}
        onPress={() => (sel ? onSave(sel, selDay) : undefined)}
      />
    </ModalSheet>
  );
}
