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
